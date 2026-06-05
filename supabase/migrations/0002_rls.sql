-- =====================================================================
-- RealTrack CRM — Phase 1: Row Level Security
-- Depends on 0001_schema.sql. Run after it.
--
-- Model: every tenant table carries organization_id. A user may only touch
-- rows in their own org, gated further by the permission matrix.
-- The service-role key (server routes) BYPASSES RLS by design — use it for
-- signup, deletion, the public intake form, and the property cache.
-- =====================================================================

-- ----------------------------------------------------- helper functions
-- NB: named current_app_role() (not current_role) to avoid the reserved
-- Postgres function current_role. SECURITY DEFINER so policies can read
-- profiles without recursing into profiles' own RLS.

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

-- Tolerant of BOTH the new app_role values AND the legacy text roles the live
-- app still writes ('user','admin'), so we never have to convert profiles.role.
create or replace function public.current_app_role()
returns app_role language sql stable security definer set search_path = public as $$
  select case lower(coalesce((select role::text from public.profiles where id = auth.uid()), 'caller'))
    when 'owner'       then 'owner'::app_role
    when 'admin'       then 'admin'::app_role
    when 'qa'          then 'qa'::app_role
    when 'trainer'     then 'trainer'::app_role
    when 'team_leader' then 'team_leader'::app_role
    when 'team leader' then 'team_leader'::app_role
    when 'caller'      then 'caller'::app_role
    when 'user'        then 'caller'::app_role   -- legacy: regular user => caller
    else 'caller'::app_role
  end
$$;

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_permissions rp
    where rp.role = public.current_app_role() and rp.permission = p
  )
$$;

-- --------------------------------------------------------- organizations
alter table public.organizations enable row level security;

drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select
  using (id = public.current_org_id());

drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update
  using (id = public.current_org_id() and public.has_perm('org.manage'))
  with check (id = public.current_org_id());

-- --------------------------------------------------------------- profiles
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (organization_id = public.current_org_id());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update
  using (organization_id = public.current_org_id() and public.has_perm('users.manage'))
  with check (organization_id = public.current_org_id());
-- INSERT / DELETE of profiles is performed by the service role (signup + admin).

-- ---------------------------------------------- roles + role_permissions
alter table public.roles enable row level security;
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select using (auth.role() = 'authenticated');

alter table public.role_permissions enable row level security;
drop policy if exists role_perms_read on public.role_permissions;
create policy role_perms_read on public.role_permissions for select using (auth.role() = 'authenticated');

-- ----------------------------------------------------------------- teams
alter table public.teams enable row level security;
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select
  using (organization_id = public.current_org_id());
drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams for all
  using (organization_id = public.current_org_id() and public.has_perm('users.manage'))
  with check (organization_id = public.current_org_id() and public.has_perm('users.manage'));

-- ---------------------------------------------------------- team_members
alter table public.team_members enable row level security;
drop policy if exists tm_select on public.team_members;
create policy tm_select on public.team_members for select
  using (organization_id = public.current_org_id());
drop policy if exists tm_write on public.team_members;
create policy tm_write on public.team_members for all
  using (organization_id = public.current_org_id() and public.has_perm('users.manage'))
  with check (organization_id = public.current_org_id() and public.has_perm('users.manage'));

-- ----------------------------------------------------------------- leads
alter table public.leads enable row level security;

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert
  with check (organization_id = public.current_org_id() and public.has_perm('leads.edit'));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using (organization_id = public.current_org_id() and public.has_perm('leads.edit'))
  with check (organization_id = public.current_org_id());

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete
  using (organization_id = public.current_org_id() and public.has_perm('leads.delete'));

-- ----------------------------------------------------------------- calls
-- Row visibility = anyone in the org who can view leads.
-- PLAY vs DOWNLOAD is NOT a row-level distinction (both need the row); it is
-- enforced at the API layer by issuing signed Storage URLs only to roles with
-- calls.download. See app/api/calls/[id]/url + the private bucket policy below.
alter table public.calls enable row level security;

drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));

drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert
  with check (organization_id = public.current_org_id() and public.has_perm('calls.upload'));

drop policy if exists calls_delete on public.calls;
create policy calls_delete on public.calls for delete
  using (organization_id = public.current_org_id() and public.has_perm('leads.delete'));

-- ----------------------------------------------------- lead_status_history
alter table public.lead_status_history enable row level security;
drop policy if exists lsh_select on public.lead_status_history;
create policy lsh_select on public.lead_status_history for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));
drop policy if exists lsh_insert on public.lead_status_history;
create policy lsh_insert on public.lead_status_history for insert
  with check (organization_id = public.current_org_id());

-- ------------------------------------------------------------ lead_events
alter table public.lead_events enable row level security;
drop policy if exists le_select on public.lead_events;
create policy le_select on public.lead_events for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));
drop policy if exists le_insert on public.lead_events;
create policy le_insert on public.lead_events for insert
  with check (organization_id = public.current_org_id());

-- --------------------------------------------------- property_data_cache
-- RLS ON with NO policies => default-deny for anon/authenticated.
-- Only the service-role key (server) can read/write the shared cache.
alter table public.property_data_cache enable row level security;

-- =====================================================================
-- STORAGE — private bucket 'call-recordings'
-- Create the bucket in the dashboard (Public = OFF), then run:
--
--   -- members of the org can read objects only via signed URLs minted by the
--   -- server (the server uses the service role to sign, so no SELECT policy is
--   -- strictly required for playback). Allow authenticated UPLOAD into a path
--   -- that starts with their org id:
--   create policy "calls upload by org" on storage.objects for insert to authenticated
--     with check (
--       bucket_id = 'call-recordings'
--       and (storage.foldername(name))[1] = public.current_org_id()::text
--     );
--
-- Download/play distinction is handled by the API (mode=play|download) which
-- checks has_perm('calls.download') before signing a URL with attachment
-- disposition. Team Leaders / Callers only ever receive short-lived stream URLs.
-- =====================================================================
