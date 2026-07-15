-- =====================================================================
-- RealTrack — Core schema for the Performance OS pivot
--
-- Additive and idempotent. Creates nothing that conflicts with the legacy
-- tables; legacy drops live in 20260715_003_drop_legacy.sql and are run
-- separately, only after this is proven.
--
-- Design rules enforced here:
--   1. A CALL is the atom. A lead is an outcome of a call, not a synonym.
--   2. AI writes signals + prose. Python writes every number. No overlap.
--   3. Rollups store sum + n, never avg — averages don't re-aggregate.
--   4. ingest_events is append-only. Everything else is derivable from it.
--
-- See docs/ARCHITECTURE.md for the reasoning.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

do $$ begin
  create type rt_call_outcome as enum (
    'no_answer','busy','voicemail','failed','dropped',
    'connected',        -- a human answered
    'conversation',     -- a real conversation happened (contact)
    'appointment',      -- booked
    'dnc','wrong_number'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type rt_lead_temp as enum ('hot','warm','cold','disqualified','unscored');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rt_job_state as enum ('queued','running','done','failed','dead');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rt_feed_kind as enum ('alert','milestone','action_plan','hot_lead','campaign','team','system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rt_severity as enum ('info','success','warning','critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rt_goal_period as enum ('weekly','monthly','quarterly');
exception when duplicate_object then null; end $$;

-- ============================================================ INGEST
-- Append-only. Never updated, never deleted. Every downstream row is
-- derivable from this, so a prompt change or a scoring-rule fix is a
-- replay rather than a hand-written backfill.

create table if not exists public.ingest_events (
  id              bigserial primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  -- Which webhook endpoint received it (each user gets their own).
  endpoint_id     uuid,
  source          text not null,              -- 'readymode_webhook' | 'readymode_scrape' | 'manual' | 'csv'
  kind            text not null,              -- 'lead_submitted' | 'call_observed' | 'agent_hours'
  payload         jsonb not null,             -- verbatim, exactly as received
  headers         jsonb,
  received_at     timestamptz not null default now(),
  -- Set once processed; null = not yet consumed. Never blocks the write path.
  processed_at    timestamptz,
  process_error   text,
  -- Dedupe key: source-specific natural id. Null = always accept.
  dedupe_key      text
);
create index if not exists idx_ingest_org_time on public.ingest_events(organization_id, received_at desc);
create index if not exists idx_ingest_unprocessed on public.ingest_events(received_at) where processed_at is null;
create unique index if not exists uq_ingest_dedupe on public.ingest_events(organization_id, source, dedupe_key)
  where dedupe_key is not null;

-- ============================================================ JOBS
-- Postgres-backed queue. Drained with FOR UPDATE SKIP LOCKED. No Redis:
-- one less service to run and page someone about. Revisit past ~100/sec.

create table if not exists public.jobs (
  id              bigserial primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  kind            text not null,              -- 'fetch_recording' | 'transcribe' | 'analyze' | 'rollup' | 'scrape_calls'
  payload         jsonb not null default '{}'::jsonb,
  state           rt_job_state not null default 'queued',
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_jobs_claim on public.jobs(state, run_after) where state = 'queued';
create index if not exists idx_jobs_org on public.jobs(organization_id, created_at desc);

-- ============================================================ WEBHOOKS
-- Per-user inbound endpoints. Each user gets their own URL + secret so a
-- leaked key is revocable in isolation and every event is attributable.

create table if not exists public.webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id        uuid references public.profiles(id) on delete set null,
  label           text not null default 'Dialer webhook',
  -- Public path segment: /api/hook/{slug}. Random, not guessable, not a UUID
  -- we use elsewhere — never reuse an internal id as a public identifier.
  slug            text not null unique,
  -- Only ever store the hash. The plaintext is shown once, at creation.
  secret_hash     text not null,
  secret_hint     text,                       -- last 4 chars, for the UI
  is_active       boolean not null default true,
  -- Which dialer this endpoint expects, so we parse the right payload shape.
  provider        text not null default 'readymode',
  last_seen_at    timestamptz,
  events_received bigint not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_hook_org on public.webhook_endpoints(organization_id);

-- ============================================================ DIALER
-- Replaces readymode_connections. Credentials stay AES-GCM encrypted
-- (same ENC_KEY path already used today) — never plaintext, never in a
-- column anything else can read casually.

create table if not exists public.dialer_connections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider        text not null default 'readymode',
  label           text,
  host            text not null,              -- e.g. acme.readymode.com
  username        text not null,
  password_enc    text not null,              -- AES-GCM ciphertext
  is_active       boolean not null default true,
  -- Cached endpoint that actually returned parseable rows, so scheduled
  -- syncs skip the discovery probe.
  calls_report_url text,
  hours_report_url text,
  -- Scrape health. A scraper that breaks must fail LOUDLY — see §11.
  last_sync_at    timestamptz,
  last_sync_ok    boolean,
  last_sync_error text,
  consecutive_failures int not null default 0,
  position        int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_dialer_org on public.dialer_connections(organization_id);

-- ============================================================ CAMPAIGNS
-- The configuration surface. Solar/insurance/Medicare/real-estate become
-- rows, not branches. Real estate ships as a seed template.

create table if not exists public.campaigns_v2 (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  vertical        text,                       -- 'real_estate' | 'solar' | ... (labelling only)
  is_active       boolean not null default true,

  -- ---- AI configuration ----
  persona_prompt  text,
  -- Defines the AI's output contract AND doubles as the JSON schema we
  -- constrain the model to. Kills the parse_verdict_json guesswork.
  signal_schema   jsonb not null default '{}'::jsonb,
  script          text,

  -- ---- Python configuration (numbers only) ----
  scoring_weights     jsonb not null default '{}'::jsonb,   -- signal -> points
  qualification_rules jsonb not null default '{}'::jsonb,   -- lead / not-a-lead
  disposition_map     jsonb not null default '{}'::jsonb,   -- dialer code -> rt_call_outcome
  success_definition  text,
  kpi_targets         jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists idx_campaign_org on public.campaigns_v2(organization_id) where is_active;

-- ---- THE ATTRIBUTION FIX ----
-- The live bug: the dialer posts campaign:"SWAT" plus Readymode's own UUID.
-- RealTrack's table held only "tx"/"tx hb", so 119/120 leads resolved to no
-- campaign. Neither the UUID nor the name will ever match by luck — the two
-- systems have independent namespaces. An alias table is the join, and it is
-- the ONLY correct place for this mapping.
create table if not exists public.campaign_aliases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns_v2(id) on delete cascade,
  -- The dialer's identifier, exactly as it arrives. Case-insensitive match.
  external_value  text not null,
  -- 'name' (campaign:"SWAT") or 'id' (campaign_id:"78bf...")
  external_kind   text not null default 'name',
  provider        text not null default 'readymode',
  -- True when auto-created on first sight rather than mapped by a human.
  auto_created    boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_alias on public.campaign_aliases(organization_id, provider, external_kind, lower(external_value));
create index if not exists idx_alias_campaign on public.campaign_aliases(campaign_id);

-- ============================================================ AGENTS
-- Dialer agent identity ("hagag") is a string with no link to a profile.
-- Resolve it once, here, rather than string-matching in twelve queries.

create table if not exists public.agent_identities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete set null,
  provider        text not null default 'readymode',
  external_name   text not null,              -- 'hagag', as the dialer sends it
  auto_created    boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_agent_ident on public.agent_identities(organization_id, provider, lower(external_name));
create index if not exists idx_agent_ident_profile on public.agent_identities(profile_id);

-- ============================================================ CALLS
-- THE ATOM. Every dial lands here, connected or not. This is the table the
-- old model lacked, and its absence is why no rate metric was computable.

create table if not exists public.calls_v2 (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id     uuid references public.campaigns_v2(id) on delete set null,
  agent_identity_id uuid references public.agent_identities(id) on delete set null,
  agent_profile_id  uuid references public.profiles(id) on delete set null,
  team_id         uuid references public.teams(id) on delete set null,

  -- Natural key from the dialer. Where the scrape yields a recording id we
  -- use it; it's what makes re-scraping the same day idempotent.
  external_id     text,
  provider        text not null default 'readymode',

  started_at      timestamptz not null,
  duration_seconds int,
  outcome         rt_call_outcome,
  raw_disposition text,                       -- verbatim dialer string, pre-map

  phone           text,
  contact_name    text,

  -- Where this row came from. 'scrape' rows are the call denominator;
  -- 'webhook' rows are lead submissions. Never conflate them in a metric.
  source          text not null default 'scrape',
  ingest_event_id bigint references public.ingest_events(id) on delete set null,

  created_at      timestamptz not null default now()
);
-- Re-scraping a date range must not duplicate calls.
create unique index if not exists uq_calls_external on public.calls_v2(organization_id, provider, external_id)
  where external_id is not null;
create index if not exists idx_calls_org_time on public.calls_v2(organization_id, started_at desc);
create index if not exists idx_calls_agent_day on public.calls_v2(organization_id, agent_profile_id, started_at desc);
create index if not exists idx_calls_campaign_day on public.calls_v2(organization_id, campaign_id, started_at desc);
-- Supports the (agent, phone, time-window) join between scraped calls and
-- webhook-submitted leads.
create index if not exists idx_calls_join on public.calls_v2(organization_id, phone, started_at);

-- ============================================================ RECORDINGS
-- One row per stored audio file. Supersedes the four contradictory audio
-- columns on legacy leads (audio_url / audio_file_url / call_recording_url /
-- has_call_recording — the last of which read false on 120/120 rows while
-- 167 recordings sat in the bucket). One source of truth, no booleans that
-- can drift out of sync with reality.

create table if not exists public.recordings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id         uuid references public.calls_v2(id) on delete cascade,
  bucket          text not null default 'call-recordings',
  storage_path    text not null,
  source_url      text,                       -- where we fetched it from
  bytes           bigint,
  duration_seconds numeric,
  mime_type       text,
  checksum_sha256 text,                       -- kills the duplicate-fetch race
  fetched_at      timestamptz not null default now()
);
create index if not exists idx_rec_call on public.recordings(call_id);
-- The live DB stored readymode-42689.mp3 twice, 0.5s apart, for one lead.
-- Content-addressing makes that impossible rather than merely unlikely.
create unique index if not exists uq_rec_checksum on public.recordings(organization_id, checksum_sha256)
  where checksum_sha256 is not null;

create table if not exists public.transcripts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id         uuid not null references public.calls_v2(id) on delete cascade,
  recording_id    uuid references public.recordings(id) on delete set null,
  provider        text,                       -- abstract STT provider
  language        text,
  text            text not null,
  segments        jsonb,                      -- [{start,end,speaker,text}]
  created_at      timestamptz not null default now()
);
create index if not exists idx_transcript_call on public.transcripts(call_id);

-- ============================================================ ANALYSIS
-- THE BOUNDARY. AI writes here and ONLY here.
--   signals   — booleans/enums. Python reads these to compute scores.
--   narrative — prose for humans. No calculation ever reads it.
-- The AI has no write path to any numeric table. That is what makes KPIs
-- deterministic and re-scoring free (no re-inference).

create table if not exists public.call_analyses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id         uuid not null references public.calls_v2(id) on delete cascade,
  campaign_id     uuid references public.campaigns_v2(id) on delete set null,

  -- Extracted facts, shaped by campaigns_v2.signal_schema.
  -- e.g. {"interested":true,"asked_timeline":true,"sentiment":"positive"}
  signals         jsonb not null default '{}'::jsonb,

  -- Prose. Human-facing only.
  summary         text,
  narrative       text,
  coaching        jsonb,                      -- [{point, evidence, timestamp}]
  objections      jsonb,
  compliance      jsonb,                      -- [{rule, passed, evidence}]
  highlights      jsonb,
  weaknesses      jsonb,
  next_steps      jsonb,

  -- Provenance. Needed to replay or audit any verdict.
  provider        text,
  model           text,
  prompt_version  text,
  -- Structured failure. Replaces the single "Analysis failed — please re-run."
  -- string that 46/120 live leads share and which distinguishes nothing.
  error_code      text,                       -- 'audio_fetch' | 'quota' | 'parse' | 'timeout' | 'schema'
  error_detail    text,

  created_at      timestamptz not null default now(),
  unique (call_id)
);
create index if not exists idx_analysis_org on public.call_analyses(organization_id, created_at desc);
create index if not exists idx_analysis_signals on public.call_analyses using gin(signals);
create index if not exists idx_analysis_errors on public.call_analyses(organization_id, error_code)
  where error_code is not null;

-- Python-derived per-call numbers. Never written by AI.
create table if not exists public.call_metrics (
  call_id         uuid primary key references public.calls_v2(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  talk_seconds    int,
  agent_talk_ratio numeric,                   -- 0..1
  silence_ratio   numeric,
  interruptions   int,
  qa_score        numeric,                    -- 0..100, computed from signals
  compliance_flags int not null default 0,
  computed_at     timestamptz not null default now()
);

-- ============================================================ LEADS
-- An OUTCOME of a call. Not a synonym for one. Vertical-agnostic: no ARV,
-- no property columns, no Zestimate. Vertical specifics live in `attributes`
-- and are shaped by the campaign.

create table if not exists public.leads_v2 (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id     uuid references public.campaigns_v2(id) on delete set null,
  -- The call that produced it. Nullable: a lead can arrive by webhook before
  -- its call is scraped, then get linked on (agent, phone, time-window).
  origin_call_id  uuid references public.calls_v2(id) on delete set null,
  agent_profile_id uuid references public.profiles(id) on delete set null,
  team_id         uuid references public.teams(id) on delete set null,

  contact_name    text,
  phone           text,
  email           text,
  -- Vertical-specific fields (address/city/state/zip for real estate,
  -- roof type for solar, …). Campaign-shaped, not schema-baked.
  attributes      jsonb not null default '{}'::jsonb,

  temperature     rt_lead_temp not null default 'unscored',
  is_qualified    boolean not null default false,

  ingest_event_id bigint references public.ingest_events(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_leads_org_time on public.leads_v2(organization_id, created_at desc);
create index if not exists idx_leads_temp on public.leads_v2(organization_id, temperature) where is_qualified;
create index if not exists idx_leads_call on public.leads_v2(origin_call_id);
create index if not exists idx_leads_join on public.leads_v2(organization_id, phone, created_at);

-- Python-computed. Every component is auditable: an agent can be shown the
-- exact arithmetic. Re-scoring after a weight change costs zero LLM spend.
create table if not exists public.lead_scores (
  lead_id         uuid primary key references public.leads_v2(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  score           int not null,               -- 0..100
  -- [{signal:"interested", points:20}, {signal:"asked_timeline", points:15}]
  components      jsonb not null default '[]'::jsonb,
  weights_version text,
  computed_at     timestamptz not null default now()
);
create index if not exists idx_lead_score on public.lead_scores(organization_id, score desc);

-- Every call for a lead. The legacy webhook returned 409 on a repeat address,
-- discarding second calls outright and making this impossible.
create table if not exists public.lead_calls (
  lead_id         uuid not null references public.leads_v2(id) on delete cascade,
  call_id         uuid not null references public.calls_v2(id) on delete cascade,
  primary key (lead_id, call_id)
);

-- ============================================================ GOALS
create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Exactly one scope must be set; enforced by the check below.
  profile_id      uuid references public.profiles(id) on delete cascade,
  team_id         uuid references public.teams(id) on delete cascade,
  campaign_id     uuid references public.campaigns_v2(id) on delete cascade,
  period          rt_goal_period not null,
  metric          text not null default 'leads',   -- 'leads' | 'calls' | 'appointments'
  target          numeric not null,
  starts_on       date not null,
  ends_on         date not null,
  created_at      timestamptz not null default now(),
  constraint goal_scope_exactly_one check (
    (profile_id is not null)::int + (team_id is not null)::int + (campaign_id is not null)::int <= 1
  )
);
create index if not exists idx_goals_org on public.goals(organization_id, period, starts_on desc);

-- ============================================================ ROLLUPS
-- What dashboards read. Never scan raw calls.
--
-- CRITICAL: sums and counts only — never an average. You cannot average
-- daily averages into a correct weekly average when volumes differ. Store
-- qa_score_sum + qa_score_n; divide at read time. Storing avg is how two
-- dashboards start disagreeing, and it is unfixable after the fact.

create table if not exists public.agent_day_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  campaign_id     uuid references public.campaigns_v2(id) on delete set null,
  day             date not null,
  calls           int not null default 0,
  connects        int not null default 0,
  contacts        int not null default 0,
  leads           int not null default 0,
  appointments    int not null default 0,
  talk_seconds    bigint not null default 0,
  qa_score_sum    numeric not null default 0,
  qa_score_n      int not null default 0,
  compliance_flags int not null default 0,
  computed_at     timestamptz not null default now(),
  primary key (organization_id, profile_id, campaign_id, day)
);
create index if not exists idx_ads_day on public.agent_day_stats(organization_id, day desc);

create table if not exists public.team_day_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id         uuid not null references public.teams(id) on delete cascade,
  day             date not null,
  calls           int not null default 0,
  connects        int not null default 0,
  contacts        int not null default 0,
  leads           int not null default 0,
  appointments    int not null default 0,
  talk_seconds    bigint not null default 0,
  qa_score_sum    numeric not null default 0,
  qa_score_n      int not null default 0,
  compliance_flags int not null default 0,
  computed_at     timestamptz not null default now(),
  primary key (organization_id, team_id, day)
);

create table if not exists public.campaign_day_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns_v2(id) on delete cascade,
  day             date not null,
  calls           int not null default 0,
  connects        int not null default 0,
  contacts        int not null default 0,
  leads           int not null default 0,
  appointments    int not null default 0,
  talk_seconds    bigint not null default 0,
  qa_score_sum    numeric not null default 0,
  qa_score_n      int not null default 0,
  compliance_flags int not null default 0,
  computed_at     timestamptz not null default now(),
  primary key (organization_id, campaign_id, day)
);

create table if not exists public.org_day_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day             date not null,
  calls           int not null default 0,
  connects        int not null default 0,
  contacts        int not null default 0,
  leads           int not null default 0,
  appointments    int not null default 0,
  talk_seconds    bigint not null default 0,
  qa_score_sum    numeric not null default 0,
  qa_score_n      int not null default 0,
  compliance_flags int not null default 0,
  -- Python-computed 0..100. Components stored so the number is explainable.
  health_score    numeric,
  health_components jsonb,
  computed_at     timestamptz not null default now(),
  primary key (organization_id, day)
);

