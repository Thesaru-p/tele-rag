import { randomUUID } from 'node:crypto';

export const ownerId = '11111111-1111-4111-8111-111111111111';
export const businessId = '22222222-2222-4222-8222-222222222222';
export const documentId = '33333333-3333-4333-8333-333333333333';

export function mockServices() {
  const data = {
    businesses: [{ id: businessId, owner_id: ownerId, name: 'The Sunday Studio' }],
    documents: [{ id: documentId, business_id: businessId, file_id: `${businessId}/handbook.txt`, file_name: 'Studio handbook.txt', status: 'ready', chunk_count: 1, error_message: null, created_at: new Date().toISOString() }],
    document_chunks: [], conversations: [], unanswered_questions: [], telegram_bots: [], processed_updates: [], message_usage: [],
  };
  const state = { data, calls: [], files: new Map(), sent: [], allowed: true, reason: 'minute', matches: [{ id: 1, document_id: documentId, content: 'The beginner pottery class costs $35, including all materials.', similarity: 0.9 }], generated: { answer: 'The beginner pottery class is $35, including all materials.', supported: true, source_ids: [1] } };
  const json = (value, status = 200, headers = {}) => new Response(value === null ? null : JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  state.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    const headers = new Headers(options.headers);
    state.calls.push({ url, method, body });
    if (url.hostname === 'openrouter.ai') {
      if (url.pathname.endsWith('/embeddings')) return json({ data: body.input.map((_, index) => ({ index, embedding: Array(768).fill(0.1) })) });
      return json({ choices: [{ message: { content: JSON.stringify(state.generated) } }] });
    }
    if (url.hostname === 'api.telegram.org') { state.sent.push(body); return json({ ok: true, result: { username: 'sunday_studio_bot' } }); }
    if (url.hostname !== 'release-test.supabase.invalid') throw new Error(`Unexpected external service: ${url.hostname}`);
    if (url.pathname === '/auth/v1/user') return headers.get('authorization') === 'Bearer test-access' ? json({ id: ownerId, email: 'demo@example.invalid' }) : json({ message: 'Invalid token' }, 401);
    if (url.pathname.endsWith('/rpc/consume_chat_allowance')) {
      if (state.allowed) {
        const month = new Date().toISOString().slice(0, 7) + '-01';
        let usage = data.message_usage.find(row => row.business_id === body.target_business_id && row.month === month);
        if (!usage) data.message_usage.push(usage = { business_id: body.target_business_id, month, question_count: 0 });
        usage.question_count++;
      }
      return json({ allowed: state.allowed, reason: state.reason });
    }
    if (url.pathname.endsWith('/rpc/match_document_chunks')) return json(state.matches);
    if (url.pathname.includes('/storage/v1/object/upload/sign/')) return json({ url: `/object/upload/sign/documents/${url.pathname.split('/documents/')[1]}?token=test-upload-token` });
    if (url.pathname.startsWith('/storage/v1/object/documents/')) {
      const path = decodeURIComponent(url.pathname.split('/object/documents/')[1]);
      if (state.files.has(path)) return new Response(state.files.get(path));
      return json({ message: 'Not found' }, 404);
    }
    if (url.pathname === '/storage/v1/object/documents' && method === 'DELETE') { body.prefixes.forEach(path => state.files.delete(path)); return json(body.prefixes.map(name => ({ name }))); }
    const table = url.pathname.split('/').at(-1);
    if (!data[table]) throw new Error(`Unexpected table: ${table}`);
    const matches = row => [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'limit', 'on_conflict', 'columns'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('lt.')) return String(row[key]) < value.slice(3);
      if (value.startsWith('in.')) return value.slice(4, -1).split(',').map(v => v.replaceAll('"', '')).includes(String(row[key]));
      throw new Error(`Unexpected filter ${key}=${value}`);
    });
    let rows = data[table].filter(matches);
    if (method === 'POST') {
      const inputs = Array.isArray(body) ? body : [body];
      rows = inputs.map(value => ({ id: randomUUID(), created_at: new Date().toISOString(), chunk_count: 0, error_message: null, sources: [], ...value }));
      if (table === 'processed_updates' && rows.some(row => data[table].some(prior => row.update_id === prior.update_id && row.business_id === prior.business_id))) return json({ code: '23505', message: 'Duplicate update' }, 409);
      if (table === 'documents' && rows.some(row => data[table].some(prior => row.file_id === prior.file_id))) return json({ code: '23505', message: 'Duplicate file' }, 409);
      data[table].push(...rows);
    }
    if (method === 'PATCH') rows.forEach(row => Object.assign(row, body));
    if (method === 'DELETE') data[table] = data[table].filter(row => !rows.includes(row));
    const count = rows.length;
    const ordering = url.searchParams.get('order');
    if (ordering) rows.sort((a, b) => {
      for (const item of ordering.split(',')) {
        const [key, direction] = item.split('.');
        if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    if (url.searchParams.has('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')));
    const selection = url.searchParams.get('select');
    if (selection && selection !== '*') rows = rows.map(row => Object.fromEntries(selection.split(',').map(column => [column, row[column]])));
    if (headers.get('accept') === 'application/vnd.pgrst.object+json') return rows.length === 1 ? json(rows[0]) : json({ code: 'PGRST116', message: 'No row' }, 406);
    return json(method === 'HEAD' ? null : rows, 200, { 'Content-Range': `0-${Math.max(0, count - 1)}/${count}` });
  };
  return state;
}
