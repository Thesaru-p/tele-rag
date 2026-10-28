import test from 'node:test';
import assert from 'node:assert/strict';

test('nested Vercel entrypoints exist and return authenticated API JSON', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const routes = [
    ['../api/documents/upload-url.mjs', '/api/documents/upload-url', 'POST'],
    ['../api/documents/finalize-upload.mjs', '/api/documents/finalize-upload', 'POST'],
    ['../api/documents/[id].mjs', `/api/documents/${id}`, 'DELETE'],
    ['../api/documents/[id]/reindex.mjs', `/api/documents/${id}/reindex`, 'POST'],
    ['../api/unanswered/[id].mjs', `/api/unanswered/${id}`, 'DELETE'],
  ];
  for (const [entrypoint, url, method] of routes) {
    const { default: handler } = await import(entrypoint);
    const res = {
      status: 0, headers: {}, body: '',
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { this.body = body; },
    };
    await handler({ url, method, headers: {} }, res);
    assert.equal(res.status, 401, url);
    assert.match(res.headers['Content-Type'], /application\/json/, url);
    assert.deepEqual(JSON.parse(res.body), {error: 'Sign in to continue.'}, url);
  }
});
