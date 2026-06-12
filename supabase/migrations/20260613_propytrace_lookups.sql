-- Audit log for single-shot PropyTrace lookups run from inside RealTrack.
-- Used for usage stats and so we can rebate a user later if a lookup misfired.

create table if not exists public.propytrace_lookups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  address text,
  matched_name text,
  primary_phone text,
  found boolean default false,
  created_at timestamptz default now()
);

create index if not exists pt_lookups_user_idx on public.propytrace_lookups (user_id, created_at desc);

alter table public.propytrace_lookups enable row level security;

drop policy if exists pt_lookups_select_self on public.propytrace_lookups;
create policy pt_lookups_select_self on public.propytrace_lookups
  for select using (auth.uid() = user_id);
