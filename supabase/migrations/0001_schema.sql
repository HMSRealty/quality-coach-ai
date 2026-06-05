-- =====================================================================
-- RealTrack CRM — Phase 1: Multi-tenant schema
-- Run order: 0001_schema.sql -> 0002_rls.sql -> 0003_triggers_and_deletion.sql
-- Safe to re-run (idempotent). Review before running on production data.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
do $$ begin
  create type app_role as enum ('owner','admin','qa','trainer','team_leader','caller');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_stage as enum ('new','contacted','negotiating','won','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  -- QA verdict (distinct from the sales pipeline `stage`)
  create type lead_status as enum
    ('processing','hot','warm','cold','callback','disqualified','commercial','duplicate','error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_event_type as enum
    ('created','status_changed','stage_changed','call_uploaded','call_reprocessed',
     'property_enriched','note','assignment_changed','followup_set');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------- organizations
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan_tier   text not null default 'starter',
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------ profiles (1:1 auth.users)
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null,
  full_name       text,
  username        text,
  phone           text,
  website         text,
  role            app_role not null default 'caller',
  created_at      timestamptz not null default now(),
  unique (organization_id, username)
);
create index if not exists idx_profiles_org on public.profiles(organization_id);

-- -------------------------------------------- roles + permission matrix
create table if not exists public.roles (
  key   app_role primary key,
  label text not null,
  rank  int  not null            -- higher = more powerful (UI sort + "manage lower")
);
insert into public.roles(key,label,rank) values
  ('owner','Owner',60),('admin','Admin',50),('qa','QA Specialist',40),
  ('trainer','Trainer',30),('team_leader','Team Leader',20),('caller','Caller',10)
on conflict (key) do nothing;

create table if not exists public.role_permissions (
  role       app_role not null references public.roles(key) on delete cascade,
  permission text     not null,
  primary key (role, permission)
);
-- Mirror of lib/rbac.ts — keep the two in sync.
insert into public.role_permissions(role,permission) values
  ('owner','leads.view'),('owner','leads.edit'),('owner','leads.delete'),
  ('owner','calls.play'),('owner','calls.download'),('owner','calls.upload'),
  ('owner','lead.date.override'),('owner','users.manage'),('owner','org.manage'),
  ('admin','leads.view'),('admin','leads.edit'),('admin','leads.delete'),
  ('admin','calls.play'),('admin','calls.download'),('admin','calls.upload'),
  ('admin','lead.date.override'),('admin','users.manage'),
  ('qa','leads.view'),('qa','leads.edit'),
  ('qa','calls.play'),('qa','calls.download'),('qa','calls.upload'),('qa','lead.date.override'),
  ('trainer','leads.view'),('trainer','calls.play'),
  ('team_leader','leads.view'),('team_leader','leads.edit'),('team_leader','calls.play'),
  ('caller','leads.view'),('caller','calls.play'),('caller','calls.upload')
on conflict do nothing;

-- --------------------------------------------------------------- teams
create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  leader_id       uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_teams_org on public.teams(organization_id);

create table if not exists public.team_members (
  team_id         uuid not null references public.teams(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (team_id, user_id)
);
create index if not exists idx_team_members_user on public.team_members(user_id);

-- ------------------------- property data cache (SERVER-ONLY: no RLS policies)
create table if not exists public.property_data_cache (
  address_hash text primary key,          -- sha256(lower(normalized address))
  provider     text not null,
  normalized   jsonb not null,
  raw          jsonb,
  fetched_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days')
);

-- --------------------------------------------------------------- leads
create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  team_id             uuid references public.teams(id)     on delete set null,
  assigned_to         uuid references public.profiles(id)  on delete set null,  -- caller
  created_by          uuid references public.profiles(id)  on delete set null,
  campaign_id         uuid,                                                     -- optional FK to campaigns
  -- contact / property
  owner_name          text,
  owner_phone         text,
  property_address    text,
  -- QA verdict + sales pipeline stage (two different axes)
  status              lead_status not null default 'processing',
  stage               lead_stage  not null default 'new',
  -- valuation
  asking_price        numeric,
  market_value        numeric,     -- provider estimate (e.g. zestimate)
  arv                 numeric,     -- After-Repair Value (services/arv.ts)
  arv_confidence      numeric,     -- 0..1
  -- AI
  qualification_reason text,
  ai_feedback          text,
  ai_coaching_points   jsonb,
  -- follow-ups
  followup_flag       boolean not null default false,
  followup_date       date,
  -- EST submission date — set by trigger; editable only with lead.date.override
  submission_date     date,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_leads_org             on public.leads(organization_id);
create index if not exists idx_leads_org_stage       on public.leads(organization_id, stage);
create index if not exists idx_leads_org_status      on public.leads(organization_id, status);
create index if not exists idx_leads_assigned        on public.leads(assigned_to);
create index if not exists idx_leads_submission_date on public.leads(organization_id, submission_date);

-- ----------------------------------------------- lead_status_history
create table if not exists public.lead_status_history (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  from_status     lead_status,
  to_status       lead_status not null,
  changed_by      uuid references public.profiles(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_lsh_lead on public.lead_status_history(lead_id);

-- --------------------------------------------- calls (recording metadata)
create table if not exists public.calls (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  storage_path     text not null,                                  -- private bucket path
  uploaded_by      uuid references public.profiles(id) on delete set null,
  duration_seconds numeric,
  file_size_bytes  bigint,
  mime_type        text,
  transcription    text,                                           -- optional ASR placeholder
  created_at       timestamptz not null default now()
);
create index if not exists idx_calls_lead on public.calls(lead_id);
create index if not exists idx_calls_org  on public.calls(organization_id);

-- ------------------------------------------------- lead_events (timeline)
create table if not exists public.lead_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  type            lead_event_type not null,
  actor_id        uuid references public.profiles(id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_lead_events_lead on public.lead_events(lead_id, created_at desc);

-- ------------------------------------------------- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();
