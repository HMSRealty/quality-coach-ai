-- 0011_api_keys.sql
-- Inbound API ingestion: per-user API keys for external dialers (Readymode,
-- BatchDialer, …) to POST leads to /api/inbound/lead.
-- The raw key is shown once in the UI; only a sha-256 hash is stored.

create table if not exists public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,
  label           text,
  key_prefix      text not null,          -- e.g. "rt_live_ab12" for display
  key_hash        text not null unique,   -- sha-256 hex of the full key
  last_used_at    timestamptz,
  revoked         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_api_keys_user on public.api_keys(user_id);
create index if not exists idx_api_keys_hash on public.api_keys(key_hash);

alter table public.api_keys enable row level security;

-- Owners manage their own keys; the inbound route reads via the service role.
drop policy if exists "api_keys_select_own" on public.api_keys;
create policy "api_keys_select_own" on public.api_keys
  for select using (auth.uid() = user_id);

drop policy if exists "api_keys_insert_own" on public.api_keys;
create policy "api_keys_insert_own" on public.api_keys
  for insert with check (auth.uid() = user_id);

drop policy if exists "api_keys_update_own" on public.api_keys;
create policy "api_keys_update_own" on public.api_keys
  for update using (auth.uid() = user_id);

drop policy if exists "api_keys_delete_own" on public.api_keys;
create policy "api_keys_delete_own" on public.api_keys
  for delete using (auth.uid() = user_id);
