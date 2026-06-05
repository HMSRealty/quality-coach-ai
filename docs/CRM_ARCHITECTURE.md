# RealTrack CRM — Architecture (Multi-tenant, RBAC, Call QA + Lead Intelligence)

This document is the implementation blueprint. The **additive foundation** (schema,
RLS, RBAC engine, property/ARV services, SSR auth) already lives in the repo and
does not touch the running app. The **route handlers + UI** below are written
against the new schema and drop into `app/` once the migrations are applied.

---

## 1. System architecture (text diagram)

```
                         ┌────────────────────────────────────────────┐
                         │                 BROWSER (RSC + Client)        │
                         │  Landing · Dashboard · Kanban · Lead · Admin  │
                         └───────────────┬───────────────┬──────────────┘
                                         │ cookie session│ fetch()
                        (1) auth gate    │               │
                   ┌─────────────────────▼──────┐   ┌─────▼───────────────────────┐
                   │   middleware.ts (SSR)        │   │  Next.js Route Handlers     │
                   │   getUser() → redirect       │   │  /api/leads/submit          │
                   └─────────────────────┬────────┘   │  /api/calls/[id]/url        │
                                         │            │  /api/admin/delete-user     │
                                         │            └──────┬───────────┬──────────┘
                                         │                   │ anon JWT  │ service role
                                         ▼                   ▼           ▼
                   ┌───────────────────────────────────────────────────────────────┐
                   │                         SUPABASE                               │
                   │  Auth (auth.users)                                             │
                   │  Postgres + RLS  ── current_org_id() / has_perm() gate rows    │
                   │     organizations · profiles · roles · role_permissions        │
                   │     teams · team_members · leads · lead_status_history         │
                   │     calls · lead_events · property_data_cache (server-only)    │
                   │  Storage  ── private bucket "call-recordings" (signed URLs)    │
                   │  Realtime ── leads / lead_events live updates                  │
                   └───────────────┬───────────────────────────────────────────────┘
                                   │  service-role only (server)
              ┌────────────────────▼─────────────────────┐
              │      SERVICE LAYER (vendor-agnostic)       │
              │  services/propertyDataProvider.ts          │  ← swap vendor by ENV
              │  services/arv.ts (heuristic AVM)           │
              └────────────────────┬─────────────────────┘
                                   │ abstracted (no vendor lock-in)
                   ┌───────────────▼────────────────┐
                   │  External providers (ENV keys)  │
                   │  PROPERTY_PROVIDER=mock|rapidapi │
                   │  GEMINI_API_KEY (QA pipeline)    │
                   └─────────────────────────────────┘
```

**Two security layers, always:** the UI hides what a role can't do (`lib/rbac.ts`,
`<Can>`), and Postgres RLS independently rejects anything a crafted client tries.
The DB is the real boundary; the UI is UX.

**Two axes on a lead:** `status` = QA verdict (Hot/Warm/Cold/…); `stage` = sales
pipeline (New → Contacted → Negotiating → Won/Lost). Don't conflate them.

---

## 2. Lead submission pipeline

`POST /api/leads/submit` (server route, runs with the caller's JWT for the insert,
service role for enrichment + cache):

```
A. Validate input + RBAC (assertCan(role, "leads.edit"))
B. Property enrichment  →  lookupProperty(address, cache)      [services/propertyDataProvider]
C. ARV                  →  calculateArv({ subjectSqft, comparables, condition, zipMultiplier })
D. Insert lead          →  status:'processing', stage:'new', market_value, arv, arv_confidence
   (trigger sets submission_date = EST today; writes 'created' lead_event)
E. Kick QA analysis     →  existing Gemini two-pass route updates status + coaching
F. Return { leadId }    →  client subscribes to Realtime for the verdict
```

Reference implementation:

