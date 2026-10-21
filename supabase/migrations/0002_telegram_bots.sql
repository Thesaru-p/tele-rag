-- Telegram credentials are encrypted by the server and never exposed through the API.
create table if not exists public.telegram_bots (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  bot_username text not null,
  encrypted_token text not null,
  webhook_secret text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.telegram_bots enable row level security;
-- Deliberately no client policies: access is server-only through the service role.

create index if not exists processed_updates_expiry_idx on public.processed_updates(expires_at);
