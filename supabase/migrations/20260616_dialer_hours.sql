-- Snapshot of Agent Report data pulled from a Readymode dialer.
-- One row per (workspace owner, dialer connection, agent name, date range we
-- synced for). We treat "date range" as the period the sync covered, not the
-- agent's shift — Readymode summarizes hours across the requested range.

create table if not exists public.dialer_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.readymode_connections(id) on delete set null,
  -- Optional assignment to a RealTrack user so the hours roll into their payroll.
  assigned_user_id uuid references auth.users(id) on delete set null,
  agent_name text not null,
  agent_email text,
  period_from date not null,
  period_to date not null,
  shift_start text,
  shift_end text,
  logged_minutes integer default 0,
  payable_minutes integer default 0,
  ready_minutes integer default 0,
  break_minutes integer default 0,
  lunch_minutes integer default 0,
  afk_minutes integer default 0,
  raw_row jsonb,
  synced_at timestamptz default now()
);

create index if not exists dialer_hours_user_idx on public.dialer_hours (user_id, period_from desc);
create index if not exists dialer_hours_agent_idx on public.dialer_hours (user_id, agent_name);
create index if not exists dialer_hours_assigned_idx on public.dialer_hours (assigned_user_id) where assigned_user_id is not null;

-- Idempotent re-sync: one row per (user, connection, agent, period_from, period_to)
create unique index if not exists dialer_hours_unique_per_period
  on public.dialer_hours (user_id, connection_id, agent_name, period_from, period_to);

alter table public.dialer_hours enable row level security;

drop policy if exists dh_select_self on public.dialer_hours;
create policy dh_select_self on public.dialer_hours
  for select using (auth.uid() = user_id or auth.uid() = assigned_user_id);

-- Cache the report URL on the connection so subsequent syncs skip the
-- endpoint-probing step. Pure performance/UX optimization.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'readymode_connections'
  ) then
    execute 'alter table public.readymode_connections
             add column if not exists report_url text';
  end if;
end$$;
