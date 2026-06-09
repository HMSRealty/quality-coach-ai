// app/api/analyze/route.ts
// Edge-runtime. Web APIs only — no Node fs/path/Buffer.
// Ported QA engine: two-pass Gemini (qualification + coaching) + deterministic
// decision tree mapping AI flags → status / reason, exactly like the sheet engine.

import { createClient } from "@supabase/supabase-js";
import { getDriveAccessToken } from "@/lib/googleDrive";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const MIN_DURATION_SEC = 30;
const MIN_FILE_SIZE_BYTES = 20 * 1024;

// ── service clients ──
function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}
function geminiKey(): string {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!k) throw new Error("Missing GEMINI_API_KEY env var");
  return k;
}

// POST to a Gemini endpoint with automatic retry on transient errors
// (429 rate-limit, 500/502/503/504 overload). This eliminates most sporadic
// "Error" statuses, which are almost always transient model overloads.
async function geminiPost(url: string, body: unknown, tries = 2): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    let res: Response;
    try {
      res = await tfetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      // network blip — wait and retry
      if (i < tries - 1) { await new Promise((r) => setTimeout(r, 1000 * (i + 1))); continue; }
      throw new Error("Gemini request failed (network)");
    }
    if (res.ok) return res;
    last = res;
    if (![429, 500, 502, 503, 504].includes(res.status)) return res; // non-retryable
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return last as Response;
}

// Resolve & download an audio URL. Handles public Google Drive share links
// (file/d/<id> or ?id=<id>) by hitting the direct-download endpoint and clearing
// the large-file virus-scan interstitial via the confirm token.
function driveFileId(u: string): string | null {
  const m = u.match(/drive\.google\.com\/file\/d\/([^/?#]+)/) || u.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}
// Every download is bounded so a slow/dead link can never hang the analyzer
// (which would stall the import queue). 90s is plenty for a call recording.
const DOWNLOAD_TIMEOUT_MS = 90_000;
async function tfetch(input: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try { return await fetch(input, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
async function fetchAudioUrl(url: string, driveToken?: string | null): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const id = driveFileId(url);
  // PRIVATE Drive: if we have the owner's OAuth token, pull via the Drive API.
  if (id && driveToken) {
    try {
      const r = await tfetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${driveToken}` } });
      if (r.ok) {
        const bytes = await r.arrayBuffer();
        const ct = r.headers.get("content-type") || "";
        return { bytes, mime: ct.includes("audio") || ct.includes("video") || ct.includes("mp4") ? ct : "audio/mpeg" };
      }
    } catch { /* fall through to public attempt */ }
  }
  // PUBLIC Drive ("anyone with the link"): use the usercontent download host,
  // clearing the large-file confirm gate. If the response is still HTML, the
  // file is NOT public — return null (don't push a login page as "audio").
  if (id) {
    try {
      let resp = await tfetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
      let ct = resp.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const html = await resp.text();
        const tok = html.match(/name="confirm"\s+value="([^"]+)"/) || html.match(/confirm=([0-9A-Za-z_-]+)/);
        const uuid = html.match(/name="uuid"\s+value="([^"]+)"/);
        if (tok) {
          resp = await tfetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=${tok[1]}${uuid ? `&uuid=${uuid[1]}` : ""}`);
          ct = resp.headers.get("content-type") || "";
        }
      }
      if (!resp.ok || ct.includes("text/html")) return null;
      const bytes = await resp.arrayBuffer();
      return { bytes, mime: ct.includes("audio") || ct.includes("video") || ct.includes("mp4") ? ct : "audio/mpeg" };
    } catch { return null; }
  }

  try {
    const resp = await tfetch(url);
    const ct = resp.headers.get("content-type") || "";
    if (!resp.ok) return null;
    const bytes = await resp.arrayBuffer();
    const mime = ct.includes("audio") || ct.includes("video") || ct.includes("mp4") ? ct : "audio/mpeg";
    return { bytes, mime };
  } catch { return null; }
}

// ── helpers (ported) ──
function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  try { return String(v).trim(); } catch { return ""; }
}
function extractFirstPrice(val: unknown): number {
  if (typeof val === "number" && isFinite(val) && val > 0) return val;
  const str = safeStr(val).toLowerCase();
  if (!str) return NaN;
  const blocked = ["n/a", "na", "none", "null", "unknown", "tbd", "ask", "asking", "?", "-"];
  if (blocked.includes(str)) return NaN;
  const match = str.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/i);
  if (!match) return NaN;
  let num = parseFloat(match[1].replace(/,/g, ""));
  if (!isFinite(num) || num <= 0) return NaN;
  const suffix = match[2];
  if (suffix === "k") num *= 1000;
  else if (suffix === "m") num *= 1_000_000;
  if (num < 1000) return NaN;
  return num;
}
function reasonMatches(reason: string, phrases: string[], anti: string[] = []): boolean {
  if (!reason) return false;
  const lower = safeStr(reason).toLowerCase();
  for (const a of anti) if (lower.includes(a.toLowerCase())) return false;
  for (const p of phrases) if (lower.includes(p.toLowerCase())) return true;
  return false;
}

interface QualJSON {
  qualification_reason?: string;
  compliance_check?: string;
  owner_tone_of_voice?: string;
  exact_reason_quote?: string;
  raw_extracted_address?: string;
  raw_lead_template?: string;
  is_decision_maker?: boolean;
  is_vacant_lot?: boolean;
  is_commercial?: boolean;
  is_spanish_speaker?: boolean;
  other_properties_volunteered?: string;
  condition_established?: boolean;
  lot_details_established?: boolean;
  compliance_passed?: boolean;
  requested_dnc?: boolean;
  lead_category?: string;
  category_reasoning?: string;
  has_reason_for_selling?: boolean;
  closing_within_3_months?: boolean;
  // Handoff intel
  seller_personality?: string;
  seller_pain_point?: string;
  seller_bottom_line?: string;
  // Objection
  primary_objection?: string;
  objection_quote?: string;
  // Rehab
  repairs_mentioned?: string[];
  rehab_cost_estimate?: number;
  // ARV — Gemini computes this from the Zillow comparables (not a "Zillow ARV").
  estimated_arv?: number;        // point estimate (midpoint)
  estimated_arv_low?: number;    // conservative end of the range
  estimated_arv_high?: number;   // optimistic end of the range
  arv_reasoning?: string;        // short one-liner
  arv_narrative?: string;        // multi-sentence valuation rationale (the "report")
  arv_comps?: Array<{ address?: string; layout?: string; sqft?: number; status?: string; value?: number }>;
  estimated_monthly_rent?: number; // market rent for the renovated subject (drives BRRRR/Hold)
  transcript?: string;
  regeneration_steps?: string;
  call_summary?: string;
  is_qualified?: boolean;
  is_listed_on_mls?: boolean;
  is_under_contract?: boolean;
  timeline_over_6_months?: boolean;
  is_aggressive_refusal?: boolean;
  rejected_selling_multiple_times?: boolean;
  is_underwater?: boolean;
  spoken_asking_price?: string;
  spoken_market_value?: string;
  extracted_items?: Array<Record<string, unknown>>;
  // Truth verification (anti-fraud): does the agent's manual entry match the call?
  has_data_discrepancy?: boolean;
  discrepancy_notes?: string;
  seller_name_on_call?: string;   // the true owner/seller name as heard on the call
}

// ── Gemini Files API upload (resumable, edge fetch) ──
async function uploadToGemini(bytes: ArrayBuffer, mime: string, key: string): Promise<{ uri: string; mime: string }> {
  const size = bytes.byteLength;
  const init = await tfetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "call.mp3" } }),
  });
  if (!init.ok) throw new Error(`Gemini upload init failed: ${init.status}`);
  const uploadUrl = init.headers.get("X-Goog-Upload-URL") || init.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload URL missing");
  const fin = await tfetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    body: bytes,
  });
  if (!fin.ok) throw new Error(`Gemini upload finalize failed: ${fin.status}`);
  const parsed = await fin.json();
  if (!parsed?.file?.uri) throw new Error("Gemini upload response missing file URI");
  return { uri: parsed.file.uri, mime };
}

