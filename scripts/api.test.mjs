import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { handleApi, chunkText, extractText } from './api.mjs';
import { mockServices, businessId, documentId } from './test-support/mock-services.mjs';

process.env.SUPABASE_URL = 'https://release-test.supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-role-key';
process.env.SUPABASE_ANON_KEY = 'test-only-public-key';
process.env.OPENROUTER_API_KEY = 'test-only-ai-key';

async function call(path, method = 'GET', body, token = 'test-access') {
  const res = { status: 0, value: null, headers: {}, writeHead(code, headers) { this.status = code; this.headers = headers; }, end(raw) { this.value = JSON.parse(raw); } };
  await handleApi({ url: path, method, body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  return res;
}

test('document extraction keeps paragraph breaks and handles empty and overlapping chunks', async () => {
  assert.deepEqual(chunkText(' \u0000\n\t '), []);
  const text = 'A sentence about pottery classes. '.repeat(100);
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 701));
  assert.ok(chunks[0].includes(chunks[1].slice(0, 50)));
  const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:p><w:t>Clay &amp; tools</w:t></w:p><w:p><w:t>Included</w:t></w:p></w:document>') });
  assert.equal(await extractText({ buffer: docx }, 'docx'), 'Clay & tools\nIncluded\n');
  const encoded = zipSync({ 'word/document.xml': strToU8('<w:p><w:t>&amp;lt; &#163; &#x1F600;</w:t></w:p>') });
  assert.equal(await extractText({ buffer: encoded }, 'docx'), '&lt; £ 😀\n');
  await assert.rejects(extractText({ buffer: zipSync({ 'other.xml': strToU8('none') }) }, 'docx'), /readable document body/);
});