```ts
// app/api/leads/submit/route.ts   (drop in after migrations)
import { createClient } from "@supabase/supabase-js";
import { lookupProperty, addressHash, type PropertyCache, type PropertyLookupResult } from "@/services/propertyDataProvider";
import { calculateArv } from "@/services/arv";

export const runtime = "edge";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
}

// property_data_cache backed by the service role (RLS-exempt, shared across orgs).
function dbCache(sb: ReturnType<typeof service>): PropertyCache {
  return {
    async get(hash) {
      const { data } = await sb.from("property_data_cache")
        .select("normalized, provider").eq("address_hash", hash)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      return data ? (data.normalized as PropertyLookupResult) : null;
    },
    async set(hash, value) {
      await sb.from("property_data_cache").upsert({
        address_hash: hash, provider: value.provider, normalized: value,
      });
    },
  };
}

export async function POST(req: Request) {
  const sb = service();
  const { orgId, createdBy, ownerName, ownerPhone, address, askingPrice, condition } = await req.json();

  // B + C: enrich + ARV (server-side; vendor abstracted, key from ENV)
  let market_value: number | undefined, arv: number | null = null, arv_confidence = 0;
  if (address) {
    const result = await lookupProperty(address, dbCache(sb));
    market_value = result.property?.marketValue;
    const out = calculateArv({
      subjectSqft: result.property?.sqft,
      comparables: result.comparables,
      condition,                // "fair" default if undefined
      zipMultiplier: 1.0,       // TODO: zip lookup table
    });
    arv = out.estimatedArv; arv_confidence = out.confidence;
  }

  // D: insert (trigger stamps EST submission_date + 'created' event)
  const { data, error } = await sb.from("leads").insert({
    organization_id: orgId, created_by: createdBy, assigned_to: createdBy,
    owner_name: ownerName, owner_phone: ownerPhone, property_address: address,
    asking_price: askingPrice ?? null, market_value, arv, arv_confidence,
    status: "processing", stage: "new",
  }).select("id").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // E: hand off to the existing Gemini QA route (fire-and-forget or await)
  return Response.json({ ok: true, leadId: data.id });
}
```

### Re-run / versioning
`POST /api/leads/[id]/rerun` sets `status='processing'`, inserts a
`lead_events` row of type `call_reprocessed` (payload = `{ callId, version }`),
then re-invokes the QA route. The timeline preserves every pass.

---

## 3. Call upload + the play-vs-download rule

Bucket `call-recordings` is **private**. Clients never get a public URL. A server
route mints a **signed URL** and enforces the permission there — this is the only
correct place to separate *play* from *download* (RLS can't, since both need the
object).

```ts
// app/api/calls/[id]/url/route.ts
import { createClient } from "@supabase/supabase-js";
import { can, type Role } from "@/lib/rbac";

export const runtime = "edge";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mode = new URL(req.url).searchParams.get("mode") === "download" ? "download" : "play";

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });

  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role, organization_id").eq("id", user.id).single();
  const role = me?.role as Role | undefined;

  // Tenant + visibility check
  const { data: call } = await sb.from("calls").select("storage_path, organization_id").eq("id", id).single();
  if (!call || call.organization_id !== me?.organization_id) return Response.json({ error: "Not found" }, { status: 404 });
  if (!can(role, "calls.play")) return Response.json({ error: "Forbidden" }, { status: 403 });

  // The download permission is the gate. Team Leaders/Callers => play only.
  if (mode === "download" && !can(role, "calls.download"))
    return Response.json({ error: "Download not permitted for your role" }, { status: 403 });

  const { data: signed } = await sb.storage.from("call-recordings").createSignedUrl(
    call.storage_path,
    mode === "download" ? 300 : 120,                                  // short-lived
    mode === "download" ? { download: true } : undefined,             // attachment disposition
  );
  return Response.json({ url: signed?.signedUrl });
}
```

The UI calls `?mode=play` for the `<audio>` element and only renders a Download
button inside `<Can perm="calls.download">`. Even if someone forges `mode=download`,
the route rejects it. Defense in depth.

---

## 4. Component structure (React / App Router)

```
app/
  (auth)/login                       ← public
  dashboard/
    layout.tsx                       ← sidebar + RoleContext provider (role, org, can())
    page.tsx                         ← <AnalyticsDashboard/>
    pipeline/page.tsx                ← <KanbanBoard/>
    leads/[id]/page.tsx              ← <LeadDetail/> (tabs: Overview · Timeline · Calls · QA)
  admin/
    permissions/page.tsx             ← <PermissionMatrix/> (from rbac.PERMISSION_TABLE)
  _components/
    Can.tsx                          ✅ shipped
    RoleProvider.tsx                 ← useRole() → { role, orgId, can }
    analytics/
      AnalyticsDashboard.tsx         ← date-range (default EST today) + KpiCards + charts
      KpiCard.tsx
    pipeline/
      KanbanBoard.tsx                ← dnd-kit; columns = lead_stage; optimistic stage update
      KanbanColumn.tsx
      LeadCard.tsx                   ← owner, address, ARV, status pill
    leads/
      LeadForm.tsx                   ← submission_date READ-ONLY unless can("lead.date.override")
      LeadTimeline.tsx               ← reads lead_events desc
    calls/
      CallPlayer.tsx                 ← audio + Download gated by <Can perm="calls.download">
      CallUploader.tsx               ← Supabase Storage; path = `${orgId}/${leadId}/...`
  services/                          ✅ propertyDataProvider.ts, arv.ts
  lib/rbac.ts                        ✅ shipped
```