const QUAL_SYSTEM = `
ROLE: You are an elite Real Estate Acquisitions Quality-Control Manager and Advanced AI Auditor.
Use deep logical reasoning and analyze context fully.

CALL-ONLY MODE: You receive ONLY the audio recording. No form data, no pre-filled values.
EVERYTHING you output MUST be extracted from what is actually spoken on the call. Do not invent values.
If a data point is not spoken, return "None" / false / "Not specified".

SMART CONTEXTUAL DEDUCTION: Act as an emotionally intelligent closer. Read between the lines.
- Implicit Authority: if the seller speaks in first person ("I want to sell", "my house") and never mentions
  needing to ask a spouse/partner, mark decision authority detected.
- Attitude as evidence: "we can figure out a date later", "I'm just tired of this house" → motivation/flexibility.
- For each extracted item, include exact start_time and end_time (MM:SS). If not detected, "N/A".

DEAL BREAKER FLAGGING: For each item in extracted_items, set is_deal_breaker=true ONLY if that exchange directly
caused the lead to fail (listed on MLS, under contract, timeline > 6 months, wrong person, underwater/no equity,
hostile refusal, commercial, DNC, rejected selling 2+ times, sarcastic bluffer, asking >= market value, 100% Spanish).

MASTER KILL LIST (scan all first):
KILL #1 is_commercial=true: commercial/retail/industrial (vacant lots, land, Airbnb, multifamily, apartments are RESIDENTIAL, do not flag).
KILL #2 is_listed_on_mls=true: realtor involvement / listed on MLS / actively listed.
KILL #3 is_under_contract=true: under contract / backup offers / in escrow.
KILL #4 timeline_over_6_months=true: timeline > 6 months / vague far-future.
KILL #5 retail testing market → lead_category="retail_testing_market".
KILL #8 conditional blockers (waiting on divorce/another house) → has_reason_for_selling=false if no concrete plan.
KILL #9 lead_category="sarcastic_bluffer": bluffer / not serious / mocking.
KILL #10 is_decision_maker=false: wrong person / no authority / tenant.
KILL #11 is_aggressive_refusal=true: hostile AND refused all info (hostility, not just price refusal).
KILL #12 requested_dnc=true: DNC / workplace monitoring.
KILL #13 is_spanish_speaker=true: entire call 100% Spanish.
KILL #14: NO asking price spoken AND no actionable reason for selling.

TYPED FLAGS:
- is_underwater=true ONLY if seller explicitly owes more than home is worth / no equity (NOT flooding references).
- rejected_selling_multiple_times=true ONLY if seller rejected selling at least twice in the call.

OTHER PROPERTY EXCEPTION: if owner volunteers DIFFERENT off-market properties, put addresses in
other_properties_volunteered (else "None"). Overrides KILLS #2-#14 except #1, #9, #10, #12, #13.

ACQUISITION CRITERIA: strong motivation (death, probate, health, relocation, landlord fatigue, divorce, financial
distress) → has_reason_for_selling=true. Firm asking well below stated market value → strong buy. Near-market but
high motivation → warm. No price but real transaction path → still publishable. Heavy repairs justify lower offers.

ADDRESS: extract property address as spoken → raw_extracted_address (else "Not stated on call").
TONE: 1-sentence tone analysis → owner_tone_of_voice.
PROPERTY TYPE: is_vacant_lot. For houses set condition_established when repairs/roof/HVAC/condition discussed.
For lots set lot_details_established when size/buildability/zoning discussed.
SPOKEN ASKING PRICE: seller's spoken asking price as STRING ("250000"/"250k") else exactly "None". Don't guess.
SPOKEN MARKET VALUE: market value spoken by seller/agent as STRING else exactly "None". Don't guess.
EXACT REASON QUOTE: verbatim quote on why selling/rejecting (else "None").
CLOSING TIMELINE: closing_within_3_months=true only if ASAP/immediately/within 3 months.
SELLER PSYCHOLOGY lead_category: "investor_cold" | "retail_testing_market" | "sarcastic_bluffer" | "motivated_distressed".
COMPLIANCE: compliance_passed=true ONLY if company name, date, AND recording statement are spoken somewhere.

RAW LEAD TEMPLATE (raw_lead_template), pull every field from the call, 'Not specified' if missing, EXACT format:
Address: [..]

Lead Template:
VA Name: [..]
Owner Name: [..]
Address: [..]
Callback number: [..]
Best callback time: [..]
Listing (Is it listed or not?): [..]
General Property Condition: [..]
Major, Average or No repairs needed: [..]
Occupancy: [..]
Is it a rental property: [..]
Bedroom and Bathroom: [..]
Sqft: [..]
Roof (How old is it?): [..]
Hvac (How old is it?): [..]
Updates Did they do any renovations: [..]
Reason for selling: [..]
How soon they can sell (closing): [..]
Asking Price: [..]
Market Value mentioned: [..]

TRANSCRIPT: Produce a clean, diarized transcript of the ENTIRE call (all recordings) in the
'transcript' field. Format each line as "Agent:" or "Seller:" prefixed, with a [MM:SS] timestamp.
This transcript is stored and reused for cheaper re-grading, so make it complete and accurate.

CALL SUMMARY: Write a clear 3-5 sentence plain-English narrative of what happened on the call —
who spoke, what the seller said about the property and their situation, key objections or signals,
and how it ended. Assign to the call_summary field. No jargon.

ACQUISITION HANDOFF INTEL (write as if briefing a closer in 30 seconds):
- seller_personality: one short label (e.g., "Direct", "Chatty", "Hesitant", "Defensive", "Skeptical", "Friendly", "Distrustful", "Tired") + 4-8 word qualifier.
- seller_pain_point: the ONE concrete pain or motivation that's actually driving them to sell (e.g., "Behind on mortgage 3 months", "Inherited and lives out of state").
- seller_bottom_line: the perceived lowest dollar amount they'd accept based on hesitation/anchoring on the call. Format "$NNN,NNN" or "unknown".

OBJECTION ANALYSIS:
- primary_objection: choose EXACTLY ONE bucket the seller used most. Allowed buckets:
  "Price too low", "Timing - not yet", "Not selling", "Trust / scam concern", "Just curious",
  "Already listed", "Spouse must decide", "Interest rates / market", "Hung up", "Wrong number",
  "Repairs concern", "Tenant issue", "Tax / liens", "Language barrier", "None" (if no objection — they're motivated).
- objection_quote: short verbatim quote tied to the chosen bucket (else "None").

REPAIR / REHAB ESTIMATE (wholesaler MAO inputs — listen for explicit damage talk):
- repairs_mentioned: array of strings (e.g., "Roof leaks", "HVAC dead 2 years", "Foundation cracks", "Old kitchen", "Vacant 6 months").
- rehab_cost_estimate: integer USD. Conservative US ballpark per item:
    roof leak / replace: 12000; full roof: 18000; HVAC: 8000; water heater: 2000; electrical panel: 3500;
    plumbing repipe: 9000; kitchen full: 25000; bath full: 12000; flooring whole house: 12000;
    foundation crack: 10000; foundation major: 30000; full cosmetic refresh: 18000; mold/abatement: 8000;
    windows full: 12000; siding: 14000; "needs everything": 65000. If nothing said, 0.

ARV — AFTER-REPAIR VALUE REPORT (act as a local appraiser; YOU produce this — there is NO pre-computed "Zillow ARV"):
Use the MARKET DATA comps + the SUBJECT facts (sqft, beds, baths) + neighborhood knowledge. Reason about a price-per-sqft BAND for fully-renovated, retail-ready homes of this footprint in the immediate area, then apply it to the subject's square footage.
Output ALL of:
- estimated_arv_low / estimated_arv_high: integer USD — the conservative and optimistic ends of the ARV range.
- estimated_arv: integer USD — the midpoint point-estimate (≈ (low+high)/2). If subject sqft is unknown, use the median comp value. If there are zero comps AND no Zestimate, set all three to 0.
- arv_reasoning: ONE short sentence with the core math (e.g., "$88/sqft × 1,302 sqft ≈ $114,500").
- arv_narrative: 2-3 short sentences explaining the valuation — the $/sqft band for renovated comparable-footprint homes nearby, and how it maps onto the subject's sqft to land the range. Write it like a clear appraiser note.
- arv_comps: list ONLY the comparable properties that ACTUALLY appear in the MARKET DATA above — copy their real addresses, sqft and value verbatim. Each: { address, layout (e.g. "3 Bed, 1 Bath"), sqft (integer), status ("Sold" | "Active" | "Estimate"), value (integer USD) }. If MARKET DATA lists NO comparable sales, return an EMPTY arv_comps array — you still produce the ARV from the Zestimate / price-per-sqft band. NEVER invent, guess, or use placeholder addresses (absolutely no "123 Anywhere St", "456 Somewhere Ave", "Main St, Anytown", fictional streets, or fabricated house numbers). Real addresses from the data only.
- estimated_monthly_rent: integer USD — the realistic MARKET RENT for the renovated subject (used to test BRRRR & buy-and-hold cash flow). Base it on the area + footprint; if you truly cannot estimate, set 0.
`.trim();

