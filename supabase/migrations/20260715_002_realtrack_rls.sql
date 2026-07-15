-- =====================================================================
-- RealTrack — RLS for the core pivot schema
-- Depends on 20260715_001_realtrack_core.sql. Run after it.
--
-- Reuses the existing helpers from 0002_rls.sql:
--   current_org_id()   — the caller's org
--   has_perm(text)     — permission matrix lookup (handles legacy roles)
--
-- Every table below gets RLS ENABLED. That is not optional: PostgREST
-- exposes each of these to the anon key by default, so a table without RLS
-- is a public table. Tables that only the server should ever touch get
-- RLS ON with NO policies — default-deny for anon/authenticated, while the
-- service-role key bypasses RLS by design.
-- =====================================================================

-- ============================================ SERVER-ONLY (default-deny)
-- No policies by design. RLS on + zero policies = nothing gets through
-- except the service role. These hold raw payloads and credentials.

-- Raw dialer payloads. Can contain PII and whatever the dialer chose to send.
alter table public.ingest_events enable row level security;

-- Internal queue. No client has any business reading it.
alter table public.jobs enable row level security;

-- Contains password_enc. Even ciphertext should not be client-readable:
-- an offline attack needs the ciphertext first, so don't hand it out.
alter table public.dialer_connections enable row level security;

-- Contains secret_hash. Same reasoning.
alter table public.webhook_endpoints enable row level security;

-- ============================================================ CAMPAIGNS
alter table public.campaigns_v2 enable row level security;

drop policy if exists c2_select on public.campaigns_v2;
create policy c2_select on public.campaigns_v2 for select
  using (organization_id = public.current_org_id());

drop policy if exists c2_write on public.campaigns_v2;
create policy c2_write on public.campaigns_v2 for all
  using (organization_id = public.current_org_id() and public.has_perm('org.manage'))
  with check (organization_id = public.current_org_id());

alter table public.campaign_aliases enable row level security;

drop policy if exists ca_select on public.campaign_aliases;
create policy ca_select on public.campaign_aliases for select
  using (organization_id = public.current_org_id());

drop policy if exists ca_write on public.campaign_aliases;
create policy ca_write on public.campaign_aliases for all
  using (organization_id = public.current_org_id() and public.has_perm('org.manage'))
  with check (organization_id = public.current_org_id());

-- ============================================================ AGENTS
alter table public.agent_identities enable row level security;

drop policy if exists ai_select on public.agent_identities;
create policy ai_select on public.agent_identities for select
  using (organization_id = public.current_org_id());

drop policy if exists ai_write on public.agent_identities;
create policy ai_write on public.agent_identities for all
  using (organization_id = public.current_org_id() and public.has_perm('users.manage'))
  with check (organization_id = public.current_org_id());

-- ============================================================ CALLS
alter table public.calls_v2 enable row level security;

drop policy if exists cv2_select on public.calls_v2;
create policy cv2_select on public.calls_v2 for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));
-- Writes are Python-side (service role) only. No client insert path.

-- Recording ROW visibility = anyone who can view leads.
-- play-vs-download is NOT row-level (both need the row); it is enforced at
-- the API layer, which checks has_perm('calls.download') before signing a
-- URL with attachment disposition. Same model as the legacy calls table.
alter table public.recordings enable row level security;

drop policy if exists rec_select on public.recordings;
create policy rec_select on public.recordings for select
  using (organization_id = public.current_org_id() and public.has_perm('calls.play'));

alter table public.transcripts enable row level security;

drop policy if exists tr_select on public.transcripts;
create policy tr_select on public.transcripts for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));

-- ============================================================ ANALYSIS
alter table public.call_analyses enable row level security;

drop policy if exists an_select on public.call_analyses;
create policy an_select on public.call_analyses for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));
-- Written only by the analytics service. Clients never write AI output.

alter table public.call_metrics enable row level security;

drop policy if exists cm_select on public.call_metrics;
create policy cm_select on public.call_metrics for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));
-- Python-only writes. A client that could write here could forge a KPI.

-- ============================================================ LEADS
alter table public.leads_v2 enable row level security;

drop policy if exists l2_select on public.leads_v2;
create policy l2_select on public.leads_v2 for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));

drop policy if exists l2_insert on public.leads_v2;
create policy l2_insert on public.leads_v2 for insert
  with check (organization_id = public.current_org_id() and public.has_perm('leads.edit'));

