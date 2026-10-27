import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';

loadEnv();
let failures = 0;
function report(ok, message) { console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`); if (!ok) failures++; }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY'];
for (const name of required) report(Boolean(process.env[name]?.trim() && !process.env[name].trim().startsWith('<')), `${name} configured`);
if (!failures) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) } });
  for (const [table, columns] of [['businesses', 'id,name'], ['documents', 'id,chunk_count,error_message,index_started_at'], ['conversations', 'id,sources'], ['unanswered_questions', 'id'], ['telegram_bots', 'business_id'], ['message_usage', 'month,question_count']]) {
    try {
      const result = await db.from(table).select(columns).limit(0);
      report(!result.error, `${table} schema${result.error ? ' — apply the SQL migrations' : ''}`);
    } catch { report(false, `${table} reachable`); }
  }
  try {
    const bucket = await db.storage.getBucket('documents');
    report(!bucket.error && bucket.data?.public === false && Number(bucket.data?.file_size_limit) === 10 * 1024 * 1024, 'Private documents bucket with 10 MiB limit');
  } catch { report(false, 'Storage reachable'); }
  try {
    const schema = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/openapi+json' }, signal: AbortSignal.timeout(15000) });
    const specification = await schema.json();
    report(schema.ok && Boolean(specification.paths?.['/rpc/consume_chat_allowance']?.post), 'Atomic question allowance function available');
  } catch { report(false, 'Allowance function reachable'); }
  const hook = process.env.TELEGRAM_WEBHOOK_BASE_URL;
  try { const url = new URL(hook); report(url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password && !url.host.includes('<'), 'Telegram public HTTPS origin configured'); }
  catch { report(false, 'Telegram public HTTPS origin configured (required for Telegram)'); }
}
console.log(failures ? `\n${failures} release check(s) need attention. See docs/DEPLOYMENT.md.` : '\nConfiguration checks passed. Run npm run check for local verification.');
process.exitCode = failures ? 1 : 0;
