-- ===========================================================================
-- Webhook export URL, agent scorecard cache, training snippets table.
-- ===========================================================================

alter table public.organizations
  add column if not exists export_webhook_url text;

-- Agent scorecard: rolling AI grade per cold caller. Refreshed by a server
-- route the dashboard hits when the user opens Agents or Leaderboard.
create table if not exists public.agent_scorecards (
  agent_name      text primary key,                   -- matches leads.agent_name
  organization_id uuid references public.organizations(id) on delete cascade,
  grade           numeric not null default 0,         -- 0..100
  rationale       text,
  strengths       jsonb,                              -- array of strings
  weaknesses      jsonb,                              -- array of strings
  leads_counted   integer not null default 0,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_agent_scorecards_org on public.agent_scorecards(organization_id);

-- Highlight snippets shared to Trainers.
create table if not exists public.training_snippets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete cascade,
  title           text not null,
  note            text,
  start_ms        integer not null,
  end_ms          integer not null,
  source_url      text not null,                      -- signed/source audio URL at capture time
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_training_snippets_org  on public.training_snippets(organization_id);
create index if not exists idx_training_snippets_lead on public.training_snippets(lead_id);