drop policy if exists l2_update on public.leads_v2;
create policy l2_update on public.leads_v2 for update
  using (organization_id = public.current_org_id() and public.has_perm('leads.edit'))
  with check (organization_id = public.current_org_id());

drop policy if exists l2_delete on public.leads_v2;
create policy l2_delete on public.leads_v2 for delete
  using (organization_id = public.current_org_id() and public.has_perm('leads.delete'));

alter table public.lead_scores enable row level security;

drop policy if exists ls_select on public.lead_scores;
create policy ls_select on public.lead_scores for select
  using (organization_id = public.current_org_id() and public.has_perm('leads.view'));
-- Python-only writes: a writable score is a forgeable score.

alter table public.lead_calls enable row level security;

drop policy if exists lc_select on public.lead_calls;
create policy lc_select on public.lead_calls for select
  using (exists (
    select 1 from public.leads_v2 l
    where l.id = lead_calls.lead_id
      and l.organization_id = public.current_org_id()
  ) and public.has_perm('leads.view'));

-- ============================================================ GOALS
alter table public.goals enable row level security;

drop policy if exists g_select on public.goals;
create policy g_select on public.goals for select
  using (organization_id = public.current_org_id());

drop policy if exists g_write on public.goals;
create policy g_write on public.goals for all
  using (organization_id = public.current_org_id() and public.has_perm('org.manage'))
  with check (organization_id = public.current_org_id());

-- ============================================================ ROLLUPS
-- Read-only to clients. Python owns every write. If a client could write a
-- rollup, every dashboard number would be advisory rather than factual.

alter table public.agent_day_stats enable row level security;
drop policy if exists ads_select on public.agent_day_stats;
create policy ads_select on public.agent_day_stats for select
  using (organization_id = public.current_org_id());

alter table public.team_day_stats enable row level security;
drop policy if exists tds_select on public.team_day_stats;
create policy tds_select on public.team_day_stats for select
  using (organization_id = public.current_org_id());

alter table public.campaign_day_stats enable row level security;
drop policy if exists cds_select on public.campaign_day_stats;
create policy cds_select on public.campaign_day_stats for select
  using (organization_id = public.current_org_id());

alter table public.org_day_stats enable row level security;
drop policy if exists ods_select on public.org_day_stats;
create policy ods_select on public.org_day_stats for select
  using (organization_id = public.current_org_id());

-- ============================================================ ALERTS
alter table public.alerts enable row level security;

drop policy if exists al_select on public.alerts;
create policy al_select on public.alerts for select
  using (organization_id = public.current_org_id());
-- Python raises and resolves. Humans don't get to silence a metric by hand.

-- ============================================================ ACTION PLAN
-- An agent can see their OWN action plan. That is deliberate: a system that
-- silently files people into performance plans they can't see is indefensible.
-- Managers see everyone in the org.

alter table public.action_plans enable row level security;

drop policy if exists ap_select on public.action_plans;
create policy ap_select on public.action_plans for select
  using (
    organization_id = public.current_org_id()
    and (profile_id = auth.uid() or public.has_perm('users.manage'))
  );

alter table public.action_plan_events enable row level security;

drop policy if exists ape_select on public.action_plan_events;
create policy ape_select on public.action_plan_events for select
  using (
    organization_id = public.current_org_id()
    and (profile_id = auth.uid() or public.has_perm('users.manage'))
  );

-- ============================================================ FEED
alter table public.feed_events enable row level security;

drop policy if exists fe_select on public.feed_events;
create policy fe_select on public.feed_events for select
  using (organization_id = public.current_org_id());

-- ============================================================ KNOWLEDGE
alter table public.knowledge_facts enable row level security;

drop policy if exists kf_select on public.knowledge_facts;
create policy kf_select on public.knowledge_facts for select
  using (organization_id = public.current_org_id());

alter table public.coaching_notes enable row level security;

drop policy if exists cn_select on public.coaching_notes;
create policy cn_select on public.coaching_notes for select
  using (
    organization_id = public.current_org_id()
    and (profile_id = auth.uid() or public.has_perm('leads.view'))
  );

drop policy if exists cn_insert on public.coaching_notes;
create policy cn_insert on public.coaching_notes for insert
  with check (organization_id = public.current_org_id() and public.has_perm('users.manage'));
