-- =====================================================================
-- RealTrack CRM — Phase 1 BRIDGE: reconcile the existing per-user schema
-- with the multi-tenant model, and backfill organizations.
--
-- RUN ORDER (important):
--   0001_schema.sql            (creates enums + new tables; no-ops existing ones)
--   0004_bridge_backfill.sql   ← THIS FILE
--   0002_rls.sql               (org-scoped RLS; needs organization_id to exist)
--   0003_triggers_and_deletion.sql
--
-- Design goal: the LIVE app keeps working throughout.
--   • leads.status stays TEXT ("Hot","Warm",…) — not converted to the enum.
--   • profiles.role stays TEXT ("user","admin") — current_app_role() tolerates it.
--   • Everything added here is ADDITIVE (ADD COLUMN IF NOT EXISTS / new orgs).
-- Idempotent: safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) Ensure the sub-user link column exists (also a long-pending migration).
--    Owners = profiles whose parent_user_id is null.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists parent_user_id uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 1) New columns on the EXISTING profiles table (all nullable / additive).
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists username  text;
alter table public.profiles add column if not exists phone     text;
alter table public.profiles add column if not exists website   text;

create index if not exists idx_profiles_org on public.profiles(organization_id);

-- ---------------------------------------------------------------------
-- 2) New columns on the EXISTING leads table.
--    NOTE: we do NOT touch leads.status (keeps text + capitalized values the
--    live UI depends on). `stage` is the NEW pipeline axis.
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.leads add column if not exists team_id        uuid references public.teams(id)    on delete set null;
alter table public.leads add column if not exists assigned_to    uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists created_by     uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists stage          lead_stage not null default 'new';
alter table public.leads add column if not exists market_value   numeric;
alter table public.leads add column if not exists arv            numeric;
alter table public.leads add column if not exists arv_confidence numeric;
alter table public.leads add column if not exists submission_date date;
alter table public.leads add column if not exists updated_at     timestamptz not null default now();

create index if not exists idx_leads_org             on public.leads(organization_id);
create index if not exists idx_leads_org_stage       on public.leads(organization_id, stage);
create index if not exists idx_leads_org_status      on public.leads(organization_id, status);
create index if not exists idx_leads_assigned        on public.leads(assigned_to);
create index if not exists idx_leads_submission_date on public.leads(organization_id, submission_date);

-- ---------------------------------------------------------------------
-- 3) Make the audit log tolerant of the live capitalized text status, so the
--    0003 trigger can write history without an enum cast failing on "Hot".
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='lead_status_history'
      and column_name='from_status' and udt_name='lead_status'
  ) then
    alter table public.lead_status_history alter column from_status type text using from_status::text;
    alter table public.lead_status_history alter column to_status   type text using to_status::text;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) organization_id on the other live tenant tables (guarded — may not exist).
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.campaigns') is not null then
    execute 'alter table public.campaigns add column if not exists organization_id uuid references public.organizations(id) on delete cascade';
  end if;
  if to_regclass('public.cold_callers') is not null then
    execute 'alter table public.cold_callers add column if not exists organization_id uuid references public.organizations(id) on delete cascade';
  end if;
  if to_regclass('public.submission_forms') is not null then
    execute 'alter table public.submission_forms add column if not exists organization_id uuid references public.organizations(id) on delete cascade';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4b) teams / team_members ALREADY EXIST in the live app
--     (teams: id, name, manager_id;  team_members: team_id, user_id).
--     Add organization_id + the indexes 0001 used to (incorrectly) create.
-- ---------------------------------------------------------------------
alter table public.teams        add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.teams        add column if not exists leader_id       uuid references public.profiles(id)      on delete set null;
alter table public.team_members add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create index if not exists idx_teams_org         on public.teams(organization_id);
create index if not exists idx_team_members_user on public.team_members(user_id);
do $$
declare r record; new_org uuid;
begin
  for r in
    select p.id, p.email
    from public.profiles p
    where p.parent_user_id is null and p.organization_id is null
  loop
    insert into public.organizations(name, slug)
    values (
      coalesce(nullif(split_part(r.email,'@',1),''),'org'),
      lower(regexp_replace(split_part(r.email,'@',1),'[^a-z0-9]+','-','g'))
        || '-' || substring(r.id::text,1,6)
    )
    on conflict (slug) do nothing
    returning id into new_org;

    -- if slug collided (re-run), fetch the existing org by slug
    if new_org is null then
      select id into new_org from public.organizations
      where slug = lower(regexp_replace(split_part(r.email,'@',1),'[^a-z0-9]+','-','g')) || '-' || substring(r.id::text,1,6);
    end if;

    update public.profiles set organization_id = new_org where id = r.id;
  end loop;
end $$;

-- Sub-users inherit their parent's org.
update public.profiles c
   set organization_id = p.organization_id
  from public.profiles p
 where c.parent_user_id = p.id
   and c.organization_id is null
   and p.organization_id is not null;

-- ---------------------------------------------------------------------
-- 6) Backfill organization_id + the new lead fields from the legacy user_id.
-- ---------------------------------------------------------------------
-- org_id + created_by + assigned_to come from the legacy leads.user_id.
-- Guarded so this also no-ops cleanly on a fresh (greenfield) DB with no user_id.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='leads' and column_name='user_id'
  ) then
    update public.leads l set organization_id = p.organization_id
      from public.profiles p where l.user_id = p.id and l.organization_id is null;
    update public.leads set created_by  = user_id where created_by  is null;
    update public.leads set assigned_to = user_id where assigned_to is null;
  end if;
end $$;

update public.leads
   set submission_date = (created_at at time zone 'America/New_York')::date
 where submission_date is null and created_at is not null;
update public.leads set updated_at = created_at where created_at is not null;

-- Seed the pipeline stage from the existing QA verdict (one-time triage).
update public.leads set stage =
  case
    when lower(coalesce(status::text,'')) in ('disqualified','duplicate','error') then 'lost'::lead_stage
    when lower(coalesce(status::text,'')) in ('hot','warm','cold','call back','callback','commercial') then 'contacted'::lead_stage
    else 'new'::lead_stage
  end
 where stage = 'new';

-- Other tenant tables.
do $$
begin
  if to_regclass('public.campaigns') is not null then
    execute 'update public.campaigns c set organization_id=p.organization_id from public.profiles p where c.user_id=p.id and c.organization_id is null';
  end if;
  if to_regclass('public.cold_callers') is not null then
    execute 'update public.cold_callers c set organization_id=p.organization_id from public.profiles p where c.user_id=p.id and c.organization_id is null';
  end if;
  if to_regclass('public.submission_forms') is not null then
    execute 'update public.submission_forms c set organization_id=p.organization_id from public.profiles p where c.user_id=p.id and c.organization_id is null';
  end if;
end $$;

-- teams.org from the legacy manager_id (guarded — greenfield teams has no manager_id).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='teams' and column_name='manager_id'
  ) then
    update public.teams t set organization_id = p.organization_id
      from public.profiles p where t.manager_id = p.id and t.organization_id is null;
  end if;
end $$;

-- team_members.org inherited from its team.
update public.team_members tm set organization_id = t.organization_id
  from public.teams t where tm.team_id = t.id and tm.organization_id is null;

commit;

-- =====================================================================
-- POST-CHECK (run manually; all should return 0):
--   select count(*) from public.profiles where organization_id is null;
--   select count(*) from public.leads    where organization_id is null;
-- Optional hardening once verified clean:
--   alter table public.profiles alter column organization_id set not null;
--   alter table public.leads    alter column organization_id set not null;
-- =====================================================================
