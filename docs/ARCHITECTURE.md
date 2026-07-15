# RealTrack — Architecture

**The Intelligence Layer for Modern Call Centers**

Status: proposed, awaiting sign-off. Written 2026-07-15.

This document is the design gate for the pivot from *Closer's Office* (a real-estate
call-floor tool) to *RealTrack* (a vertical-agnostic performance OS). No production code
lands until the decisions below are agreed.

---

## 1. The one thing that matters most

**Today, a lead *is* a call. That is the bug at the heart of the data model.**

The live `leads` table carries the recording, the transcript, the AI verdict, the agent
name, and the outcome all on one row. There is a `calls` table, but it holds only
recording-file metadata hanging off a lead.

That model cannot answer the questions the product is being built to answer:

| The dashboard asks | Why the current model can't answer |
| --- | --- |
| Calls Today / Week / Month | Only *qualified* calls become rows. Calls that produced nothing don't exist. |
| Connection Rate | Needs attempts as the denominator. Attempts are never stored. |
| Contact Rate | Needs dial → connect → conversation. Never stored. |
| Lead Rate | `leads ÷ calls`. The denominator doesn't exist. |
| "Ahmed produced no leads for 4 days" | Indistinguishable from "Ahmed made no calls" or "Ahmed was on PTO". |

Every rate metric in the vision doc has **calls in the denominator**, and we currently
only persist the numerator. This is not a reporting gap that a query can close — the data
was never captured.

### The fix: invert the model

```
call  (the atom — every dial, connected or not)
  ├── recording      0..1
  ├── transcript     0..1
  ├── call_analysis  0..1   ← AI prose + extracted signals
  ├── call_metrics   0..1   ← Python numbers
  └── lead           0..1   ← an *outcome* of a call, not a synonym for one
```

A call always exists. A lead is something a call sometimes produces. Once calls are the
atom, every rate metric becomes a straightforward aggregate, and "no leads for 4 days"
becomes distinguishable from "no calls for 4 days" — which are opposite management
problems with opposite responses.

This single change is what makes the rest of the vision computable. Everything below
depends on it.

---

## 2. Services

Three deployables. No new stacks introduced.

```
┌─────────────────────┐     ┌──────────────────────┐
│  web/  (Next.js 15) │     │ analytics/ (FastAPI) │
│  Cloudflare Pages   │     │       Fly.io         │
│  React · TS · TW    │     │  Polars · pandas     │
│  shadcn/ui · ECharts│     │                      │
└──────────┬──────────┘     └──────────┬───────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
              Supabase (Postgres)
              Auth · Storage · RLS
```

| Concern | Home | Why |
| --- | --- | --- |
| UI, dashboards, feed | `web/` | Already live, already React+TS+Tailwind, owns the domain. |
| Dialer webhook ingest | `web/` | Dialers are already pointed at `realtrack.app/api/inbound/*`. Keep the URL stable. |
| KPIs, rollups, scoring, forecasting, alerts | `analytics/` | Python is the single source of truth for numbers. |
| STT + AI orchestration | `analytics/` | Slow, retryable, must not block a webhook. |
| Data, auth, files | Supabase | It *is* Postgres. Auth, RLS, and Storage already work. |

### On the spec'd stack

The prompt asks for React + TS + Tailwind + shadcn/ui + FastAPI + PostgreSQL + Polars +
DuckDB + ECharts. We land **all of it except DuckDB**, and we get there by evolving what
exists rather than starting over:

- React / TS / Tailwind — already in the live app.
- shadcn/ui + ECharts — add; replace Recharts.
- FastAPI + Python + Polars — the `analytics/` service.
- PostgreSQL — Supabase already is Postgres.

**Recommendation: drop DuckDB for now.** Aggregation belongs where the data already
lives; shipping rows out of Postgres into DuckDB to add them up is a net loss. Postgres
does the rollups, Polars does the statistics and forecasting in-process. DuckDB earns its
place later *if* we add long-range historical analysis over Parquet in object storage —
that's a real use case, just not a day-one one. Adopting it now would be cargo cult.

