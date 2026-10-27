import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

test('SQL migrations, vector tenant isolation, RLS, allowances, and cascade deletion', async t => {
  const db = new PGlite({ extensions: { vector } });
  const ownerA = '11111111-1111-4111-8111-111111111111';
  const ownerB = '11111111-1111-4111-8111-111111111112';
  const businessA = '22222222-2222-4222-8222-222222222221';
  const businessB = '22222222-2222-4222-8222-222222222222';
  const docA = '33333333-3333-4333-8333-333333333331';
  const docB = '33333333-3333-4333-8333-333333333332';
  const docPending = '33333333-3333-4333-8333-333333333333';
  const embedding = `[${[1, ...Array(767).fill(0)].join(',')}]`;
  const allowance = async (business, chat, minute = 5, totalMinute = 30, month = 1000) => (await db.query('select public.consume_chat_allowance($1, $2, $3, $4, $5) as result', [business, chat, minute, totalMinute, month])).rows[0].result;
  try {
    await db.exec(`
      create schema auth;
      create schema extensions;
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth, extensions to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      set search_path = public, extensions;
    `);
    await t.test('all migrations execute on PostgreSQL with pgvector', async () => {
      for (const name of ['0001_initial.sql', '0002_telegram_bots.sql', '0003_workspace_release.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
      await db.exec(await readFile(new URL('../supabase/migrations/0003_workspace_release.sql', import.meta.url), 'utf8'));
    });
    await db.query('insert into auth.users(id) values ($1), ($2)', [ownerA, ownerB]);
    await db.query('insert into public.businesses(id, owner_id, name) values ($1, $2, $3), ($4, $5, $6)', [businessA, ownerA, 'Studio A', businessB, ownerB, 'Studio B']);
    await db.query("insert into public.documents(id, business_id, file_id, file_name, status) values ($1,$2,'a','a.txt','ready'),($3,$4,'b','b.txt','ready'),($5,$2,'pending','pending.txt','processing')", [docA, businessA, docB, businessB, docPending]);
    for (const [document, business] of [[docA, businessA], [docB, businessB], [docPending, businessA]]) await db.query('insert into public.document_chunks(document_id,business_id,content,embedding) values ($1,$2,$3,$4)', [document, business, 'Class costs $35.', embedding]);
    await t.test('vector retrieval returns only ready documents from the requested tenant', async () => {
      await db.exec('set role service_role');
      const found = await db.query('select * from public.match_document_chunks($1,$2,6)', [embedding, businessA]);
      assert.deepEqual(found.rows.map(row => row.document_id), [docA]);
      assert.equal(found.rows[0].similarity, 1);
      await db.exec('reset role');
    });
    await t.test('RLS restricts reads and rejects direct writes and privileged function calls', async () => {
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${ownerA}'`);
      assert.deepEqual((await db.query('select id from public.businesses')).rows.map(row => row.id), [businessA]);
      assert.deepEqual((await db.query('select id from public.documents order by id')).rows.map(row => row.id), [docA, docPending]);
      await assert.rejects(db.query("update public.documents set status='ready' where id=$1", [docPending]), /permission denied/);
      await assert.rejects(allowance(businessB, 'intruder'), /permission denied/);
      await assert.rejects(db.query('select * from public.match_document_chunks($1,$2,6)', [embedding, businessB]), /permission denied/);
      assert.equal((await db.query('select * from public.telegram_bots')).rows.length, 0);
      assert.equal((await db.query('select * from public.message_usage')).rows.length, 0);
      await db.exec('reset role');
    });
    await t.test('per-chat and workspace minute limits do not overcount rejected requests', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await allowance(businessA, 'web:one')).allowed, true);
      assert.deepEqual(await allowance(businessA, 'web:one'), { allowed: false, reason: 'minute' });
      assert.equal((await allowance(businessA, 'web:two', 5, 5)).allowed, false);
      const usage = (await db.query('select question_count from public.message_usage where business_id=$1', [businessA])).rows[0];
      assert.equal(usage.question_count, 5);
    });
    await t.test('monthly allowance aggregates chats and starts a new UTC month independently', async () => {
      await db.query("insert into public.message_usage(business_id,month,question_count) values ($1,(date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date,1000)", [businessB]);
      for (let i = 0; i < 3; i++) assert.equal((await allowance(businessB, `chat:${i}`, 5, 30, 3)).allowed, true);
      assert.deepEqual(await allowance(businessB, 'another-chat', 5, 30, 3), { allowed: false, reason: 'monthly' });
    });
    await t.test('document deletion cascades through indexed passages', async () => {
      await db.query('delete from public.documents where id=$1', [docA]);
      assert.equal((await db.query('select id from public.document_chunks where document_id=$1', [docA])).rows.length, 0);
      assert.equal((await db.query('select id from public.document_chunks where document_id=$1', [docB])).rows.length, 1);
    });
  } finally { await db.close(); }
});
