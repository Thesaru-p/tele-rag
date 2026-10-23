import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { buildWelcomeMessage, welcomeMessageReady } from '../website/welcome-message.js';
import { handleApi } from './api.mjs';

const documents = [
  { file_name: 'Studio_handbook.pdf', status: 'ready' },
  { file_name: 'Class-prices.csv', status: 'ready' },
];

test('welcome is available only after connection and successful indexing of every file', () => {
  assert.equal(welcomeMessageReady(true, documents), true);
  assert.equal(welcomeMessageReady(false, documents), false);
  assert.equal(welcomeMessageReady(true, []), false);
  for (const status of ['processing', 'failed']) {
    assert.equal(welcomeMessageReady(true, [...documents, { status }]), false);
  }
});

test('welcome uses ready document titles, has a useful default, and fits a Telegram description', () => {
  const text = buildWelcomeMessage({ businessName: 'The Sunday Studio', documents });
  assert.match(text, /Welcome to The Sunday Studio/);
  assert.match(text, /Class prices and Studio handbook/);
  assert.doesNotMatch(text, /\.pdf|\.csv/);
  assert.equal(text, buildWelcomeMessage({ businessName: 'The Sunday Studio', documents: [...documents].reverse() }));
  assert.match(buildWelcomeMessage({ businessName: 'My business', botUsername: 'studio_bot', documents }), /@studio_bot/);
  assert.match(buildWelcomeMessage({ documents: [{ status: 'failed', file_name: 'Secret.pdf' }] }), /still getting the information ready/);
  const long = buildWelcomeMessage({ businessName: 'x'.repeat(200), documents: Array.from({ length: 10 }, (_, i) => ({ file_name: `${i}${'y'.repeat(200)}.pdf`, status: 'ready' })) });
  assert.ok(long.length <= 512);
});

test('Telegram /start sends the preview without generating an AI answer, and preserves retry protection', async t => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://welcome-test.supabase.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(process.env.SUPABASE_SERVICE_ROLE_KEY).digest(), iv);
  const encrypted = Buffer.concat([cipher.update('test-only-bot-token', 'utf8'), cipher.final()]);
  const token = [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
  const secret = 's'.repeat(43);
  const sent = [];
  const claimed = new Set();
  let currentDocuments = documents;
  let failSend = false;
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.telegram.org') {
      assert.ok(url.pathname.endsWith('/sendMessage'));
      if (failSend) return reply({ ok: false, description: 'Temporary send failure' }, 502);
      sent.push(JSON.parse(options.body));
      return reply({ ok: true, result: {} });
    }
    assert.equal(url.hostname, 'welcome-test.supabase.invalid');
    const table = url.pathname.split('/').at(-1);
    if (table === 'telegram_bots') return reply([{ business_id: 'business-1', encrypted_token: token, bot_username: 'studio_bot' }]);
    if (table === 'businesses') {
      assert.equal(url.searchParams.get('id'), 'eq.business-1');
      return reply({ name: 'The Sunday Studio' });
    }
    if (table === 'documents') {
      assert.equal(url.searchParams.get('business_id'), 'eq.business-1');
      return reply(currentDocuments);
    }
    if (table === 'processed_updates') {
      if (options.method === 'DELETE') {
        claimed.delete(url.searchParams.get('update_id').replace(/^eq\./, ''));
        return new Response(null, { status: 204 });
      }
      const update = JSON.parse(options.body);
      if (claimed.has(update.update_id)) return reply({ code: '23505', message: 'Duplicate update' }, 409);
      claimed.add(update.update_id);
      return new Response(null, { status: 201 });
    }
    assert.fail(`Unexpected dependency in welcome path: ${table}`);
  };
  const deliver = async (text, updateId) => {
    const response = { status: 0, value: null, writeHead(code) { this.status = code; }, end(body) { this.value = JSON.parse(body); } };
    await handleApi({ url: `/api/telegram/webhook/${secret}`, method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: { update_id: updateId, message: { text, chat: { id: 123 } } } }, response);
    return response;
  };
  try {
    await t.test('plain start matches the copyable preview', async () => {
      assert.equal((await deliver('/start', 1)).status, 200);
      assert.deepEqual(sent.at(-1), { chat_id: 123, text: buildWelcomeMessage({ businessName: 'The Sunday Studio', botUsername: 'studio_bot', documents }) });
      await deliver('/start', 1);
      assert.equal(sent.length, 1);
    });
    await t.test('deep links and addressed start commands work; other commands are ignored', async () => {
      await deliver('/start referral', 2);
      await deliver('/start@STUDIO_bot', 3);
      assert.equal(sent.length, 3);
      await deliver('/start@other_bot', 4);
      await deliver('/startled', 5);
      await deliver('/help', 6);
      assert.equal(sent.length, 3);
    });
    await t.test('unindexed files get an honest setup message', async () => {
      currentDocuments = [{ file_name: 'Not-ready.pdf', status: 'processing' }];
      await deliver('/start', 7);
      assert.match(sent.at(-1).text, /still getting the information ready/);
      currentDocuments = documents;
    });
    await t.test('a failed delivery releases the claim so Telegram can retry', async () => {
      failSend = true;
      assert.equal((await deliver('/start', 8)).status, 502);
      assert.equal(claimed.has('telegram:8'), false);
      failSend = false;
      assert.equal((await deliver('/start', 8)).status, 200);
      assert.equal(claimed.has('telegram:8'), true);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