---

## 3. Pipeline

```
Dialer
  │  webhook
  ▼
web/api/inbound/call ──── validate key, write raw event, 200 in <50ms
  │
  ▼
ingest_events ─────────── append-only, never mutated (replayable)
  │
  ▼
jobs ──────────────────── Postgres queue, FOR UPDATE SKIP LOCKED
  │
  ▼
analytics/ worker
  ├─ normalize        → call
  ├─ STT (provider)   → transcript
  ├─ AI (provider)    → call_analysis   (prose + signals)
  ├─ Python           → call_metrics    (numbers)
  ├─ Python           → lead + lead_score, if qualified
  └─ Python           → rollup the affected day
  │
  ▼
*_day_stats ──────────── what dashboards actually read
  │
  ▼
alerts · action_plans · feed_events
```

**The webhook never does slow work.** It validates, appends to `ingest_events`, enqueues,
and returns. A dialer that times out will retry and duplicate; a dialer that gets a fast
200 will not.

**`ingest_events` is append-only.** Every downstream table is derivable from it. When the
AI prompt changes or a scoring rule is fixed, we replay rather than backfill by hand. This
is the difference between a system you can correct and one you can only apologize for.

**Queue is Postgres, not Redis.** `SELECT … FOR UPDATE SKIP LOCKED` handles far more
throughput than this product will see for a long time, and it's one less thing to run,
pay for, and page someone about. Revisit if sustained throughput passes ~100 jobs/sec.

---

## 4. The Python / AI boundary

The vision says *Python calculates, AI explains*. Taken literally that's ambiguous, because
lead scoring ("Interested → +20, Asked About Timeline → +15") needs a judgement about
what happened on the call before any arithmetic can occur. Something has to decide
"was this person interested?" — and that's not arithmetic.

So the boundary is drawn one level deeper:

> **AI extracts signals. Python does every calculation over those signals.**

| Layer | Owner | Output | Example |
| --- | --- | --- | --- |
| Signal extraction | AI | booleans / enums / spans | `interested: true`, `asked_timeline: true`, `sentiment: positive` |
| Scoring | Python | numbers | `20 + 15 + 20 = 55` |
| Explanation | AI | prose | "This lead is likely to close because…" |

This is enforced structurally, not by convention:

- `call_analyses.signals` (jsonb) — AI writes. Booleans and enums only. **No numbers used
  in any KPI.**
- `call_analyses.narrative` — AI prose. Read by humans, never by a calculation.
- `call_metrics`, `lead_scores`, `*_day_stats` — Python writes. **AI has no write path.**

Consequence: identical inputs always yield identical KPIs, scores are auditable line by
line, and re-scoring after a weight change is a Python re-run costing nothing — no
re-inference, no LLM spend. If the AI ever wrote a number that reached a dashboard, none
of that would hold.

---

## 5. Campaigns are the configuration surface

The current analyzer hardcodes real estate: "Four Pillars", Zillow Zestimate thresholds,
`HOT = asking ≤ 70% of Zestimate`. The pivot doesn't delete that logic — it demotes it
from *the product* to *one campaign template*.

Each campaign owns:

| Field | Purpose |
| --- | --- |
| `persona_prompt` | Who the AI is for this campaign |
| `signal_schema` (jsonb) | The signals to extract — **defines the AI's output contract** |
| `scoring_weights` (jsonb) | Python's points per signal |
| `qualification_rules` (jsonb) | Python's lead / not-a-lead decision |
| `disposition_map` (jsonb) | Dialer disposition → canonical outcome |
| `success_definition` | What "good" means here |
| `script`, `kpi_targets` | Required script; per-campaign targets |

