// Private model egress boundary. Do not log requests, responses, or credentials.
const http = require('node:http');
const https = require('node:https');

const port = Number(process.env.PORT || 8080);
const cap = Number(process.env.INTELLIGENCE_MAX_OUTPUT_TOKENS || 4096);
const fallbackModel = (process.env.INTELLIGENCE_FALLBACK_MODEL || '').trim();
const freeOnly = process.env.INTELLIGENCE_FREE_ONLY === 'true';
const allowFreeProviderDataUse = process.env.INTELLIGENCE_ALLOW_FREE_PROVIDER_DATA_USE === 'true';
const upstream = new URL(process.env.MODEL_EGRESS_UPSTREAM || 'https://openrouter.ai');
const maxBodyBytes = 2 * 1024 * 1024;

if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(cap) || cap < 1 || cap > 16384) {
  throw new Error('Invalid model egress configuration.');
}
if (!['https:', 'http:'].includes(upstream.protocol) || (process.env.NODE_ENV !== 'test' && upstream.origin !== 'https://openrouter.ai')) {
  throw new Error('Invalid model egress upstream.');
}
if (freeOnly && fallbackModel && !fallbackModel.endsWith(':free')) {
  throw new Error('A free-only gateway cannot have a paid fallback model.');
}

const server = http.createServer((request, response) => {
  const path = new URL(request.url || '/', upstream);
  const completion = request.method === 'POST' && path.pathname === '/api/v1/chat/completions';
  const chunks = [];
  let bodyBytes = 0;
  request.on('data', (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes > maxBodyBytes) {
      response.writeHead(413).end();
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (response.writableEnded) return;
    let body = Buffer.concat(chunks);
    if (completion) {
      try {
        const payload = JSON.parse(body.toString('utf8'));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid body');
        if (freeOnly && (typeof payload.model !== 'string' || !payload.model.endsWith(':free'))) {
          response.writeHead(403, { 'content-type': 'application/json' }).end('{"error":{"message":"Only free AI routes are enabled."}}');
          return;
        }
        const requested = Number(payload.max_tokens);
        payload.max_tokens = Number.isInteger(requested) && requested > 0 ? Math.min(requested, cap) : cap;
        payload.provider = {
          ...(payload.provider && typeof payload.provider === 'object' && !Array.isArray(payload.provider) ? payload.provider : {}),
          sort: 'price', require_parameters: true,
          ...(!freeOnly || !allowFreeProviderDataUse ? { data_collection: 'deny' } : {}),
        };
        if (freeOnly && allowFreeProviderDataUse) delete payload.provider.data_collection;
        if (fallbackModel && fallbackModel !== payload.model) {
          payload.models = [fallbackModel];
          payload.route = 'fallback';
        }
        body = Buffer.from(JSON.stringify(payload));
      } catch {
        response.writeHead(400).end();
        return;
      }
    }
    const headers = { ...request.headers, host: upstream.host };
    delete headers.connection;
    delete headers['transfer-encoding'];
    if (body.length) headers['content-length'] = String(body.length);
    const transport = upstream.protocol === 'https:' ? https : http;
    const forwarded = transport.request({
      protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || undefined,
      path: `${path.pathname}${path.search}`, method: request.method, headers,
    }, (received) => {
      response.writeHead(received.statusCode || 502, received.headers);
      received.pipe(response);
    });
    forwarded.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    response.on('close', () => forwarded.destroy());
    forwarded.end(body);
  });
  request.on('error', () => { if (!response.headersSent) response.writeHead(400); response.end(); });
});

server.listen(port, '0.0.0.0');
