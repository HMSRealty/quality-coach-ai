-- 0017_payroll_config.sql
-- Fully customizable payroll: an org/user-level config blob (every number, the
-- period dates, currency rate, thresholds, spiffs — all adjustable) plus a
-- per-person pay profile that works for both callers and managers.

-- One config row per owner. Everything lives in JSON so users can freely tune
-- any knob without schema changes.
create table if not exists public.payroll_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid,
  config           jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);
alter table public.payroll_settings enable row level security;
drop policy if exists "payroll_settings_own" on public.payroll_settings;
create policy "payroll_settings_own" on public.payroll_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-person pay profile. Keyed by name so it covers anyone (callers, TLs,
-- managers, support) regardless of which source table they came from.
create table if not exists public.agent_pay (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  organization_id  uuid,
  name             text not null,
  category         text not null default 'caller',   -- 'caller' | 'manager'
  role             text,
  hourly_rate      numeric not null default 0,        -- callers: USD / hour
  monthly_salary   numeric not null default 0,        -- managers: EGP / month
  payment_method   text,                               -- Instapay / Payoneer / Vodafone Cash / ...
  payment_info     text,                               -- handle / phone / IPN link
  color            text,                               -- hex for dashboards
  email            text,
  extras           jsonb not null default '{}'::jsonb, -- per-person overrides: worked hrs, OT, deducted days, referral, manual adj.
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_agent_pay_user on public.agent_pay(user_id);
alter table public.agent_pay enable row level security;
drop policy if exists "agent_pay_own" on public.agent_pay;
create policy "agent_pay_own" on public.agent_pay
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