Solar, insurance, Medicare, debt, and real estate become rows, not branches. Real estate
ships as a seed template — so **the pivot generalizes the current capability instead of
losing it**, which matters given it's the only vertical with a proven prompt today.

`signal_schema` doubles as the JSON schema we constrain the model's output to, which kills
the `parse_verdict_json` guesswork in the current analyzer.

---

## 6. Multi-tenancy

Keep what works: `organization_id` on every tenant row, RLS everywhere, Supabase Auth.

Two things to fix during the pivot:

1. **Dual ownership.** Live rows carry both `user_id` and `organization_id`/`assigned_to`
   (a half-finished bridge in `0004_bridge_backfill.sql`). New tables use
   `organization_id` + `agent_id`. One model, no bridge.
2. **`profiles.gemini_api_key` is a plaintext credential in a queryable table.** Reachable
   by anything that can read `profiles`. Move to the encrypted store already used for
   Readymode passwords (AES-GCM via `ENC_KEY`). Tracked as a security fix, not a
   refactor.

---

## 7. What gets deleted

Confirmed full pivot. Real estate survives only as a campaign template.

| Drop | Tables |
| --- | --- |
| Payroll / HR / payments | `agent_pay`, `comp_titles`, `payroll_settings`, `invoices` |
| Real-estate specifics | `cash_buyers`, `property_data_cache`, `propytrace_lookups`, `zillow_api_keys` |
| Real-estate columns on `leads` | `arv`, `arv_confidence`, `asking_price`, `market_value`, `extracted_address` |
| Real-estate services | `services/arv.ts`, `services/propertyDataProvider.ts`, `lib/zillow-keys.ts` |

**Open question — training tables.** `trainers`, `training_batches`, `training_materials`,
`training_sessions`, `training_snippets` read as HR ("remove HR"), but coaching is core to
the vision ("Coaching History" on every agent profile). My read: the *concept* survives as
coaching history, the *current tables* don't fit the new model. Flagging rather than
deciding — see §10.

Nothing is dropped until the new schema is live and the pivot is proven. Deletion is a
final, separate migration.

---

## 8. Rollups

Dashboards never scan raw calls. Python maintains:

- `agent_day_stats` — per agent × campaign × day
- `team_day_stats`
- `campaign_day_stats`
- `org_day_stats`

Columns: `calls, connects, contacts, leads, appointments, talk_seconds, qa_score_sum,
qa_score_n, compliance_flags`.

Sums and counts only — **never store an average**. Store `sum` and `n`, divide at read
time. Averages don't re-aggregate: you cannot average daily averages into a correct weekly
average when daily call volumes differ. Storing `avg` is how dashboards start disagreeing
with each other, and it's unfixable after the fact.

Two write paths:
- **Incremental** — on each call, recompute that (agent, campaign, day) cell.
- **Nightly full recompute** — last 7 days, from `ingest_events`. Self-healing; a dropped
  job costs correctness for hours, not forever.

---

## 9. Action Plan — the statistical claim

The spec: auto-enroll when an agent is "statistically unlikely" to hit target for two
consecutive weeks; auto-remove on improvement.

This feature decides whether a real person gets put on a performance plan. It must be
defensible, and "the algorithm said so" is not defensible to an agent, a manager, or an
employment lawyer.

Proposed, explicitly for review:

- Model weekly leads per agent as a Poisson-ish rate from a trailing 8-week window.
- `P(hit target)` = probability the projected week-end count clears target, given pace so
  far and days remaining.
- Enroll when `P < 0.20` for **two consecutive completed weeks** (never mid-week — pace
  early in a week is noise).
- Remove after **two consecutive weeks at ≥ 100%**.
- Suppress entirely when `calls < 20/week` (insufficient data, or PTO — the model must not
  confuse absence with failure).
- Every enrollment writes its inputs to `action_plan_events`: the window, the counts, the
  computed probability. **An agent can be shown exactly why.**

The thresholds are guesses and should be tuned on real data. They are config, not code.

---

## 10. Decisions needed before code

