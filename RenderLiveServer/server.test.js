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