// Build the runtime system prompt: base persona (or org override) + org killers
// (or defaults) + LIVE market context (Zillow Zestimate) + campaign rules.
function buildSystemPrompt(opts: {
  orgPersona?: string | null;
  orgKillers?: Array<{ id: string; label: string; rule: string; enabled?: boolean }> | null;
  marketValue?: number | null;
  propertyAddress?: string | null;
  customRules?: string;
  submitted?: { address?: string | null; askingPrice?: string | null; sellerName?: string | null; notes?: string | null };
  marketData?: { zestimate?: number | null; sqft?: number | null; beds?: number | null; baths?: number | null; comparables?: Array<Record<string, unknown>> | null };
}): string {
  const persona = (opts.orgPersona && opts.orgPersona.trim().length > 30) ? opts.orgPersona.trim() : QUAL_SYSTEM;
  const killers = (opts.orgKillers && opts.orgKillers.length)
    ? opts.orgKillers.filter((k) => k.enabled !== false).map((k) => `${k.id}: ${k.label} — ${k.rule}`).join("\n")
    : "(using defaults baked into persona)";
  const marketCtx = opts.marketValue
    ? `\n\nLIVE API CONTEXT (single source of truth for Market Value):
ZILLOW MARKET VALUE (Zestimate) = $${Math.round(opts.marketValue).toLocaleString()}
Property address (resolved from public records): ${opts.propertyAddress || "unknown"}

PRICING MATRIX — apply MATHEMATICALLY against the LIVE Zestimate above (not any spoken market value):
Let A = spoken asking price, Z = Zestimate above.

• 🔥 HOT  → A ≤ 0.70 × Z   AND a valid, concrete reason for selling is given
                          (motivation: divorce, probate, relocation, foreclosure, health, landlord fatigue, financial distress, inherited, vacant, tired of repairs, etc.)
• 🟡 WARM → 0.70 × Z < A < Z   (strictly above 70% of Zestimate, below Zestimate) AND a valid reason for selling is given
• 🔵 COLD → A ≥ Z and A ≤ 1.25 × Z   AND the reason is "away from money" or no motivation
                          ("you called me", "cash offer", "I need the money", "to get profit", "investments",
                           "none of your business", "just curious", "testing the market", etc.)
• 🔴 DISQUALIFIED → A > 1.25 × Z, OR any item on the Kill List, OR no price + no motivation.

Reason-validity check: a HOT or WARM verdict REQUIRES a concrete distress / life-event reason. Money-only or
evasive answers do NOT count as a valid reason — they push the lead to COLD or DISQUALIFIED.`
    : `\n\nLIVE API CONTEXT: Zestimate unavailable for this lead. Use the SPOKEN market value if present; otherwise rely on motivation + Kill List only.`;
  const killBlock = `\n\nACTIVE KILL LIST (auto-DISQUALIFY if ANY are true):\n${killers}\n\nSAVIOR EXCEPTION: If the PRIMARY address hits a Kill rule but the seller volunteers a DIFFERENT off-market property, extract that new address into other_properties_volunteered and qualify the lead based on the volunteered property.`;
  const overrides = opts.customRules ? `\n\nCAMPAIGN CUSTOM OVERRIDE RULES:\n${opts.customRules}` : "";

  // TRUTH VERIFICATION (anti-fraud): cross-check the agent's manual entry vs the call.
  const s = opts.submitted;
  const hasSubmitted = s && (s.address || s.askingPrice || s.sellerName || s.notes);
  const verifyBlock = hasSubmitted ? `\n\nTRUTH VERIFICATION (ANTI-FRAUD — CRITICAL):
The agent MANUALLY ENTERED the following lead data at submission. Cross-reference EACH field against what was ACTUALLY said in the audio/transcript:
  • Submitted address:        ${s!.address || "(blank)"}
  • Submitted asking price:   ${s!.askingPrice || "(blank)"}
  • Submitted seller name:    ${s!.sellerName || "(blank)"}
  • Submitted notes/motivation: ${s!.notes || "(blank)"}
RULE: If the agent submitted information (asking price, timeframe/closing window, property condition, seller name, motivation) that CONTRADICTS the audio, or that was COMPLETELY FABRICATED (not supported anywhere in the call), you MUST flag it:
  → set has_data_discrepancy = true
  → set discrepancy_notes to a specific sentence citing the conflict, e.g. "Agent entered asking price $100k, but seller explicitly stated $150k firm." or "Agent entered seller name 'John', but the recording names the owner as 'Maria'."
If every non-blank submitted field is consistent with the call (blank fields are NOT discrepancies), set has_data_discrepancy = false and discrepancy_notes = "". Never invent a discrepancy when the data agrees.

AUTO-CORRECTION — always report the TRUE values FROM THE CALL (these override the agent's entry downstream):
  → raw_extracted_address = the exact property address actually stated on the call (else "Not stated on call").
  → spoken_asking_price   = the asking price the seller actually stated on the call (else "None").
  → seller_name_on_call   = the owner/seller name actually heard on the call (else "").
Be precise — if the agent's address is wrong, the system will re-pull property data for the address you put in raw_extracted_address.` : "";

  // MARKET DATA (raw Zillow facts + comparables) — the AI uses this to COMPUTE
  // the ARV itself. Zillow only supplies data; Gemini does the math.
  const marketDataBlock = opts.marketData ? `\n\n${marketDataText(opts.marketData)}` : "";

  return `${persona}${marketCtx}${killBlock}${overrides}${verifyBlock}${marketDataBlock}`;
}

type MarketData = { zestimate?: number | null; sqft?: number | null; beds?: number | null; baths?: number | null; comparables?: Array<Record<string, unknown>> | null };

// Format the raw property facts + comparables for the prompt.
function marketDataText(m: MarketData): string {
  const comps = (m.comparables || []).slice(0, 12);
  if (!m.zestimate && comps.length === 0) return "MARKET DATA: none available for this address.";
  return `MARKET DATA (raw — compute ARV from this; do NOT expect a ready-made ARV):
SUBJECT: ${m.sqft ? `${m.sqft} sqft` : "sqft unknown"}${m.beds ? `, ${m.beds} bd` : ""}${m.baths ? `, ${m.baths} ba` : ""}
ZESTIMATE (reference only): ${m.zestimate ? `$${Math.round(m.zestimate).toLocaleString()}` : "unavailable"}
COMPARABLE SALES (${comps.length}):
${comps.length ? comps.map((c, i) => {
    const price = (c.price ?? c.soldPrice ?? c.lastSoldPrice ?? c.zestimate) as number | undefined;
    const sqft = (c.sqft ?? c.livingArea ?? c.area) as number | undefined;
    const bd = (c.beds ?? c.bedrooms) as number | undefined;
    const ba = (c.baths ?? c.bathrooms) as number | undefined;
    const addr = (c.address ?? c.streetAddress ?? `Comp ${i + 1}`) as string;
    const ppsf = price && sqft ? ` ($${Math.round(price / sqft)}/sqft)` : "";
    return `  ${i + 1}. ${addr} — ${price ? `$${Math.round(price).toLocaleString()}` : "n/a"}${sqft ? `, ${sqft} sqft` : ""}${bd ? `, ${bd}bd` : ""}${ba ? `/${ba}ba` : ""}${ppsf}`;
  }).join("\n") : "  (none returned by the data provider)"}`;
}

// Live comparable-sales search via Gemini + Google Search GROUNDING. Plain
// Gemini can't look anything up — with the google_search tool it actually
// retrieves real recent sales/listings, so addresses are REAL, not invented.
// Returns provider-shaped comps ({ price, sqft, address, beds, baths, status }).
async function runCompsSearch(
  address: string | null,
  facts: { sqft?: number | null; beds?: number | null; baths?: number | null },
  key: string,
): Promise<Array<Record<string, unknown>>> {
  if (!address) return [];
  const prompt = `Use Google Search to find 5-8 REAL recently-SOLD or currently-ACTIVE comparable homes near "${address}"${facts.sqft ? `, around ${facts.sqft} sqft` : ""}${facts.beds ? `, ${facts.beds} bed` : ""}${facts.baths ? `/${facts.baths} bath` : ""}.
Search real estate sources (Zillow, Redfin, Realtor.com, county records). Use ONLY real properties you actually find, with their REAL street addresses and REAL sale/list prices.
Return ONLY a JSON array (no prose, no markdown). Each item:
{"address": string, "sqft": number, "value": number, "status": "Sold"|"Active", "beds": number, "baths": number}
If you cannot find real comparable sales, return []. NEVER invent, guess, or use placeholder addresses ("123 Anywhere St", "Somewhere Ave", "Anytown", etc.).`;
  try {
    const res = await geminiPost(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],          // GROUNDING — lets Gemini actually search
      generationConfig: { temperature: 0.1 },
    });
    if (!res.ok) return [];
    const j = await res.json();
    const text: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    const m = text.match(/\[[\s\S]*\]/);          // grounded responses are text — extract the JSON array
    if (!m) return [];
    const arr = JSON.parse(m[0]) as Array<Record<string, unknown>>;
    return (Array.isArray(arr) ? arr : [])
      .map((c) => ({
        address: String(c.address ?? ""), sqft: Number(c.sqft) || undefined,
        price: Number(c.value ?? c.price) || undefined,
        beds: Number(c.beds) || undefined, baths: Number(c.baths) || undefined,
        status: String(c.status ?? "Sold"),
      }))
      .filter((c) => c.address && !FAKE_COMP_ADDR.test(c.address) && (c.price || c.sqft))
      .slice(0, 8);
  } catch { return []; }
}