1. **Invert calls/leads** (§1) — the whole design rests on this.
2. **Drop DuckDB** (§2) — Postgres aggregates, Polars forecasts.
3. **AI extracts signals, Python scores them** (§4) — the literal reading of "AI never
   calculates" is unimplementable; this is the workable version.
4. **Training tables** (§7) — keep as coaching history, or drop as HR?
5. **Action Plan thresholds** (§9) — P < 0.20, 2 weeks, 20-call floor. Real numbers
   affecting real people; needs a human decision.
6. **Dialer truth** — see §11. This is the one that decides whether the product is
   buildable as specified.

---

## 11. The dialer feed — the biggest risk in the product

The architecture diagram in the brief says `Dialer → Webhook → RealTrack`. That is not
what exists, and the gap is load-bearing.

### What actually exists

There are **three** separate Readymode paths, and not one of them is an API:

| Path | Mechanism | Yields |
| --- | --- | --- |
| `/api/inbound/lead` | Readymode POSTs a form on disposition | One post per *dispositioned lead* |
| `agent-report` | **Screen-scrape** of the admin panel | Agent *hours* (logged/ready/break/AFK) — no call counts |
| `readymode.pull_calls` | **Screen-scrape** of "Research Calls" | Per-call rows + recording links |

The two scrapers log in with **the customer's Readymode admin username and password**,
then probe candidate URLs (`/CCS%20Reports/agent`, `…/results.json`, …) and parse whatever
comes back. The code picks "the largest `<table>` on the page" and regexes recording IDs
out of row HTML. `readymode.py` says outright: *"No reliable JSON schema known yet."*
Recording URLs are reverse-engineered from a numeric ID (`id % 100` / `(id/100) % 100`).

This is not a criticism of whoever built it — it's clearly the result of Readymode not
offering what was needed. But it needs to be named plainly, because the entire analytics
vision is being stacked on top of it.

### Why it threatens the vision

Every rate metric — Connection Rate, Contact Rate, Lead Rate, Appointment Rate — needs
**calls in the denominator**. Today the only per-call source is a screen scraper against a
third-party admin panel that can change its HTML without notice, authenticated with a
customer's admin password. Company Health, rankings, forecasting, Action Plan enrollment
and the alert engine would all inherit that fragility. An agent could be auto-enrolled in a
performance plan because a vendor shipped a UI change on a Tuesday.

### The reframe: the data may already be arriving, and we're deleting it

`/api/inbound/lead` already accepts a `disposition` field and already stores it in
`metadata`. If Readymode is configured to post on **every** disposition rather than only
qualified ones, then **the per-call feed already exists** — and the app is throwing it away
in two places:

1. It treats every post as a *lead*, so non-qualifying calls become nothing.
2. Duplicate detection returns **409 on a repeat address** unless the prior status is
   `disqualified` / `error` / `needs call`. **A second call to the same person is
   discarded.** That single rule makes per-lead call history impossible — and call history
   is on the spec for every lead.

If that's what's happening, the §1 inversion isn't just a schema change — it's the thing
that stops us discarding the data the product needs, and no scraper is required for the
core metrics.

### VERIFIED against live data (2026-07-15)

Read 120 recent leads and their stored `metadata._raw_webhook`. The dialer's actual post,
verbatim and complete:

```json
{
  "firstName": "Matthew", "lastName": "Lopez", "seller_name": "Matthew Lopez",
  "phone": "(773) 562-5354", "address": "7606 S Oketo Ave, Bridgeview IL, 60455",
  "city": "Bridgeview", "state": "IL", "zip": "60455", "notes": "",
  "campaign_id": "78bf4842-0737-4045-9e81-7ff15c82158b",
  "campaign": "SWAT", "agent_name": "hagag"
}
```

Twelve fields. All contact data. **The verdict is unambiguous:**

- **No `disposition`.** The `Body` interface parses one; the dialer has never sent one.
  Distinct dispositions across 120 leads: **zero**.
