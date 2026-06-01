# HMS Realty — Enterprise Rebuild

## What changed in this pass

### 1. Brand refresh: HSM Realty → HMS Realty
- **Logo**: Modern geometric house roof (double-pitched lines) with "HMS Realty" wordmark beneath
- **Palette**: Deep Navy `#0A1E3F` · Crisp Teal `#0DAFAF` · Refined Gold `#C8A24B` · Slate `#475569`
- All red references in `globals.css` and dashboard layout replaced with navy-based palette
- Back-compat: `--red` tokens still resolve (to navy) so legacy pages don't break

### 2. Premium motion / physics
- **Spring easings** added to `globals.css`:
  - `--spring-soft` (modal pop), `--spring-snap` (clicks), `--spring-heavy` (page transitions)
- **Global transition layer** on all interactive elements with weight-based curves
- New animations: `float`, `glow`, refined `pulse`
- 60fps scrolling (smooth-scroll + GPU class)

### 3. Landing page (`/landing`)
- Sticky blur nav, gradient hero with floating orbs
- Hero copy: "The outbound platform that scales your revenue."
- **Zero AI/Gemini/model references** — copy focuses on automation, intelligence, scaling revenue
- 9-feature grid (Global Lead Intake, BANT Extraction, Trainer Portal, etc.)
- 3-step "How it works"
- **Two-tier pricing** (Professional $250 · Enterprise $700 with gold premium badge)
- Final CTA on dark navy
- No "fraction of the cost" copy. No admin command portal mentioned.

### 4. Public submission form (`/submit-lead`)
- HMS branded header
- **Dynamic dropdowns**:
  - Cold Caller (loaded from `cold_callers` table)
  - Campaign (loaded from `campaigns` table)
  - Date picker (defaults to today)
- Conditional call upload section (only shown when admin enables it)
- Auto-routes to admin user, kicks off background processing instantly

### 5. NEW: Roleplay Dialer (`/dashboard/dialer`)
- **WebRTC-based** internal communication (uses `RTCPeerConnection`, `getUserMedia`)
- Team roster with availability indicators (available/busy/offline)
- Trainer vs agent badges
- Call states: idle → calling → ringing → connected → ended
- In-call controls: Mute, Speaker, Record, Hangup
- Live call timer
- No external telecom — browser-to-browser only

### 6. NEW: Smart Follow-Ups (`/dashboard/followups`)
- Filterable view: All / Urgent / Today / This Week
- Priority colors (urgent red, high gold, normal teal)
- Displays BANT timeline alongside follow-up date
- "Schedule Call" + "Mark Done" actions
- Populated automatically when system parses phrases like "call me back in 2 months"

### 7. Database additions (`DATABASE_SETUP.md`)
- **Leads table BANT columns**: `bant_budget`, `bant_authority`, `bant_need`, `bant_timeline`
- **Follow-up flagging**: `followup_flag`, `followup_date`, `followup_priority`, `followup_notes`
- **Conversation analytics**: `talk_listen_ratio`, `monologue_seconds`, `micro_agreements_count`
- **New `roleplay_sessions` table** for trainer scoring with `timestamps jsonb` for time-stamped feedback
- **New `training_materials` table** for Material Hub uploads

## Files touched

| File | Change |
|---|---|
| `app/globals.css` | New navy/teal/gold design system, spring physics |
| `app/landing/page.tsx` | Complete rewrite — HMS brand, two-tier pricing, no AI copy |
| `app/dashboard/layout.tsx` | HMS logo, navy palette, Roleplay Dialer + Follow-Ups nav items |
| `app/submit-lead/page.tsx` | Dynamic caller/campaign dropdowns, conditional upload |
| `app/dashboard/dialer/page.tsx` | NEW — WebRTC roleplay dialer |
| `app/dashboard/followups/page.tsx` | NEW — Smart follow-up tracker |
| `DATABASE_SETUP.md` | BANT, follow-up, analytics, roleplay_sessions, training_materials |

## Run the SQL migrations

Open Supabase → SQL Editor → paste from `DATABASE_SETUP.md` sections 5, 5b, 5c, 6, 7, 8, 9.

## Pricing structure (final)

| Plan | Price | Campaigns | Trainer Portal | WebRTC Dialer |
|---|---|---|---|---|
| **Professional** | $250/mo | 7 | – | – |
| **Enterprise** | $700/mo | Unlimited | ✓ Advanced | ✓ |

No admin command portal. No third tier.

## Outstanding (backend wiring needed)

- WebRTC signaling server (currently the dialer simulates connection; production needs Supabase Realtime channels for SDP/ICE exchange)
- BANT auto-extraction from call transcripts (column scaffold ready; needs analyzer pipeline)
- Follow-up auto-flagging (column scaffold ready; needs intent-parsing in lead processing)
- Material Hub file uploads (table ready; needs Supabase Storage bucket `training-materials`)

## Test the pass

1. Go to `/landing` — new HMS brand, two-tier pricing
2. Go to `/submit-lead` — dropdowns populate from your callers/campaigns
3. Go to `/dashboard/dialer` — roster + call interface (will request mic permission)
4. Go to `/dashboard/followups` — empty state until leads get flagged
