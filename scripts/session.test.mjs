import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from '../website/session.js';

function storage() { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }

test('concurrent expired-session requests share a refresh and rotate tokens', async () => {
  let calls = 0;
  const sessions = createSessionManager({ storage: storage(), request: async (path, body) => {
    calls++;
    assert.equal(path, 'token?grant_type=refresh_token');
    assert.equal(body.refresh_token, 'refresh-old');
    return { access_token: 'new', refresh_token: 'refresh-new', expires_in: 3600 };
  } });
  sessions.save({ access_token: 'old', refresh_token: 'refresh-old', expires_at: 1 });
  assert.deepEqual(await Promise.all([sessions.accessToken(), sessions.accessToken(), sessions.accessToken()]), ['new', 'new', 'new']);
  assert.equal(calls, 1);
  assert.equal(sessions.read().refresh_token, 'refresh-new');
  assert.equal(await sessions.accessToken(), 'new');
  assert.equal(calls, 1);
});

test('failed refresh clears the session and signs out once', async () => {
  let expired = 0;
  const sessions = createSessionManager({ storage: storage(), request: async () => { throw new Error('Expired'); }, onExpired: () => expired++ });
  sessions.save({ access_token: 'old', refresh_token: 'refresh', expires_at: 1 });
  const results = await Promise.allSettled([sessions.accessToken(), sessions.accessToken()]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(sessions.read(), null);
  assert.equal(expired, 1);
});

test('a refresh that finishes after sign-out cannot restore the session', async () => {
  let finish;
  const sessions = createSessionManager({ storage: storage(), request: () => new Promise(resolve => { finish = resolve; }) });
  sessions.save({ access_token: 'old', refresh_token: 'refresh', expires_at: 1 });
  const pending = sessions.accessToken();
  sessions.clear();
  finish({ access_token: 'late', refresh_token: 'refresh-late', expires_in: 3600 });
  await assert.rejects(pending, /signed out/);
  assert.equal(sessions.read(), null);
});

test('a delayed refresh cannot overwrite a newer sign-in', async () => {
  let finish;
  const sessions = createSessionManager({ storage: storage(), request: () => new Promise(resolve => { finish = resolve; }) });
  sessions.save({ access_token: 'old', refresh_token: 'old-refresh', expires_at: 1 });
  const pending = sessions.accessToken();
  sessions.save({ access_token: 'new-login', refresh_token: 'new-login-refresh', expires_in: 3600 });
  finish({ access_token: 'stale-refresh', refresh_token: 'stale-refresh-token', expires_in: 3600 });
  await assert.rejects(pending, /signed out/);
  assert.equal(sessions.read().access_token, 'new-login');
});
