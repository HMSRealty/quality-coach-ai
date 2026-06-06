-- ===========================================================================
-- Campaign targets, Shift Type on profiles, Agent (cold_caller) info extension.
-- ===========================================================================

-- Campaigns: numeric daily/weekly target (interpretation owned by the app).
alter table public.campaigns
  add column if not exists target numeric;

-- Profiles: shift_type drives the default target (part_time => 1, full_time => 2).
do $$ begin
  create type shift_type as enum ('part_time','full_time');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists shift_type shift_type default 'full_time',
  add column if not exists daily_target numeric;

-- Sensible default: part_time => 1, full_time => 2 (idempotent backfill).
update public.profiles set daily_target =
  case coalesce(shift_type::text, 'full_time')
    when 'part_time' then 1
    else 2
  end
where daily_target is null;

-- Cold caller (agent) extended fields managed from /dashboard/callers.
alter table public.cold_callers
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists shift_type shift_type default 'full_time',
  add column if not exists daily_target numeric,
  add column if not exists is_active boolean default true,
  add column if not exists notes text;

update public.cold_callers set daily_target =
  case coalesce(shift_type::text, 'full_time')
    when 'part_time' then 1
    else 2
  end
where daily_target is null;