- **No call ID, no timestamp, no duration, no recording ID, no audio URL.**

**This is a lead-submission webhook, not a call feed.** It fires when an agent submits a
lead. Calls that don't produce a lead generate no post and leave no trace.

Therefore: **Connection Rate, Contact Rate, Lead Rate, Appointment Rate, and Calls
Today/Week/Month are not computable from the webhook.** Not "hard" — the events don't
exist. The only per-call source in the system is the Research Calls scrape.

### Also verified — corrections and live defects

**The recording pipeline works.** `call_uploads` holds **167 rows** (`readymode-42689.mp3`,
~1.6MB each). The login → fetch → store path does what §11's intro implies it might not.
But `leads.has_call_recording` is `false` and `leads.call_recording_url` is `null` on
**120/120** — those columns are dead, and the truth lives in `call_uploads`. This is the
four-audio-columns problem: any dashboard trusting `has_call_recording` reports zero
recordings while 167 sit in the bucket.

**Campaign attribution is ~1%.** `campaigns` contains exactly two rows — `tx` and `tx hb`.
The dialer posts `campaign: "SWAT"` with Readymode's own `campaign_id` UUID. Neither
resolves, so **119 of 120 leads have no campaign**. Campaign Intelligence and Campaign
Analytics — two headline modules — currently have no data to stand on.

**38% of leads fail analysis.** 46/120 sit at `Error` with `"Analysis failed — please
re-run."` — one generic string, no diagnostics. No way to tell a bad audio fetch from a
Gemini quota error from a parse failure.

**The `calls` table has 0 rows.** Never populated. Empirical proof that a lead *is* a call
here.

**Duplicate fetches.** `readymode-42689.mp3` is stored twice for the same lead, 0.5s apart
— a race in the fetch path. 167 uploads against 161 leads.

**Effectively single-tenant.** `readymode_connections` is empty, so every Readymode call
falls back to the `.env` credentials. `profiles` has 1 row against 8 `organizations`.

**Feed is idle.** Most recent lead: 2026-06-24. Three weeks stale.

### Recommended plan

The two feeds are complementary, and the pieces already exist:

| Feed | Source | Gives |
| --- | --- | --- |
| **Calls** (denominator) | Research Calls scrape — `pull_calls()`, already written in Python | Every call: date, agent, campaign, recording link |
| **Leads** (numerator) | Existing webhook | Agent-submitted qualified leads |

Join scraped calls to webhook leads on `(agent, phone, time-window)`. That yields real rate
metrics without waiting on Readymode. The scrape moves to `analytics/` on a schedule — no
edge timeout, proper retries — which is what `realtrack-py` was already reaching for.

Accepted risk: the call feed depends on a screen scraper. Mitigation is non-negotiable —
validate shape on every run, alert on drift, and **never emit a silent zero**. A broken
scraper must read "feed broken", never "0 calls", because only one of those gets fixed.

Still worth asking Readymode whether a reporting API exists. It would retire the scraper
outright. Worth one support email before we invest in hardening the scrape.

### Interim hardening (regardless of outcome)

- Move both scrapers out of Cloudflare edge into `analytics/`. They are fighting a 30s
  wall-clock budget today — the git history is a run of timeout fixes ("per-fetch timeouts
  + shorter candidate list to avoid Cloudflare 502").
- The webhook currently downloads **up to 500MB of audio inline** before responding. That
  belongs in a job, behind `ingest_events`.
- Treat scraped output as untrusted: validate shape, alert on drift, never silently emit
  zeros. A scraper that breaks must fail loudly — a dashboard reading "0 calls" is worse
  than one reading "feed broken", because only one of them gets fixed.
- `_raw_webhook` is currently stored to reverse-engineer the dialer's field names
  (*"Remove after we confirm field names"*). `ingest_events` makes that permanent and
  principled instead of a debug leftover.
