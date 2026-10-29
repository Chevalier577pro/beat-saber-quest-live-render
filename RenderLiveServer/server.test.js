'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { test } = require('node:test');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createApp } = require('./server');

const secret = 'test-secret-with-more-than-20-characters';

test('Render relay authenticates and transports RTMP bytes both ways', async (t) => {
  const backend = net.createServer((socket) => {
    socket.on('data', (data) => socket.write(Buffer.from(data).reverse()));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  t.after(() => backend.close());

  const app = createApp({ secret, rtmpPort: backend.address().port });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.address().port}`;

  assert.equal((await fetch(base + '/health')).status, 200);
  const unauthorized = new WebSocket(base.replace('http:', 'ws:') + '/ingest');
  const [error] = await once(unauthorized, 'error');
  assert.match(error.message, /401/);

  const websocket = new WebSocket(base.replace('http:', 'ws:') + '/ingest', {
    headers: { Authorization: `Bearer ${secret}` },
  });
  await once(websocket, 'open');
  t.after(() => websocket.terminate());
  assert.deepEqual(await (await fetch(base + '/api/status')).json(), { publishing: true });
  websocket.send(Buffer.from('rtmp handshake'));
  const [message] = await once(websocket, 'message');
  assert.equal(Buffer.from(message).toString(), 'ekahsdnah pmtr');
  websocket.close();
  await once(websocket, 'close');
  assert.deepEqual(await (await fetch(base + '/api/status')).json(), { publishing: false });
});

test('the watch page serves its assets and the live HLS path', async (t) => {
  const backend = net.createServer();
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  t.after(() => backend.close());
  const hls = http.createServer((_request, response) => response.end('#EXTM3U'));
  hls.listen(0, '127.0.0.1');
  await once(hls, 'listening');
  t.after(() => hls.close());
  const app = createApp({ secret, rtmpPort: backend.address().port, hlsPort: hls.address().port });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.match(await (await fetch(base)).text(), /Beat Saber/);
  assert.equal((await fetch(base + '/hls.min.js')).status, 200);
  assert.equal(await (await fetch(base + '/media/live/quest/index.m3u8')).text(), '#EXTM3U');
  assert.equal((await fetch(base + '/media/live/../../admin')).status, 404);
});

test('the HLS proxy preserves the MediaMTX cookieCheck handshake', async (t) => {
  const backend = net.createServer();
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  t.after(() => backend.close());

  let seenCookie;
  const hls = http.createServer((request, response) => {
    seenCookie = request.headers.cookie;
    const url = new URL(request.url, 'http://media');
    if (url.searchParams.get('cookieCheck') !== '1') {
      response.writeHead(302, {
        Location: url.pathname + '?cookieCheck=1',
        'Set-Cookie': 'cookieCheck=1; HttpOnly; Secure; SameSite=None; Partitioned',
      });
      return response.end();
    }
    response.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
    response.end('#EXTM3U\nvideo1_stream.m3u8?session=abc\n');
  });
  hls.listen(0, '127.0.0.1');
  await once(hls, 'listening');
  t.after(() => hls.close());

  const app = createApp({ secret, rtmpPort: backend.address().port, hlsPort: hls.address().port });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.address().port}`;

  // The redirect must stay usable: Location re-pointed at the public /media
  // prefix, and the Set-Cookie that starts the viewer session must survive.
  const redirect = await fetch(base + '/media/live/quest/index.m3u8', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/media/live/quest/index.m3u8?cookieCheck=1');
  assert.match(redirect.headers.get('set-cookie') ?? '', /cookieCheck=1/);

  // The query string reaches the media server, otherwise the handshake loops.
  const playlist = await fetch(base + '/media/live/quest/index.m3u8?cookieCheck=1');
  assert.equal(playlist.status, 200);
  assert.match(await playlist.text(), /session=abc/);

  // The viewer session cookie reaches the media server on later requests.
  seenCookie = undefined;
  await fetch(base + '/media/live/quest/index.m3u8?cookieCheck=1', {
    headers: { Cookie: 'hlsSession=abc' },
  });
  assert.equal(seenCookie, 'hlsSession=abc');
});
