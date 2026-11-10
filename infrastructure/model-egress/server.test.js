const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fork } = require('node:child_process');
const path = require('node:path');

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

test('caps streamed and ordinary completions while forwarding other endpoints', async () => {
  const bodies = [];
  const upstream = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[]}');
      return;
    }
    const chunks = [];
    request.on('data', (part) => chunks.push(part));
    request.on('end', () => {
      if (request.url === '/api/v1/chat/completions') {
        bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.write('data: first\n\n');
        response.end('data: [DONE]\n\n');
      } else {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"data":[]}');
      }
    });
  });
  const upstreamPort = await listen(upstream);
  const portServer = http.createServer();
  const proxyPort = await listen(portServer);
  await new Promise((resolve) => portServer.close(resolve));
  const child = fork(path.join(__dirname, 'server.js'), {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(proxyPort), INTELLIGENCE_MAX_OUTPUT_TOKENS: '4096', INTELLIGENCE_FALLBACK_MODEL: 'test/fallback', MODEL_EGRESS_UPSTREAM: `http://127.0.0.1:${upstreamPort}` },
    stdio: 'ignore',
  });
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { await fetch(`http://127.0.0.1:${proxyPort}/api/v1/models`); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    assert.equal(ready, true);
    const streamed = await fetch(`http://127.0.0.1:${proxyPort}/api/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'test/model', stream: true, max_tokens: 10000 }),
    });
    assert.equal(streamed.status, 200);
    assert.equal(await streamed.text(), 'data: first\n\ndata: [DONE]\n\n');
    await fetch(`http://127.0.0.1:${proxyPort}/api/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'test/model' }),
    });
    assert.deepEqual(bodies.map((body) => body.max_tokens), [4096, 4096]);
    assert.deepEqual(bodies.map((body) => body.models), [['test/fallback'], ['test/fallback']]);
    assert.deepEqual(bodies.map((body) => body.route), ['fallback', 'fallback']);
    assert.deepEqual(bodies.map((body) => body.provider), [
      { sort: 'price', data_collection: 'deny', require_parameters: true },
      { sort: 'price', data_collection: 'deny', require_parameters: true },
    ]);
  } finally {
    child.kill();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('free-only mode rejects paid routes and omits the data-collection restriction after approval', async () => {
  const bodies = [];
  const upstream = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[]}');
      return;
    }
    const chunks = [];
    request.on('data', (part) => chunks.push(part));
    request.on('end', () => {
      bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"choices":[]}');
    });
  });
  const upstreamPort = await listen(upstream);
  const portServer = http.createServer();
  const proxyPort = await listen(portServer);
  await new Promise((resolve) => portServer.close(resolve));
  const child = fork(path.join(__dirname, 'server.js'), {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(proxyPort), INTELLIGENCE_FREE_ONLY: 'true', INTELLIGENCE_ALLOW_FREE_PROVIDER_DATA_USE: 'true', INTELLIGENCE_FALLBACK_MODEL: 'test/backup:free', MODEL_EGRESS_UPSTREAM: `http://127.0.0.1:${upstreamPort}` },
    stdio: 'ignore',
  });
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { await fetch(`http://127.0.0.1:${proxyPort}/api/v1/models`); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    assert.equal(ready, true);
    const send = (model) => fetch(`http://127.0.0.1:${proxyPort}/api/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'synthetic' }] }),
    });
    assert.equal((await send('test/paid')).status, 403);
    assert.equal((await send('test/primary:free')).status, 200);
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].model, 'test/primary:free');
    assert.deepEqual(bodies[0].models, ['test/backup:free']);
    assert.deepEqual(bodies[0].provider, { sort: 'price', require_parameters: true });
  } finally {
    child.kill();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
