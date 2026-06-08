-- 0015_cash_buyers.sql
-- Cash-buyer CRM for dispositions: buyers, their target areas + buy-box criteria.
create table if not exists public.cash_buyers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  organization_id  uuid,
  name             text not null,
  company          text,
  phone            text,
  email            text,
  areas            text[] not null default '{}',          -- target cities / zips / counties
  property_types   text[] not null default '{}',          -- SFR, MF, Land, Commercial…
  min_price        numeric,
  max_price        numeric,
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists idx_cash_buyers_user on public.cash_buyers(user_id);

alter table public.cash_buyers enable row level security;
drop policy if exists "cash_buyers_own" on public.cash_buyers;
create policy "cash_buyers_own" on public.cash_buyers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