-- ============================================================ ALERTS
create table if not exists public.alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_key        text not null,              -- 'no_leads_n_days' | 'campaign_conv_drop' | ...
  severity        rt_severity not null default 'warning',
  title           text not null,
  detail          text,
  -- The numbers behind it. An alert must be able to show its work.
  evidence        jsonb not null default '{}'::jsonb,
  profile_id      uuid references public.profiles(id) on delete cascade,
  team_id         uuid references public.teams(id) on delete cascade,
  campaign_id     uuid references public.campaigns_v2(id) on delete cascade,
  -- Dedupe window so an alert doesn't re-fire every rollup.
  fingerprint     text not null,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  resolved_at     timestamptz
);
create unique index if not exists uq_alert_open on public.alerts(organization_id, fingerprint)
  where resolved_at is null;
create index if not exists idx_alerts_open on public.alerts(organization_id, severity, last_seen_at desc)
  where resolved_at is null;

-- ============================================================ ACTION PLAN
-- Fully automatic. This decides whether a real person gets put on a
-- performance plan, so every enrollment must be explainable — the inputs are
-- stored, not just the verdict. "The algorithm said so" is not defensible to
-- an agent, a manager, or an employment lawyer.

create table if not exists public.action_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  close_reason    text,                       -- 'recovered' | 'manual' | 'inactive'
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_action_open on public.action_plans(organization_id, profile_id)
  where closed_at is null;

