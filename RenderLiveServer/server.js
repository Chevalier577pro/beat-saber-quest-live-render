'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { WebSocket, WebSocketServer, createWebSocketStream } = require('ws');

// An activity snapshot larger than this is refused rather than buffered.
const MAX_PRESENCE_CHARS = 8192;
// Without a refresh the snapshot is stale: the companion stopped reporting.
const PRESENCE_TTL_MS = 30_000;

const publicDir = path.join(__dirname, 'public');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/player.js', ['player.js', 'text/javascript; charset=utf-8']],
  ['/hls.min.js', [path.join(__dirname, 'node_modules/hls.js/dist/hls.min.js'), 'text/javascript; charset=utf-8']],
]);

function authorized(header, secret) {
  if (!header || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function rejectUpgrade(socket, code, message) {
  socket.end(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function createApp({ secret, rtmpPort = 1935, hlsPort = 8888, mediaHost = '127.0.0.1' }) {
  if (typeof secret !== 'string' || secret.length < 20) {
    throw new Error('STREAM_KEY must contain at least 20 characters');
  }
  let publisher = null;
  // The latest activity snapshot forwarded by the companion. It mirrors what
  // Discord shows, so the watch page can display the same thing.
  let presence = null;
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 65536 });

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');

    // The companion forwards the current activity here. Writing is restricted to
    // the holder of STREAM_KEY; reading is public because the watch page is.
    if (request.method === 'POST' && url.pathname === '/api/presence') {
      if (!authorized(request.headers.authorization, secret)) {
        response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return response.end('{"status":"error","error":"unauthorized"}');
      }
      let body = '';
      let overflow = false;
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        if (overflow) return;
        body += chunk;
        if (body.length > MAX_PRESENCE_CHARS) {
          overflow = true;
          body = '';
        }
      });
      request.on('error', () => response.destroy());
      request.on('end', () => {
        if (overflow) {
          response.writeHead(413, { 'Cache-Control': 'no-store' });
          return response.end();
        }
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (error) {
          response.writeHead(400, { 'Cache-Control': 'no-store' });
          return response.end();
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          response.writeHead(400, { 'Cache-Control': 'no-store' });
          return response.end();
        }
        presence = { receivedAt: Date.now(), body: parsed };
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
      });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      return response.end();
    }
    if (url.pathname === '/health') {
      const probe = net.connect({ host: mediaHost, port: rtmpPort });
      probe.setTimeout(2000);
      let done = false;
      const finish = (code) => {
        if (done) return;
        done = true;
        probe.destroy();
        response.writeHead(code, { 'Cache-Control': 'no-store' });
        response.end(code === 200 ? 'ok' : 'media server unavailable');
      };
      probe.once('connect', () => finish(200));
      probe.once('error', () => finish(503));
      probe.once('timeout', () => finish(503));
      return;
    }
    if (url.pathname === '/api/status') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return response.end(JSON.stringify({ publishing: publisher !== null }));
    }
    if (url.pathname === '/api/presence') {
      const fresh = presence !== null && Date.now() - presence.receivedAt <= PRESENCE_TTL_MS;
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return response.end(JSON.stringify({
        publishing: publisher !== null,
        presence: fresh ? presence.body : null,
        updatedAt: fresh ? presence.receivedAt : null,
      }));
    }
    if (url.pathname.startsWith('/media/')) {
      // Only the one public live path is readable. Keep the media server API private.
      const suffix = url.pathname.slice('/media/'.length);
      if (!/^live\/quest\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(suffix) || suffix.includes('..')) {
        response.writeHead(404);
        return response.end();
      }
      // MediaMTX (>= 1.18) hands HLS viewers a three-part handshake: a 302 whose
      // Location carries ?cookieCheck=1, a Set-Cookie, and a per-viewer session
      // identifier that travels either in a cookie or in a ?session= query on the
      // playlist and segment URLs. Every one of those has to survive this proxy,
      // otherwise the player receives an unusable 302 and can never load a
      // playlist even while the Quest is publishing.
      const upstreamHeaders = {};
      if (request.headers.cookie) upstreamHeaders.cookie = request.headers.cookie;
      const upstream = http.get({
        host: mediaHost,
        port: hlsPort,
        path: '/' + suffix + (url.search || ''),
        headers: upstreamHeaders,
      }, (media) => {
        const outgoing = {
          'Content-Type': media.headers['content-type'] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        };
        // Location is an absolute path on the private media server; re-add the
        // public /media prefix so the browser redirects to a reachable URL.
        const location = media.headers.location;
        if (location) {
          outgoing.Location = location.startsWith('http') || location.startsWith('/media/')
            ? location
            : '/media' + (location.startsWith('/') ? location : '/' + location);
        }
        if (media.headers['set-cookie']) outgoing['Set-Cookie'] = media.headers['set-cookie'];
        response.writeHead(media.statusCode || 502, outgoing);
        media.pipe(response);
      });
      upstream.once('error', () => {
        if (!response.headersSent) response.writeHead(503);
        response.end();
      });
      response.once('close', () => upstream.destroy());
      return;
    }
    const item = files.get(url.pathname);
    if (!item) {
      response.writeHead(404);
      return response.end();
    }
    const file = path.isAbsolute(item[0]) ? item[0] : path.join(publicDir, item[0]);
    response.writeHead(200, {
      'Content-Type': item[1],
      'Cache-Control': item[0].endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; media-src 'self' blob:; img-src 'self' data: https:; connect-src 'self'; script-src 'self'; style-src 'self'",
    });
    fs.createReadStream(file).pipe(response);
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/ingest') return rejectUpgrade(socket, 404, 'Not Found');
    if (!authorized(request.headers.authorization, secret)) return rejectUpgrade(socket, 401, 'Unauthorized');
    if (publisher !== null) return rejectUpgrade(socket, 409, 'Conflict');
    wss.handleUpgrade(request, socket, head, (ws) => {
      publisher = ws;
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws) => {
    const media = net.connect({ host: mediaHost, port: rtmpPort });
    const tunnel = createWebSocketStream(ws, { highWaterMark: 64 * 1024 });
    tunnel.pipe(media).pipe(tunnel);
    const close = () => {
      if (publisher === ws) publisher = null;
      media.destroy();
      tunnel.destroy();
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
    media.once('error', close);
    media.once('close', close);
    tunnel.once('error', close);
    ws.once('close', close);
  });

  return server;
}

if (require.main === module) {
  const server = createApp({ secret: process.env.STREAM_KEY });
  let media;
  if (process.env.START_MEDIA_SERVER !== '0') {
    media = spawn('/usr/local/bin/mediamtx', ['/app/mediamtx.yml'], { stdio: 'inherit' });
    media.once('error', (error) => {
      console.error('Media server failed:', error.message);
      process.exit(1);
    });
    media.once('exit', (code) => {
      console.error('Media server exited:', code);
      process.exit(1);
    });
  }
  server.listen(Number(process.env.PORT) || 10000, '0.0.0.0');
  process.on('SIGTERM', () => {
    server.close();
    if (media) media.kill('SIGTERM');
  });
}

module.exports = { createApp };
