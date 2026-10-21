create extension if not exists vector with schema extensions;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, created_at timestamptz not null default now(), unique(owner_id)
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  file_id text not null unique, file_name text not null, status text not null default 'queued', created_at timestamptz not null default now()
);
create table if not exists public.document_chunks (
  id bigint generated always as identity primary key, document_id uuid not null references public.documents(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade, content text not null,
  embedding extensions.vector(768) not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists document_chunks_business_idx on public.document_chunks(business_id);
create index if not exists document_chunks_embedding_idx on public.document_chunks using hnsw (embedding vector_cosine_ops);
create table if not exists public.conversations (id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, chat_id text not null, role text not null, content text not null, created_at timestamptz not null default now());
create table if not exists public.processed_updates (id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id) on delete cascade, update_id text not null, expires_at timestamptz not null, unique(business_id, update_id));
create table if not exists public.unanswered_questions (id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id) on delete cascade, question text not null, created_at timestamptz not null default now());
create table if not exists public.chat_rate_limits (id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id) on delete cascade, chat_id text not null, window_start timestamptz not null, unique(business_id, chat_id, window_start));

create or replace function public.match_document_chunks(query_embedding extensions.vector(768), match_business_id uuid, match_count int default 8)
returns table(id bigint, document_id uuid, content text, metadata jsonb, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.content, c.metadata, 1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c where c.business_id = match_business_id
  order by c.embedding <=> query_embedding limit match_count;
$$;

alter table public.businesses enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.processed_updates enable row level security;
alter table public.unanswered_questions enable row level security;
alter table public.chat_rate_limits enable row level security;

create policy "owners manage businesses" on public.businesses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage documents" on public.documents for all using (business_id in (select id from public.businesses where owner_id = auth.uid())) with check (business_id in (select id from public.businesses where owner_id = auth.uid()));
create policy "owners read chunks" on public.document_chunks for select using (business_id in (select id from public.businesses where owner_id = auth.uid()));
