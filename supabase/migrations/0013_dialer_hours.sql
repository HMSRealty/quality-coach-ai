-- 0013_dialer_hours.sql
-- Persisted dialer payable-hours rows for the Payroll calculator (survives refresh).
create table if not exists public.dialer_hours (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  organization_id   uuid,
  employee_name     text,
  payable_hours_raw text,
  rate              numeric,
  position          integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_dialer_hours_user on public.dialer_hours(user_id);

alter table public.dialer_hours enable row level security;
drop policy if exists "dialer_hours_own" on public.dialer_hours;
create policy "dialer_hours_own" on public.dialer_hours
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