const FAKE_COMP_ADDR = /anywhere|somewhere|\banother (rd|st|ave|dr)|nearby (ln|st|rd)|anytown|\bexample\b|placeholder|\bsample\b|fictional|^comparable\s*\d|123 main st/i;

// Focused ARV-only recompute — used when the address was corrected, so the ARV
// reflects the RIGHT property's comparables (not the wrong submitted address).
async function runArvReport(m: MarketData, address: string | null, key: string): Promise<Partial<QualJSON>> {
  const comps = (m.comparables || []).slice(0, 12);
  if (!m.zestimate && comps.length === 0) return {};
  const system = `You are a local real-estate appraiser. Using the MARKET DATA below for ${address || "the subject property"}, produce an After-Repair Value (ARV) report for a fully-renovated, retail-ready version of the SUBJECT. Reason about a price-per-sqft band for renovated comparable-footprint homes nearby and apply it to the subject's square footage. Also estimate estimated_monthly_rent (realistic market rent for the renovated subject, integer USD).
arv_comps: list ONLY the comparables that ACTUALLY appear in MARKET DATA (real addresses, verbatim). If there are none, return an EMPTY array — never invent or use placeholder addresses ("123 Anywhere St", "Somewhere Ave", etc.).
${marketDataText(m)}`;
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: "Produce the ARV report JSON." }] }],
    generationConfig: {
      temperature: 0.2, responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          estimated_arv: { type: "NUMBER" }, estimated_arv_low: { type: "NUMBER" }, estimated_arv_high: { type: "NUMBER" },
          arv_reasoning: { type: "STRING" }, arv_narrative: { type: "STRING" },
          arv_comps: { type: "ARRAY", items: { type: "OBJECT", properties: {
            address: { type: "STRING" }, layout: { type: "STRING" }, sqft: { type: "NUMBER" }, status: { type: "STRING" }, value: { type: "NUMBER" },
          } } },
          estimated_monthly_rent: { type: "NUMBER" },
        },
        required: ["estimated_arv", "estimated_arv_low", "estimated_arv_high", "arv_reasoning", "arv_narrative", "arv_comps"],
      },
    },
  };
  try {
    const res = await geminiPost(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, payload);
    if (!res.ok) return {};
    const j = await res.json();
    return JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text || "{}") as Partial<QualJSON>;
  } catch { return {}; }
}