### Key component contracts
- **`<KanbanBoard leads stage onStageChange/>`** — drag a card → optimistic move →
  `PATCH /leads/:id { stage }`; DB trigger logs `stage_changed`. Roll back on error.
- **`<LeadForm mode="create|edit" role/>`** — `submission_date` rendered as a
  disabled input unless `can(role,"lead.date.override")`; on submit posts to the
  pipeline route. EST date is otherwise stamped by the DB trigger.
- **`<CallPlayer callId role/>`** — fetches `?mode=play` signed URL on mount;
  Download button only inside `<Can perm="calls.download">`.
- **`<AnalyticsDashboard/>`** — KPIs (total / hot / warm / cold / disqualified /
  duplicate / callback), date range defaulting to **EST today** via
  `Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'})`.

---

## 5. Analytics — date + timezone rule

- Filter leads by `submission_date` (a `date`, already EST via the insert trigger).
- Default range = **EST today** computed on the client:
  ```ts
  const estToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); // YYYY-MM-DD
  ```
- The field is read-only in the UI; the DB trigger blocks edits unless the user
  has `lead.date.override` (QA/Admin/Owner) — enforced server-side regardless of UI.

---

## 6. Bonus integrations (architecture only)

| Capability | Design |
|---|---|
| **Webhooks (Zapier/Make)** | `outbound_webhooks(org_id, url, secret, events[])`. A Postgres trigger on `leads` enqueues to a `webhook_deliveries` table; a scheduled worker (Cloudflare Cron) POSTs with an HMAC-SHA256 `X-Signature`. Retries with backoff; dead-letter after N. |
| **WhatsApp / SMS** | `services/messagingProvider.ts` abstraction (same pattern as property): `MockMessaging`, `TwilioMessaging` (ENV keys). Outbound from lead actions; inbound via a webhook route that appends a `lead_events` note. |
| **AI call summarization** | On call upload → `calls.transcription` filled by an ASR provider behind `services/transcriptionProvider.ts` → Gemini summarizes → writes `ai_feedback`, `ai_coaching_points`, and a `call_uploaded` event. Already half-built in `/api/analyze`. |
| **Leaderboard / gamification** | Materialized view `caller_stats` (org_id, user_id, hot_count, conversion_rate, calls) refreshed on a cron; `<Leaderboard/>` ranks within org/team. Points = weighted Hot/Warm + QA score. |

All four follow the **same abstraction rule**: no vendor imported outside a
`services/*Provider.ts` file; keys come from ENV placeholders only.

---

## 7. Staged rollout (so the live app never breaks)

1. **Apply migrations in this exact order** in the Supabase SQL editor (off-peak):
   `0001_schema` → `0004_bridge_backfill` → `0002_rls` → `0003_triggers_and_deletion`.
   `0004` is the bridge: it adapts the existing per-user `profiles`/`leads` tables
   (additive columns), creates one `organizations` row per owner, links sub-users,
   and backfills `organization_id` everywhere. The live app keeps working because
   `leads.status` and `profiles.role` stay text; `current_app_role()` tolerates the
   legacy values. Run the POST-CHECK queries at the bottom of `0004` (expect 0 nulls)
   before applying `0002`.
2. **Create the private `call-recordings` bucket** + the storage upload policy
   (commented in `0002_rls.sql`).
3. **Drop in route handlers** (`/api/leads/submit`, `/api/calls/[id]/url`,
   `/api/admin/delete-user`) — additive, no UI change yet.
4. **Build the new UI** behind a feature flag / new routes (`/dashboard/pipeline`).
5. **Auth cutover** (last): switch client components to `lib/supabase/browser.ts`,
   rename `middleware.ts.example → middleware.ts`, retest login, deploy.

Each step is independently shippable and reversible.