test('authenticated API, uploads, tenant boundaries, grounding, review, and limits', async t => {
  const originalFetch = globalThis.fetch;
  const fixture = mockServices();
  globalThis.fetch = fixture.fetch;
  try {
    await t.test('requires a verified session and exposes only public config', async () => {
      assert.equal((await call('/api/documents', 'GET', undefined, null)).status, 401);
      assert.equal((await call('/api/documents', 'GET', undefined, 'invalid')).status, 401);
      const config = await call('/api/config');
      assert.deepEqual(Object.keys(config.value).sort(), ['supabaseAnonKey', 'supabaseUrl']);
      assert.equal(JSON.stringify(config.value).includes(process.env.SUPABASE_SERVICE_ROLE_KEY), false);
    });
    await t.test('rejects malformed bodies, bad types, oversized uploads, and invalid settings', async () => {
      for (const body of ['[]', 'null', '{broken']) assert.equal((await call('/api/chat', 'POST', body)).status, 400);
      assert.equal((await call('/api/chat', 'POST', { question: 'x'.repeat(33000) })).status, 413);
      assert.equal((await call('/api/chat', 'POST', { question: 123 })).status, 400);
      assert.equal((await call('/api/chat', 'POST', { question: 'x'.repeat(1001) })).status, 400);
      assert.equal((await call('/api/documents/upload-url', 'POST', { name: 'program.exe', size: 10 })).status, 415);
      assert.equal((await call('/api/documents/upload-url', 'POST', { name: 'notes.txt', size: 11 * 1024 * 1024 })).status, 413);
      assert.equal((await call('/api/business', 'PATCH', { name: '   ' })).status, 400);
    });
    await t.test('scopes document deletion and uploads to the authenticated business', async () => {
      const other = { ...fixture.data.documents[0], id: '44444444-4444-4444-8444-444444444444', business_id: 'another-business' };
      fixture.data.documents.push(other);
      assert.equal((await call(`/api/documents/${other.id}`, 'DELETE')).status, 404);
      assert.ok(fixture.data.documents.includes(other));
      assert.equal((await call('/api/documents/finalize-upload', 'POST', { name: 'notes.txt', path: 'another-business/notes.txt' })).status, 403);
      const listed = await call('/api/documents');
      assert.deepEqual(listed.value.map(doc => doc.id), [documentId]);
    });
    await t.test('answers with selected citations and stores conversation sources', async () => {
      const answer = await call('/api/chat', 'POST', { question: 'How much is a class?' });
      assert.equal(answer.status, 200);
      assert.equal(answer.value.supported, true);
      assert.deepEqual(answer.value.sources, ['Studio handbook.txt']);
      assert.deepEqual(fixture.data.conversations.at(-1).sources, answer.value.sources);
      const retrieval = fixture.calls.find(call => call.url.pathname.endsWith('/rpc/match_document_chunks'));
      assert.equal(retrieval.body.match_business_id, businessId);
    });
    await t.test('logs unsupported answers even when retrieval returned relevant passages', async () => {
      fixture.generated = { answer: 'I do not know.', supported: false, source_ids: [] };
      const answer = await call('/api/chat', 'POST', { question: 'Do you ship overseas?' });
      assert.equal(answer.value.answer, fixture.generated.answer);
      assert.deepEqual(answer.value.sources, []);
      assert.equal(fixture.data.unanswered_questions.at(-1).question, 'Do you ship overseas?');
      fixture.generated = { answer: 'Invented answer', supported: true, source_ids: [999] };
      assert.equal((await call('/api/chat', 'POST', { question: 'An invalid citation?' })).value.supported, false);
    });
    await t.test('avoids AI calls without ready documents and respects allowances before spending', async () => {
      fixture.data.documents[0].status = 'failed';
      const before = fixture.calls.filter(call => call.url.hostname === 'openrouter.ai').length;
      assert.equal((await call('/api/chat', 'POST', { question: 'Anything ready?' })).value.supported, false);
      assert.equal(fixture.calls.filter(call => call.url.hostname === 'openrouter.ai').length, before);
      fixture.allowed = false;
      const limited = await call('/api/chat', 'POST', { question: 'Too many questions?' });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers['Retry-After'], '60');
      assert.equal(fixture.calls.filter(call => call.url.hostname === 'openrouter.ai').length, before);
      fixture.allowed = true;
      fixture.data.documents[0].status = 'ready';
    });
    await t.test('dashboard and reviewed questions stay within the business', async () => {
      fixture.data.unanswered_questions.push({ id: '55555555-5555-4555-8555-555555555555', business_id: 'another-business', question: 'Private question' });
      const dashboard = await call('/api/dashboard');
      assert.equal(dashboard.status, 200);
      assert.equal(dashboard.value.documents, 1);
      assert.ok(dashboard.value.unanswered.every(row => row.question !== 'Private question'));
      const id = dashboard.value.unanswered[0].id;
      assert.equal((await call(`/api/unanswered/${id}`, 'DELETE')).status, 200);
      assert.equal(fixture.data.unanswered_questions.some(row => row.id === id), false);
    });
    await t.test('registers and indexes a direct upload, rejects duplicates, and deletes the stored file', async () => {
      const path = `${businessId}/66666666-6666-4666-8666-666666666666-prices.txt`;
      fixture.files.set(path, Buffer.from('The class costs $35.'));
      const uploaded = await call('/api/documents/finalize-upload', 'POST', { name: 'prices.txt', path });
      assert.equal(uploaded.status, 201);
      assert.equal(uploaded.value.chunks, 1);
      assert.equal(fixture.data.documents.find(doc => doc.id === uploaded.value.id).status, 'ready');
      assert.equal((await call('/api/documents/finalize-upload', 'POST', { name: 'prices.txt', path })).status, 409);
      assert.equal((await call(`/api/documents/${uploaded.value.id}`, 'DELETE')).status, 200);
      assert.equal(fixture.files.has(path), false);
      assert.equal(fixture.data.documents.some(doc => doc.id === uploaded.value.id), false);
    });
    await t.test('failed extraction exposes diagnostics and can be reindexed successfully', async () => {
      const path = `${businessId}/77777777-7777-4777-8777-777777777777-empty.txt`;
      fixture.files.set(path, Buffer.from('  \n '));
      const failed = await call('/api/documents/finalize-upload', 'POST', { name: 'empty.txt', path });
      assert.equal(failed.status, 422);
      const document = fixture.data.documents.find(doc => doc.file_id === path);
      assert.equal(document.status, 'failed');
      assert.match(document.error_message, /No readable text/);
      fixture.files.set(path, Buffer.from('A repaired document with readable text.'));
      assert.equal((await call(`/api/documents/${document.id}/reindex`, 'POST')).status, 200);
      assert.equal(document.status, 'ready');
      assert.equal(document.error_message, null);
      assert.equal((await call(`/api/documents/${document.id}/reindex`, 'POST')).status, 409);
    });
    await t.test('Telegram answers include sources, verify secrets, and acknowledge rate limits without retries', async () => {
      fixture.generated = { answer: 'The class is $35.', supported: true, source_ids: [1] };
      const secret = 'x'.repeat(43);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(process.env.SUPABASE_SERVICE_ROLE_KEY).digest(), iv);
      const ciphertext = Buffer.concat([cipher.update('test-bot-token'), cipher.final()]);
      fixture.data.telegram_bots.push({ business_id: businessId, bot_username: 'sunday_studio_bot', webhook_secret: secret, enabled: true, encrypted_token: [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString('base64url')).join('.') });
      const deliver = async (id, header = secret) => {
        const response = { status: 0, writeHead(code) { this.status = code; }, end(raw) { this.value = JSON.parse(raw); } };
        await handleApi({ url: `/api/telegram/webhook/${secret}`, method: 'POST', headers: { 'x-telegram-bot-api-secret-token': header }, body: { update_id: id, message: { text: 'How much is a class?', chat: { id: 123 } } } }, response);
        return response;
      };
      assert.equal((await deliver(10, 'wrong')).status, 403);
      assert.equal((await deliver(10)).status, 200);
      assert.match(fixture.sent.at(-1).text, /Sources: Studio handbook.txt/);
      const sent = fixture.sent.length;
      assert.equal((await deliver(10)).status, 200);
      assert.equal(fixture.sent.length, sent);
      fixture.allowed = false;
      assert.equal((await deliver(11)).status, 200);
      assert.match(fixture.sent.at(-1).text, /Too many questions/);
      assert.equal((await deliver(11)).status, 200);
      assert.equal(fixture.sent.length, sent + 1);
    });
  } finally { globalThis.fetch = originalFetch; }
});
