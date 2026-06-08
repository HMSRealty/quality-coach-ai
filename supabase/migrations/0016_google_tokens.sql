-- 0016_google_tokens.sql
-- Stored Google OAuth tokens (per user) for private Google Drive access.
-- Tokens are sensitive: the service role manages them; no anon SELECT.
create table if not exists public.google_tokens (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid,
  email            text,
  refresh_token    text not null,
  access_token     text,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.google_tokens enable row level security;
-- Owner may DELETE (disconnect) their own row; reads/writes of tokens go through
-- the service role only (no anon select — keeps refresh tokens out of the browser).
drop policy if exists "google_tokens_delete_own" on public.google_tokens;
create policy "google_tokens_delete_own" on public.google_tokens
  for delete using (auth.uid() = user_id);