create table if not exists public.action_plan_events (
  id              uuid primary key default gen_random_uuid(),
  action_plan_id  uuid references public.action_plans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  event           text not null,              -- 'evaluated' | 'opened' | 'closed' | 'suppressed'
  -- The full basis: window, counts, target, computed probability, threshold.
  -- This is what we show the agent. Non-negotiable.
  evidence        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ape_profile on public.action_plan_events(organization_id, profile_id, created_at desc);

-- ============================================================ FEED
-- The homepage. Not charts — a live activity stream.

create table if not exists public.feed_events (
  id              bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            rt_feed_kind not null,
  severity        rt_severity not null default 'info',
  title           text not null,
  detail          text,
  -- Deep-link target so a manager can drill down in one click.
  link_path       text,
  profile_id      uuid references public.profiles(id) on delete cascade,
  team_id         uuid references public.teams(id) on delete cascade,
  campaign_id     uuid references public.campaigns_v2(id) on delete cascade,
  evidence        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_feed_org on public.feed_events(organization_id, created_at desc);

-- ============================================================ KNOWLEDGE BASE
-- Structured history the AI reads for context. NOT AI memory — Python writes
-- the facts, AI only reads them. Keeps coaching personalized without letting
-- the model invent its own history.

create table if not exists public.knowledge_facts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- 'agent' | 'team' | 'campaign' | 'org' | 'lead'
  subject_kind    text not null,
  subject_id      uuid not null,
  fact_key        text not null,              -- 'recurring_weakness' | 'trend_4w' | ...
  fact            jsonb not null,
  -- Where it came from, so a fact is never unattributable.
  derived_from    text,
  valid_from      date not null default current_date,
  valid_to        date,
  created_at      timestamptz not null default now()
);
create index if not exists idx_kf_subject on public.knowledge_facts(organization_id, subject_kind, subject_id, fact_key);

-- Coaching history — replaces the dropped training_* tables. The concept the
-- spec wants ("Coaching History" per agent); none of the real-estate shape.
create table if not exists public.coaching_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  call_id         uuid references public.calls_v2(id) on delete set null,
  author_id       uuid references public.profiles(id) on delete set null,
  -- 'ai' when generated from a call analysis, 'human' when a manager wrote it.
  origin          text not null default 'ai',
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_coach_profile on public.coaching_notes(organization_id, profile_id, created_at desc);

-- ---------------------------------------------------------------- touch
create or replace function public.rt_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ begin
  create trigger trg_campaigns_v2_touch before update on public.campaigns_v2
    for each row execute function public.rt_touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_leads_v2_touch before update on public.leads_v2
    for each row execute function public.rt_touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_jobs_touch before update on public.jobs
    for each row execute function public.rt_touch_updated_at();
exception when duplicate_object then null; end $$;
