-- Owner-assigns-keys-to-users model.
-- The RealTrack owner (and any admin) holds the master pool of provider
-- credentials and assigns each one to a specific end-user. The analyzer
-- looks up keys by `assigned_user_id`, so users never see or touch the
-- raw values — they just see "Integrated ✓" on their dashboard.

alter table public.gemini_api_keys
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;

alter table public.zillow_api_keys
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;

-- readymode_connections may not exist in every env; guard with information_schema.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'readymode_connections'
  ) then
    execute 'alter table public.readymode_connections
             add column if not exists assigned_user_id uuid references auth.users(id) on delete set null';
    execute 'create index if not exists rm_assigned_idx on public.readymode_connections (assigned_user_id)';
  end if;
end$$;

create index if not exists gemini_assigned_idx on public.gemini_api_keys (assigned_user_id);
create index if not exists zillow_assigned_idx on public.zillow_api_keys (assigned_user_id);
