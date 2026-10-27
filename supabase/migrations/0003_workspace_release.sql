-- Workspace controls and atomic AI request limits. Run after 0001 and 0002.
begin;

alter table public.documents add column if not exists chunk_count integer not null default 0;
alter table public.documents add column if not exists error_message text;
alter table public.documents add column if not exists index_started_at timestamptz not null default now();
alter table public.conversations add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.chat_rate_limits add column if not exists count integer not null default 1;

update public.documents d set chunk_count = (select count(*) from public.document_chunks c where c.document_id = d.id);

create table if not exists public.message_usage (
  business_id uuid not null references public.businesses(id) on delete cascade,
  month date not null,
  question_count integer not null default 0 check (question_count >= 0),
  primary key (business_id, month)
);
alter table public.message_usage enable row level security;

create index if not exists conversations_business_date_idx on public.conversations(business_id, created_at desc);
create index if not exists unanswered_business_date_idx on public.unanswered_questions(business_id, created_at desc);
create index if not exists documents_business_idx on public.documents(business_id);

-- Writes go through the authenticated server API so clients cannot forge ready
-- documents, ownership, usage counts, or indexing state through the Data API.
drop policy if exists "owners manage businesses" on public.businesses;
drop policy if exists "owners manage documents" on public.documents;
drop policy if exists "owners read businesses" on public.businesses;
create policy "owners read businesses" on public.businesses for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owners read documents" on public.documents;
create policy "owners read documents" on public.documents for select to authenticated using (business_id in (select id from public.businesses where owner_id = auth.uid()));
revoke insert, update, delete on public.businesses, public.documents from anon, authenticated;

-- Only fully indexed documents participate in retrieval. The function is an
-- invoker function; only the service role may call it with a tenant identifier.
create or replace function public.match_document_chunks(query_embedding extensions.vector(768), match_business_id uuid, match_count int default 8)
returns table(id bigint, document_id uuid, content text, metadata jsonb, similarity float)
language sql stable set search_path = '' as $$
  select c.id, c.document_id, c.content, c.metadata, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id and d.business_id = c.business_id
  where c.business_id = match_business_id and d.status = 'ready'
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 20);
$$;
revoke all on function public.match_document_chunks(extensions.vector, uuid, int) from public, anon, authenticated;
grant execute on function public.match_document_chunks(extensions.vector, uuid, int) to service_role;

-- Lock one workspace/month row, making the check and increment atomic even
-- across different serverless instances. Monthly counts reserve AI attempts,
-- including upstream failures, to bound spend during an outage or retry storm.
create or replace function public.consume_chat_allowance(
  target_business_id uuid, target_chat_id text, per_minute_limit int default 5,
  business_minute_limit int default 30, monthly_limit int default 1000
) returns jsonb language plpgsql set search_path = '' as $$
declare
  current_month date := date_trunc('month', now() at time zone 'UTC')::date;
  current_minute timestamptz := date_trunc('minute', now());
  used_questions integer;
  chat_questions integer;
  business_questions integer;
begin
  if per_minute_limit < 1 or business_minute_limit < 1 or monthly_limit < 1 or length(target_chat_id) > 200 then
    raise exception 'Invalid allowance parameters';
  end if;
  insert into public.message_usage(business_id, month) values (target_business_id, current_month) on conflict do nothing;
  select question_count into used_questions from public.message_usage
    where business_id = target_business_id and month = current_month for update;
  if used_questions >= monthly_limit then return jsonb_build_object('allowed', false, 'reason', 'monthly'); end if;
  delete from public.chat_rate_limits where business_id = target_business_id and window_start < current_minute;
  select coalesce(sum(count), 0) into business_questions from public.chat_rate_limits
    where business_id = target_business_id and window_start = current_minute;
  select coalesce(sum(count), 0) into chat_questions from public.chat_rate_limits
    where business_id = target_business_id and chat_id = target_chat_id and window_start = current_minute;
  if chat_questions >= per_minute_limit or business_questions >= business_minute_limit then
    return jsonb_build_object('allowed', false, 'reason', 'minute');
  end if;
  insert into public.chat_rate_limits(business_id, chat_id, window_start, count)
    values (target_business_id, target_chat_id, current_minute, 1)
    on conflict (business_id, chat_id, window_start) do update set count = public.chat_rate_limits.count + 1;
  update public.message_usage set question_count = question_count + 1 where business_id = target_business_id and month = current_month;
  delete from public.processed_updates where business_id = target_business_id and expires_at < now();
  return jsonb_build_object('allowed', true, 'used', used_questions + 1, 'limit', monthly_limit);
end;
$$;
revoke all on function public.consume_chat_allowance(uuid, text, int, int, int) from public, anon, authenticated;
grant execute on function public.consume_chat_allowance(uuid, text, int, int, int) to service_role;

commit;