async function runQualification(
  files: Array<{ uri: string; mime: string }>,
  customRules: string,
  key: string,
  ctx?: { orgPersona?: string | null; orgKillers?: Array<{ id: string; label: string; rule: string; enabled?: boolean }> | null; marketValue?: number | null; propertyAddress?: string | null; transcriptText?: string | null; submitted?: { address?: string | null; askingPrice?: string | null; sellerName?: string | null; notes?: string | null }; marketData?: { zestimate?: number | null; sqft?: number | null; beds?: number | null; baths?: number | null; comparables?: Array<Record<string, unknown>> | null } },
): Promise<QualJSON> {
  const systemText = buildSystemPrompt({
    orgPersona: ctx?.orgPersona,
    orgKillers: ctx?.orgKillers,
    marketValue: ctx?.marketValue,
    propertyAddress: ctx?.propertyAddress,
    customRules,
    submitted: ctx?.submitted,
    marketData: ctx?.marketData,
  });
  // Two input modes:
  //   • AUDIO  — attach every recording (full analysis, also produces transcript)
  //   • TEXT   — re-grade a stored transcript with no audio (cheap re-run)
  const userParts: Array<Record<string, unknown>> = [];
  if (files.length === 0 && ctx?.transcriptText) {
    userParts.push({ text: "Re-grade this lead from the diarized call TRANSCRIPT below. Apply the same rules. Echo the transcript back in the `transcript` field unchanged.\n\nTRANSCRIPT:\n" + ctx.transcriptText });
  } else {
    userParts.push({ text: files.length > 1
      ? `Analyze ALL ${files.length} call recordings attached below as one combined session. Extract everything from the audio. Do not invent details not spoken.`
      : "Analyze this call recording only. Extract everything from the audio. Do not invent details not spoken." });
    for (const f of files) userParts.push({ file_data: { mime_type: f.mime, file_uri: f.uri } });
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{
      role: "user",
      parts: userParts,
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          extracted_items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" }, label: { type: "STRING" }, status: { type: "STRING" },
                question_asked: { type: "STRING" }, seller_answer: { type: "STRING" },
                start_time: { type: "STRING" }, end_time: { type: "STRING" },
                is_deal_breaker: { type: "BOOLEAN" },
              },
              required: ["id", "label", "status", "question_asked", "seller_answer", "start_time", "end_time", "is_deal_breaker"],
            },
          },
          raw_lead_template: { type: "STRING" }, raw_extracted_address: { type: "STRING" },
          owner_tone_of_voice: { type: "STRING" }, is_decision_maker: { type: "BOOLEAN" },
          is_vacant_lot: { type: "BOOLEAN" }, is_commercial: { type: "BOOLEAN" }, is_spanish_speaker: { type: "BOOLEAN" },
          is_listed_on_mls: { type: "BOOLEAN" }, is_under_contract: { type: "BOOLEAN" }, timeline_over_6_months: { type: "BOOLEAN" },
          is_aggressive_refusal: { type: "BOOLEAN" }, rejected_selling_multiple_times: { type: "BOOLEAN" }, is_underwater: { type: "BOOLEAN" },
          other_properties_volunteered: { type: "STRING" }, condition_established: { type: "BOOLEAN" }, lot_details_established: { type: "BOOLEAN" },
          spoken_asking_price: { type: "STRING" }, spoken_market_value: { type: "STRING" }, exact_reason_quote: { type: "STRING" },
          closing_within_3_months: { type: "BOOLEAN" }, is_qualified: { type: "BOOLEAN" }, qualification_reason: { type: "STRING" },
          compliance_check: { type: "STRING" }, compliance_passed: { type: "BOOLEAN" }, lead_category: { type: "STRING" },
          category_reasoning: { type: "STRING" }, has_reason_for_selling: { type: "BOOLEAN" }, requested_dnc: { type: "BOOLEAN" },
          regeneration_steps: { type: "STRING" }, call_summary: { type: "STRING" },
          seller_personality: { type: "STRING" }, seller_pain_point: { type: "STRING" }, seller_bottom_line: { type: "STRING" },
          primary_objection: { type: "STRING" }, objection_quote: { type: "STRING" },
          repairs_mentioned: { type: "ARRAY", items: { type: "STRING" } },
          rehab_cost_estimate: { type: "NUMBER" },
          estimated_arv: { type: "NUMBER" },
          estimated_arv_low: { type: "NUMBER" },
          estimated_arv_high: { type: "NUMBER" },
          arv_reasoning: { type: "STRING" },
          arv_narrative: { type: "STRING" },
          arv_comps: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                address: { type: "STRING" }, layout: { type: "STRING" },
                sqft: { type: "NUMBER" }, status: { type: "STRING" }, value: { type: "NUMBER" },
              },
            },
          },
          estimated_monthly_rent: { type: "NUMBER" },
          transcript: { type: "STRING" },
          has_data_discrepancy: { type: "BOOLEAN" },
          discrepancy_notes: { type: "STRING" },
          seller_name_on_call: { type: "STRING" },
        },
        required: ["raw_extracted_address", "is_decision_maker", "is_commercial", "is_spanish_speaker",
          "spoken_asking_price", "spoken_market_value", "is_qualified", "qualification_reason",
          "compliance_passed", "lead_category", "has_reason_for_selling", "closing_within_3_months"],
      },
    },
  };
  const res = await geminiPost(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, payload);
  if (!res.ok) throw new Error(`Qualification AI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try { return JSON.parse(text) as QualJSON; }
  catch { throw new Error("Qualification AI returned invalid JSON"); }
}

async function runCoaching(fileUri: string, mime: string, key: string): Promise<string> {
  const system = `
ROLE: Veteran Real Estate Sales Manager and QA Expert. Evaluate the AGENT's performance.
Focus on: missing qualification questions; bad habits (talking too much, interrupting, accepting vague answers,
losing control); missed emotional cues (death/health/relocation/financial hardship); sales tactics (rapport,
objection handling, tone, pricing transition, closing/next-step); seller sentiment matching.
Write exactly 2-3 highly specific bullet points (no bullet symbols/hyphens at line start).
MANDATORY: include the exact [MM:SS] timestamp for every critique or praise.`.trim();
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: "Write coaching points." }, { file_data: { mime_type: mime, file_uri: fileUri } }] }],
    generationConfig: {
      temperature: 0.1, responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { coaching_points: { type: "STRING" } }, required: ["coaching_points"] },
    },
  };
  // Coaching is non-essential — never let it fail the whole analysis.
  const res = await geminiPost(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, payload);
  if (!res.ok) return "No feedback.";
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try { return safeStr(JSON.parse(text).coaching_points) || "No feedback."; }
  catch { return "No feedback."; }
}

// ── Deterministic decision tree (ported from coreProcessRow) ──
// marketValue = LIVE Zillow Zestimate (or Gemini comp-based ARV fallback).
// submittedAsking = the asking price on the lead record (manual/extracted),
//   used when the seller's price wasn't captured as a "spoken" value.
function decide(q: QualJSON, marketValue?: number | null, submittedAsking?: number | null): { status: string; reason: string; regeneration: string } {
  const aiReason = safeStr(q.qualification_reason) || "No reason.";
  let regeneration = safeStr(q.regeneration_steps) || "No steps generated.";
  const isDecisionMaker = q.is_decision_maker !== false;
  const isCommercial = q.is_commercial === true;
  const isSpanish = q.is_spanish_speaker === true;
  const isVacantLot = q.is_vacant_lot === true;
  const otherProps = q.other_properties_volunteered && safeStr(q.other_properties_volunteered).toLowerCase() !== "none"
    ? safeStr(q.other_properties_volunteered) : false;
  const conditionEstablished = q.condition_established === true;
  const lotDetailsEstablished = q.lot_details_established === true;
  const compliancePassed = q.compliance_passed === true;
  const requestedDnc = q.requested_dnc === true;
  const leadCategory = safeStr(q.lead_category) || "motivated_distressed";
  const hasReason = q.has_reason_for_selling === true;
  const closing3 = q.closing_within_3_months === true;
  const isQ = q.is_qualified === true;
  const isListed = q.is_listed_on_mls === true;
  const isUnderContract = q.is_under_contract === true;
  const timelineOver6 = q.timeline_over_6_months === true;
  const isAggressive = q.is_aggressive_refusal === true;
  const rejected2x = q.rejected_selling_multiple_times === true;
  const isUnderwater = q.is_underwater === true;

  let asking = NaN, spokenMv = NaN;
  if (q.spoken_asking_price && safeStr(q.spoken_asking_price).toLowerCase() !== "none") asking = extractFirstPrice(q.spoken_asking_price);
  // Fall back to the asking price on the lead (manual entry / template extraction)
  // when the seller's number wasn't tagged as "spoken" — so a real price still drives the math.
  if ((isNaN(asking) || asking <= 0) && typeof submittedAsking === "number" && submittedAsking > 0) asking = submittedAsking;
  if (q.spoken_market_value && safeStr(q.spoken_market_value).toLowerCase() !== "none") spokenMv = extractFirstPrice(q.spoken_market_value);
  // The LIVE Zillow Zestimate is the single source of truth. Fall back to a
  // spoken market value only when no Zestimate was resolved.
  const liveMv = typeof marketValue === "number" && marketValue > 0 ? marketValue : NaN;
  const mv = !isNaN(liveMv) ? liveMv : spokenMv;
  const hasAsking = !isNaN(asking) && asking > 0;
  const hasMv = !isNaN(mv) && mv > 0;
  const ratio = hasAsking && hasMv ? asking / mv : NaN;

  let status = "", reason = "";

  if (isSpanish) { status = "Disqualified"; reason = "dq - 100% Spanish Call."; regeneration = "Pass to Spanish speaking agent."; }
  else if (isCommercial) { status = "Commercial"; reason = "Commercial / Retail / Industrial property detected."; regeneration = "Route to Commercial team."; }
  else if (requestedDnc) { status = "Disqualified"; reason = `dq - take off list (Reason: ${aiReason})`; regeneration = "Dead lead. Do not call back."; }
  else if (leadCategory === "sarcastic_bluffer") { status = "Disqualified"; reason = `dq - Sarcastic/Fake Lead/Bluffer (Reason: ${aiReason})`; regeneration = "Dead lead. Do not call back."; }
  else if (!isDecisionMaker) { status = "Disqualified"; reason = `dq - Not Decision Maker (Reason: ${aiReason})`; regeneration = "Need to reach actual decision maker."; }
  else if (!isQ && (isUnderwater || reasonMatches(aiReason, ["underwater on the loan", "underwater on mortgage", "no equity", "owes more than"], ["basement flooded", "basement was underwater", "yard was underwater"]))) { status = "Disqualified"; reason = `dq - No Equity (Reason: ${aiReason})`; }
  else if (!isQ && (isListed || reasonMatches(aiReason, ["listed on mls", "listed with a realtor", "listed with an agent", "listed with broker", "actively listed", "currently listed"], ["listed reasons", "listed several", "enlisted"]))) { status = "Disqualified"; reason = `dq - Listed (Reason: ${aiReason})`; }
  else if (!isQ && (timelineOver6 || reasonMatches(aiReason, ["timeline > 6 months", "more than 6 months", "next year", "no rush to sell", "not for a year", "in a year"], ["renovated 6 months ago", "bought 6 months ago", "lived there 6 months"]))) { status = "Disqualified"; reason = `dq - Timeline > 6 months (Reason: ${aiReason})`; }
  else if (!isQ && (isUnderContract || reasonMatches(aiReason, ["under contract", "accepting backup offers", "in escrow"], ["roof under contract", "hvac under contract", "contractor"]))) { status = "Disqualified"; reason = "dq - Under contract / Backup offers"; }
  else if (!isQ && isAggressive) { status = "Disqualified"; reason = "dq - Aggressive/Refused all info"; }
  else if (!isQ && (rejected2x || reasonMatches(aiReason, ["rejected selling 2", "rejected selling twice", "refused to sell 2"], ["offer was rejected", "buyer rejected", "lender rejected"]))) { status = "Disqualified"; reason = "dq - Rejected selling 2+ times"; }
  else if (!compliancePassed) { status = "Disqualified"; reason = "dq - Compliance Failed (Missing items)"; regeneration = "Agent failed compliance. Review call."; }
  else if (!hasAsking && !hasReason) { status = "Disqualified"; reason = "dq - Price fishing. No asking price and no valid reason for selling."; regeneration = "Dead lead. Seller fishing with no price and no real reason."; }
  // ── Pricing matrix vs the LIVE Zillow Zestimate (Z) ────────────────────
  //   HOT  : asking ≤ 0.70·Z  AND a valid reason for selling
  //   WARM : 0.70·Z < asking < Z  AND a valid reason
  //   COLD : Z ≤ asking ≤ 1.25·Z  (price near/above market; money-only or weak reason)
  //   DQ   : asking > 1.25·Z  (retail mindset / overpriced)
  else if (hasAsking && hasMv) {
    const mvSrc = !isNaN(liveMv) ? "Zillow" : "spoken";
    if (ratio <= 0.70) {
      if (hasReason) { status = "Hot"; reason = `🔥 HOT - Deep discount: asking $${asking.toLocaleString()} ≤ 70% of ${mvSrc} value $${Math.round(mv).toLocaleString()}, with valid motivation.`; }
      else { status = "Warm"; reason = `Warm - Deep discount (≤ 70% of ${mvSrc} value) but no clear motivation. Needs a reason confirmed.`; }
    } else if (ratio < 1.0) {
      if (hasReason) { status = "Warm"; reason = `🟡 WARM - Asking $${asking.toLocaleString()} below ${mvSrc} value $${Math.round(mv).toLocaleString()} (>70%), motivated seller.`; }
      else { status = "Cold"; reason = `🔵 COLD - Below market but money-only / weak motivation. Asking $${asking.toLocaleString()} vs ${mvSrc} $${Math.round(mv).toLocaleString()}.`; }
    } else if (ratio <= 1.25) {
      status = "Cold"; reason = `🔵 COLD - Asking $${asking.toLocaleString()} at/above ${mvSrc} value $${Math.round(mv).toLocaleString()} (≤125%). Retail-leaning; nurture for a discount.`;
      regeneration = "Nurture. Anchor down toward 70% of market value.";
    } else {
      status = "Disqualified"; reason = `dq - Overpriced: asking $${asking.toLocaleString()} > 125% of ${mvSrc} value $${Math.round(mv).toLocaleString()}. Retail mindset.`;
      regeneration = "Dead lead. Far above market.";
    }
  }
  // No usable price math — fall back to motivation only.
  else if (hasReason) { status = "Cold"; reason = "🔵 COLD - Valid motivation but no usable price/market value yet. Needs price discovery."; }

  if (!status) { status = "Disqualified"; reason = "dq - No qualifying signal detected on call."; }

  // Alternative property override
  if (status === "Disqualified" && otherProps) {
    status = "Cold"; reason = `Cold Lead (Alternative Property) - Primary dead, seller volunteered off-market property: ${otherProps}.`;
    regeneration = "Call back to negotiate the volunteered property.";
  }

  // Missing-detail → Call Back
  if (status !== "Disqualified" && status !== "Commercial") {
    if (isVacantLot && !lotDetailsEstablished) { status = "Call Back"; reason = `Call Back - Missing vacant lot details (size, buildability, zoning). | ${reason}`; regeneration = "Call back to establish lot size, buildability, zoning."; }
    else if (!isVacantLot && !conditionEstablished) { status = "Call Back"; reason = `Call Back - Property condition (repairs, roof, HVAC) never established. | ${reason}`; regeneration = "Call back to establish home condition."; }
  }

  return { status, reason, regeneration };
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: Request): Promise<Response> {
  let leadIdOuter = "";
  try {
    let leadId = "", audioUrl: string | undefined;
    let audioUrls: string[] = [];
    let directFiles: Array<{ bytes: ArrayBuffer; mime: string; size: number }> = [];
    const ct = req.headers.get("content-type") || "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      leadId = String(form.get("leadId") || "");
      // Accept either a single "file" or many "files" entries.
      const all = [...form.getAll("file"), ...form.getAll("files")];
      for (const v of all) {
        if (v && typeof v !== "string") {
          const f = v as File;
          directFiles.push({ bytes: await f.arrayBuffer(), mime: f.type || "audio/mpeg", size: f.size });
        }
      }
      const u = form.get("audioUrl"); if (u) audioUrl = String(u);
    } else {
      const body = await req.json().catch(() => ({}));
      leadId = body.leadId || "";
      audioUrl = body.audioUrl;
      if (Array.isArray(body.audioUrls)) audioUrls = body.audioUrls.filter((u: unknown): u is string => typeof u === "string");
    }
    if (!leadId) return jsonRes({ error: "leadId required" }, 400);
    leadIdOuter = leadId;

    const sa = service();
    const { data: lead, error: leadErr } = await sa.from("leads").select("*").eq("id", leadId).single();
    if (leadErr || !lead) return jsonRes({ error: "Lead not found" }, 404);

    // DUPLICATE (address) — SMART BYPASS: only block if another lead with the
    // same address is still ACTIVE. Dead leads (Disqualified / Error / Duplicate)
    // do NOT block a re-submission — the new one is allowed to be re-analyzed.
    if (lead.extracted_address) {
      // Non-blocking statuses: dead leads AND siblings still being processed
      // (so parallel imports of the same address don't flag each other, and a
      // stuck "Processing" row never blocks a fresh submission).
      const NON_BLOCKING = new Set(["disqualified", "error", "duplicate", "processing"]);
      const { data: dups } = await sa.from("leads").select("id, status, created_at")
        .eq("user_id", lead.user_id).ilike("extracted_address", lead.extracted_address).neq("id", lead.id);
      // Only an EARLIER-created, live lead blocks — guarantees at most one of a
      // same-address pair is ever marked Duplicate, never both.
      const myCreated = new Date(lead.created_at || 0).getTime();
      const activeDup = (dups || []).find((d) =>
        !NON_BLOCKING.has(String(d.status || "").toLowerCase()) &&
        new Date(d.created_at || 0).getTime() <= myCreated);
      if (activeDup) {
        await sa.from("leads").update({ status: "Duplicate", rejection_reason: "Address already submitted.", ai_processed_at: new Date().toISOString() }).eq("id", lead.id);
        return jsonRes({ ok: true, status: "Duplicate" });
      }
    }

    // ── COST GUARD ── Gemini bills per second of audio. Cap how many
    // recordings we send per analysis so a lead with many calls can't blow up
    // the bill. MAX_ANALYZE_FILES newest files + a hard total-bytes ceiling.
    const MAX_ANALYZE_FILES = 4;
    const MAX_ANALYZE_BYTES = 120 * 1024 * 1024; // ~120MB combined upload to the model

    // Resolve audio inputs. Priority:
    //   1. Files posted directly (multipart) or explicit URLs (JSON).
    //   2. IN-HOUSE recordings stored on the lead (ingested from Drive or uploaded).
    //   3. LAST RESORT: a raw Drive/recording link on the lead.
    // Once a recording has been ingested in-house, the AI runs entirely on our
    // own storage and never touches Google Drive.
    let inputs: Array<{ bytes: ArrayBuffer; mime: string; size: number }> = [...directFiles];
    const hasTranscriptAlready = typeof lead.transcript === "string" && lead.transcript.trim().length > 40;
    const storedAudioUrl = (lead.metadata as { source_audio_url?: string } | null)?.source_audio_url || null;

    let urlList: string[] = [...audioUrls, ...(audioUrl ? [audioUrl] : [])];

    // No explicit input → prefer the in-house recording.
    if (directFiles.length === 0 && urlList.length === 0 && !hasTranscriptAlready) {
      const { data: recs } = await sa.from("call_uploads")
        .select("file_path, bucket, storage_url").eq("lead_id", lead.id)
        .order("created_at", { ascending: false }).limit(MAX_ANALYZE_FILES);
      for (const rec of (recs || []) as { file_path: string | null; bucket: string | null; storage_url: string | null }[]) {
        if (rec.file_path) {
          const { data: s } = await sa.storage.from(rec.bucket || "call-recordings").createSignedUrl(rec.file_path, 600);
          if (s?.signedUrl) urlList.push(s.signedUrl);
        } else if (rec.storage_url) {
          urlList.push(rec.storage_url);
        }
      }
      // Still nothing in-house → fall back to the raw Drive/recording link.
      if (urlList.length === 0) {
        if (storedAudioUrl) urlList.push(storedAudioUrl);
        else if (lead.call_recording_url) urlList.push(lead.call_recording_url);
      }
    }

    // Private Google Drive access token for this lead's owner (if connected).
    const driveToken = await getDriveAccessToken(sa, lead.user_id).catch(() => null);
    for (const url of urlList) {
      try {
        const got = await fetchAudioUrl(url, driveToken);
        if (got) inputs.push({ bytes: got.bytes, mime: got.mime, size: got.bytes.byteLength });
      } catch { /* skip individual failures */ }
    }
    // Keep the newest N files within the byte ceiling (cost guard).
    if (inputs.length > MAX_ANALYZE_FILES) inputs = inputs.slice(-MAX_ANALYZE_FILES);
    {
      const capped: typeof inputs = [];
      let running = 0;
      for (const inp of inputs) {
        if (running + inp.size > MAX_ANALYZE_BYTES && capped.length > 0) break;
        capped.push(inp); running += inp.size;
      }
      inputs = capped;
    }
    const totalSize = inputs.reduce((s, i) => s + i.size, 0);

    // No new audio: if we have a stored transcript, re-grade from TEXT (cheap —
    // Pillar 2). Otherwise flag for callback.
    const savedTranscript = typeof lead.transcript === "string" && lead.transcript.trim().length > 40 ? lead.transcript : null;
    if (inputs.length === 0 && !savedTranscript) {
      // If a call link was provided but we couldn't download it, say why.
      const linkButNoAudio = !!storedAudioUrl && driveFileId(storedAudioUrl);
      const reason = linkButNoAudio
        ? (driveToken
            ? "Couldn't download the call recording from the Google Drive link. Check that the file exists and is shared with the connected Google account."
            : "Couldn't download the call recording — the Google Drive link isn't public. Make it 'Anyone with the link', or connect Google Drive (Settings → Webhooks & Integrations) for private files, then re-run.")
        : "No call recording attached — cannot verify. Upload the recording to run the review.";
      await sa.from("leads").update({
        status: "Call Back",
        qualification_reason: reason,
        ai_status_reason: linkButNoAudio ? "Recording link unreachable" : "Awaiting call recording",
        ai_model: MODEL, ai_processed_at: new Date().toISOString(),
      }).eq("id", lead.id);
      return jsonRes({ ok: true, status: "Call Back", reason: "no_audio" });
    }
    const textOnly = inputs.length === 0 && !!savedTranscript;

    // Audio too short (skip when re-grading from a stored transcript).
    if (!textOnly && totalSize < MIN_FILE_SIZE_BYTES) {
      await sa.from("leads").update({
        status: "Disqualified", rejection_reason: `Audio too short to evaluate (${totalSize}B).`,
        audio_size_bytes: totalSize, ai_processed_at: new Date().toISOString(),
      }).eq("id", lead.id);
      return jsonRes({ ok: true, status: "Disqualified", reason: "audio_too_short" });
    }

    // Persist any DIRECTLY-uploaded files (public submission form sends bytes
    // here) into the PRIVATE call-recordings bucket so they're playable later
    // via signed URLs. URL-sourced inputs are already stored by the uploader.
    if (directFiles.length) {
      const folder = lead.organization_id || lead.user_id || "org";
      for (const df of directFiles) {
        try {
          const ext = (df.mime.split("/")[1] || "mp3").replace("mpeg", "mp3").replace("x-m4a", "m4a");
          const path = `${folder}/${lead.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: upErr } = await sa.storage.from("call-recordings").upload(path, df.bytes, { contentType: df.mime });
          if (!upErr) {
            await sa.from("call_uploads").insert({
              lead_id: lead.id, user_id: lead.user_id,
              file_name: `recording.${ext}`, file_path: path, bucket: "call-recordings",
              file_size_bytes: df.size, storage_url: null, status: "uploaded",
            });
          }
        } catch { /* best-effort persistence */ }
      }
    }

    // Campaign rules
    let rules = "";
    if (lead.campaign_id) {
      const { data: c } = await sa.from("campaigns").select("rules").eq("id", lead.campaign_id).maybeSingle();
      rules = c?.rules || "";
    }

    // Org persona + Kill List overrides (Phase: admin-editable persona).
    let orgPersona: string | null = null;
    let orgKillers: Array<{ id: string; label: string; rule: string; enabled?: boolean }> | null = null;
    if (lead.organization_id) {
      try {
        const { data: org } = await sa
          .from("organizations")
          .select("qa_persona, qa_killers")
          .eq("id", lead.organization_id)
          .maybeSingle();
        orgPersona = (org?.qa_persona as string | null) ?? null;
        orgKillers = (org?.qa_killers as typeof orgKillers) ?? null;
      } catch { /* columns absent pre-migration */ }
    }

    const key = geminiKey();

    // ── ZILLOW = DATA ONLY ── Ensure we have the property facts + comparables.
    // Use what was stored at submit; if missing (e.g. inbound-API leads), pull it
    // now. Gemini will COMPUTE the ARV from these comps — Zillow gives no ARV.
    const mdNow = (lead.metadata || {}) as Record<string, unknown>;
    let zillowData = mdNow.zillow_data as { zestimate?: number; address?: string; sqft?: number; beds?: number; baths?: number } | undefined;
    let comparables = (mdNow.comparables as Array<Record<string, unknown>> | undefined) || [];
    // Re-pull when we lack a Zestimate OR have no comparables (Gemini needs comps
    // to compute the ARV). /api/zillow is cache-backed, so this is cheap.
    if (((!zillowData || !zillowData.zestimate) || comparables.length === 0) && lead.extracted_address) {
      try {
        const origin = new URL(req.url).origin;
        const zr = await fetch(`${origin}/api/zillow?address=${encodeURIComponent(lead.extracted_address)}`);
        const zj = await zr.json().catch(() => ({}));
        if (zr.ok && zj.ok && zj.normalized) {
          zillowData = zj.normalized;
          if (Array.isArray(zj.comparables) && zj.comparables.length) comparables = zj.comparables;
        }
      } catch { /* data fetch best-effort */ }
    }

    // ENFORCED: always FORCE Gemini to SEARCH (Google Search grounding) for real
    // comps near the address we're working on — real addresses, never invented.
    let compsSource: "provider" | "searched" | "mixed" | "none" = comparables.length ? "provider" : "none";
    if (lead.extracted_address) {
      const providerCount = comparables.length;
      const searched = await runCompsSearch(lead.extracted_address, {
        sqft: (zillowData?.sqft as number | undefined) ?? null,
        beds: (zillowData?.beds as number | undefined) ?? null,
        baths: (zillowData?.baths as number | undefined) ?? null,
      }, key);
      if (searched.length) {
        const seen = new Set(comparables.map((c) => String(c.address || "").toLowerCase().replace(/\s+/g, " ").trim()));
        for (const c of searched) {
          const k = String(c.address || "").toLowerCase().replace(/\s+/g, " ").trim();
          if (k && !seen.has(k)) { seen.add(k); comparables.push(c); }
        }
        compsSource = providerCount ? "mixed" : "searched";
      }
    }

    const marketValue: number | null = (zillowData?.zestimate as number | undefined) ?? null;
    const resolvedAddress: string | null =
      (zillowData?.address as string | undefined) ?? lead.extracted_address ?? null;
    const marketData = {
      zestimate: zillowData?.zestimate ?? null,
      sqft: (zillowData?.sqft as number | undefined) ?? null,
      beds: (zillowData?.beds as number | undefined) ?? null,
      baths: (zillowData?.baths as number | undefined) ?? null,
      comparables,
    };

    // Upload EVERY attached call to Gemini so the AI hears them all (audio mode).
    const ups: Array<{ uri: string; mime: string }> = [];
    if (!textOnly) {
      for (const inp of inputs) {
        try { ups.push(await uploadToGemini(inp.bytes, inp.mime || "audio/mpeg", key)); }
        catch { /* skip one bad file */ }
      }
      if (ups.length === 0) throw new Error("All audio uploads to the AI failed");
    }

    // Manually-submitted data for the TRUTH VERIFICATION cross-check.
    const md = (lead.metadata || {}) as Record<string, unknown>;
    const submitted = {
      address: lead.extracted_address ?? null,
      askingPrice: lead.asking_price != null ? `$${Number(lead.asking_price).toLocaleString()}` : null,
      sellerName: (md.owner_name as string | undefined) || null,
      notes: (md.reason as string | undefined) || null,
    };

    // Qualification — audio mode or cheap text re-grade from the saved transcript.
    const q = await runQualification(ups, rules, key, {
      orgPersona, orgKillers, marketValue, propertyAddress: resolvedAddress,
      transcriptText: textOnly ? savedTranscript : null,
      submitted, marketData,
    });
    // Coaching only runs in audio mode (needs the recording). On text re-runs we
    // keep the previously-saved coaching.
    let coaching = textOnly ? safeStr((lead.metadata as { ai_feedback?: string } | null)?.ai_feedback) || safeStr(lead.ai_feedback) || "No feedback." : "No feedback.";
    if (!textOnly) {
      try { coaching = await runCoaching(ups[0].uri, ups[0].mime, key); } catch { /* coaching is best-effort */ }
    }

    // ── AUTO-CORRECTION ── When the agent's manual entry contradicts the call,
    // trust the call: adopt the spoken values and, if the ADDRESS was wrong,
    // re-pull live property data (Zillow + ARV) for the address heard on the call
    // so the verdict is computed against the RIGHT property.
    const hasDisc = q.has_data_discrepancy === true;
    const normAddr = (s: string) => (s || "").trim().toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ");
    const callAddr = safeStr(q.raw_extracted_address);
    const callAddrValid = !!callAddr && callAddr.toLowerCase() !== "not stated on call" && callAddr.length > 8;
    const addrDiffers = callAddrValid && normAddr(callAddr) !== normAddr(lead.extracted_address || "");

    let effMarketValue = marketValue;
    let correctedAddress: string | null = null;
    const corrPatch: Record<string, unknown> = {};

    if (hasDisc && addrDiffers) {
      correctedAddress = callAddr;
      corrPatch.address_corrected_from = lead.extracted_address || null;
      try {
        const origin = new URL(req.url).origin;
        const zr = await fetch(`${origin}/api/zillow?address=${encodeURIComponent(callAddr)}`);
        const zj = await zr.json().catch(() => ({}));
        if (zr.ok && zj.ok && zj.normalized) {
          const normalized = zj.normalized as { zestimate?: number };
          if (Number(normalized.zestimate) > 0) effMarketValue = Number(normalized.zestimate);
          corrPatch.zillow_data = normalized;
          const nd = normalized as { zestimate?: number; sqft?: number; beds?: number; baths?: number };
          const correctedComps: Array<Record<string, unknown>> = Array.isArray(zj.comparables) ? zj.comparables : [];
          // Always force a grounded comp search for the CORRECTED address too.
          {
            const providerCount = correctedComps.length;
            const searched = await runCompsSearch(callAddr, { sqft: nd.sqft ?? null, beds: nd.beds ?? null, baths: nd.baths ?? null }, key);
            const seen = new Set(correctedComps.map((c: Record<string, unknown>) => String(c.address || "").toLowerCase().trim()));
            for (const c of searched) { const k = String(c.address || "").toLowerCase().trim(); if (k && !seen.has(k)) { seen.add(k); correctedComps.push(c); } }
            if (searched.length) corrPatch.comps_source = providerCount ? "mixed" : "searched";
            else if (providerCount) corrPatch.comps_source = "provider";
            else corrPatch.comps_source = "none";
          }
          if (correctedComps.length) corrPatch.comparables = correctedComps;

          // RE-COMPUTE the ARV against the CORRECTED property's comps so the
          // address, Zillow data, and ARV all match in this single pass.
          const arvRpt = await runArvReport(
            { zestimate: nd.zestimate ?? null, sqft: nd.sqft ?? null, beds: nd.beds ?? null, baths: nd.baths ?? null, comparables: correctedComps },
            callAddr, key,
          );
          if (Number(arvRpt.estimated_arv) > 0 || Number(arvRpt.estimated_arv_low) > 0) {
            q.estimated_arv = arvRpt.estimated_arv;
            q.estimated_arv_low = arvRpt.estimated_arv_low;
            q.estimated_arv_high = arvRpt.estimated_arv_high;
            q.arv_reasoning = arvRpt.arv_reasoning;
            q.arv_narrative = arvRpt.arv_narrative;
            q.arv_comps = arvRpt.arv_comps;
            if (Number(arvRpt.estimated_monthly_rent) > 0) q.estimated_monthly_rent = arvRpt.estimated_monthly_rent;
          }
        }
      } catch { /* re-fetch best-effort — fall back to original market value */ }
    }

    // Gemini's comp-derived ARV point estimate (midpoint of the range if needed).
    const geminiArv = Number(q.estimated_arv) > 0
      ? Number(q.estimated_arv)
      : ((Number(q.estimated_arv_low) > 0 && Number(q.estimated_arv_high) > 0)
          ? Math.round((Number(q.estimated_arv_low) + Number(q.estimated_arv_high)) / 2) : 0);
    // If Zillow had no Zestimate, fall back to that ARV so the verdict isn't stuck.
    if (!(typeof effMarketValue === "number" && effMarketValue > 0) && geminiArv > 0) {
      effMarketValue = geminiArv;
    }

    // Call-truth overrides for wrong manual entries.
    const callAsking = extractFirstPrice(q.spoken_asking_price) || null;
    const correctedAsking = hasDisc && callAsking ? callAsking : null;
    const callSeller = safeStr(q.seller_name_on_call);
    const correctedSeller = hasDisc && callSeller ? callSeller : null;

    // Decision is computed against the CORRECTED market value when the address was
    // fixed, and falls back to the lead's asking price when the seller's number
    // wasn't captured as "spoken".
    const submittedAskingNum = correctedAsking ?? (lead.asking_price != null ? Number(lead.asking_price) : null);
    const { status, reason, regeneration } = decide(q, effMarketValue, submittedAskingNum);
    const coachingArr = coaching.split(/\n+/).map(s => s.trim()).filter(Boolean);

    // Keep the transcript: fresh one from audio mode, else preserve the saved one.
    const transcriptToStore = !textOnly && safeStr(q.transcript) ? safeStr(q.transcript) : (savedTranscript ?? null);

    await sa.from("leads").update({
      status,
      qualification_reason: reason,
      ai_feedback: coaching,
      ai_coaching_points: coachingArr,
      transcript: transcriptToStore,
      ai_status_reason: safeStr(q.exact_reason_quote) || reason,
      ai_model: MODEL,
      ai_processed_at: new Date().toISOString(),
      audio_size_bytes: totalSize,
      extracted_address: correctedAddress || lead.extracted_address || (callAddrValid ? callAddr : lead.extracted_address),
      asking_price: correctedAsking || lead.asking_price || callAsking,
      bant_budget: safeStr(q.spoken_asking_price) !== "None" ? safeStr(q.spoken_asking_price) : null,
      bant_authority: q.is_decision_maker === false ? "Not decision maker" : "Decision maker",
      bant_need: q.has_reason_for_selling ? safeStr(q.exact_reason_quote) : "No clear motivation",
      bant_timeline: q.closing_within_3_months ? "<= 3 months" : (q.timeline_over_6_months ? "> 6 months" : "Not specified"),
      metadata: {
        ...(lead.metadata || {}),
        ...corrPatch,                                  // re-pulled zillow_data/arv when address was corrected
        // Owner name: trust the call when the agent's entry was wrong (keep the
        // submitted value for the audit trail).
        ...(correctedSeller ? { owner_name: correctedSeller, owner_name_submitted: (lead.metadata as Record<string, unknown> | null)?.owner_name ?? null } : {}),
        ...(correctedAsking ? { asking_price_submitted: (lead.metadata as Record<string, unknown> | null)?.asking_price_submitted ?? lead.asking_price ?? null } : {}),
        lead_template: safeStr(q.raw_lead_template),
        compliance_check: safeStr(q.compliance_check),
        compliance_passed: q.compliance_passed === true,
        tone: safeStr(q.owner_tone_of_voice),
        lead_category: safeStr(q.lead_category),
        regeneration_steps: regeneration,
        extracted_items: q.extracted_items || [],
        spoken_market_value: safeStr(q.spoken_market_value),
        call_summary: safeStr(q.call_summary),
        // ── New extraction fields ──
        seller_personality: safeStr(q.seller_personality),
        seller_pain_point: safeStr(q.seller_pain_point),
        seller_bottom_line: safeStr(q.seller_bottom_line),
        primary_objection: safeStr(q.primary_objection) || "None",
        objection_quote: safeStr(q.objection_quote),
        repairs_mentioned: Array.isArray(q.repairs_mentioned) ? q.repairs_mentioned : [],
        rehab_cost_estimate: typeof q.rehab_cost_estimate === "number" ? q.rehab_cost_estimate : 0,
        // ── Market data: Zillow supplies facts, Gemini computes the ARV ──
        // (corrPatch already set corrected zillow_data/comparables when the
        //  address was fixed — don't overwrite those here.)
        ...(!correctedAddress && zillowData ? { zillow_data: zillowData } : {}),
        ...(!correctedAddress && comparables.length ? { comparables } : {}),
        zestimate: (correctedAddress ? (corrPatch.zillow_data as { zestimate?: number } | undefined)?.zestimate : zillowData?.zestimate) != null
          ? String((correctedAddress ? (corrPatch.zillow_data as { zestimate?: number } | undefined)?.zestimate : zillowData?.zestimate))
          : safeStr((lead.metadata as Record<string, unknown> | null)?.zestimate),
        arv: geminiArv > 0 ? geminiArv : (Number((lead.metadata as { arv?: number } | null)?.arv) || null),
        arv_low: Number(q.estimated_arv_low) > 0 ? Math.round(Number(q.estimated_arv_low)) : null,
        arv_high: Number(q.estimated_arv_high) > 0 ? Math.round(Number(q.estimated_arv_high)) : null,
        arv_reasoning: safeStr(q.arv_reasoning),
        arv_narrative: safeStr(q.arv_narrative),
        arv_comps: Array.isArray(q.arv_comps) ? q.arv_comps.slice(0, 10) : [],
        comps_source: correctedAddress ? (corrPatch.comps_source ?? compsSource) : compsSource,
        estimated_monthly_rent: Number(q.estimated_monthly_rent) > 0 ? Math.round(Number(q.estimated_monthly_rent)) : (Number((lead.metadata as { estimated_monthly_rent?: number } | null)?.estimated_monthly_rent) || null),
        // Truth verification (anti-fraud)
        has_data_discrepancy: q.has_data_discrepancy === true,
        discrepancy_notes: q.has_data_discrepancy === true ? safeStr(q.discrepancy_notes) : "",
      },
    }).eq("id", lead.id);

    // Aggregate stats on the caller
    if (lead.caller_id && coachingArr.length) {
      const { data: caller } = await sa.from("cold_callers").select("aggregate_stats").eq("id", lead.caller_id).maybeSingle();
      const stats = (caller?.aggregate_stats as Record<string, unknown> | null) || {};
      const all = (stats.coaching_points as string[] | undefined) || [];
      const totalAnalyzed = (stats.total_analyzed as number | undefined) || 0;
      const qualifiedCount = (stats.qualified_count as number | undefined) || 0;
      await sa.from("cold_callers").update({
        aggregate_stats: {
          ...stats,
          coaching_points: [...all, ...coachingArr].slice(-50),
          total_analyzed: totalAnalyzed + 1,
          qualified_count: qualifiedCount + (["Hot", "Warm", "Cold"].includes(status) ? 1 : 0),
          last_feedback: coaching,
          last_status: status,
        },
      }).eq("id", lead.caller_id);
    }

    return jsonRes({ ok: true, status, reason });
  } catch (e) {
    // Never leave a lead stuck in "Processing" — flip it to Error so the UI
    // shows it and the user can re-run, rather than spinning forever.
    if (leadIdOuter) {
      try {
        await service().from("leads").update({
          status: "Error",
          ai_status_reason: "Analysis failed — please re-run.",
          rejection_reason: e instanceof Error ? e.message.slice(0, 300) : "Analysis error",
          ai_processed_at: new Date().toISOString(),
        }).eq("id", leadIdOuter);
      } catch { /* best-effort */ }
    }
    return jsonRes({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
