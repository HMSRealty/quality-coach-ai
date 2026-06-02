// app/api/analyze/route.ts
// Edge-runtime. Web APIs only — no Node fs/path/Buffer.
// Ported QA engine: two-pass Gemini (qualification + coaching) + deterministic
// decision tree mapping AI flags → status / reason, exactly like the sheet engine.

import { createClient } from "@supabase/supabase-js";

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
}

// ── Gemini Files API upload (resumable, edge fetch) ──
async function uploadToGemini(bytes: ArrayBuffer, mime: string, key: string): Promise<{ uri: string; mime: string }> {
  const size = bytes.byteLength;
  const init = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
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
  const fin = await fetch(uploadUrl, {
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

CALL SUMMARY: Write a clear 3-5 sentence plain-English narrative of what happened on the call —
who spoke, what the seller said about the property and their situation, key objections or signals,
and how it ended. Assign to the call_summary field. No jargon.
`.trim();

async function runQualification(fileUri: string, mime: string, customRules: string, key: string): Promise<QualJSON> {
  const payload = {
    systemInstruction: { parts: [{ text: `${QUAL_SYSTEM}\n\nCRITICAL CUSTOM OVERRIDE RULES:\n${customRules || "(none)"}` }] },
    contents: [{
      role: "user",
      parts: [
        { text: "Analyze this call recording only. Extract everything from the audio. Do not invent details not spoken." },
        { file_data: { mime_type: mime, file_uri: fileUri } },
      ],
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
        },
        required: ["raw_extracted_address", "is_decision_maker", "is_commercial", "is_spanish_speaker",
          "spoken_asking_price", "spoken_market_value", "is_qualified", "qualification_reason",
          "compliance_passed", "lead_category", "has_reason_for_selling", "closing_within_3_months"],
      },
    },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Qualification AI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(text) as QualJSON;
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
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Coaching AI HTTP ${res.status}`);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try { return safeStr(JSON.parse(text).coaching_points) || "No feedback."; }
  catch { return "No feedback."; }
}

// ── Deterministic decision tree (ported from coreProcessRow) ──
function decide(q: QualJSON): { status: string; reason: string; regeneration: string } {
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

  let asking = NaN, mv = NaN;
  if (q.spoken_asking_price && safeStr(q.spoken_asking_price).toLowerCase() !== "none") asking = extractFirstPrice(q.spoken_asking_price);
  if (q.spoken_market_value && safeStr(q.spoken_market_value).toLowerCase() !== "none") mv = extractFirstPrice(q.spoken_market_value);
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
  else if (hasAsking && hasMv && asking >= mv) { status = "Disqualified"; reason = `dq mv - Asking ($${asking.toLocaleString()}) >= spoken market value ($${mv.toLocaleString()}). Overpriced.`; regeneration = "Dead lead. Over market value."; }
  else if (!hasAsking && !hasReason) { status = "Disqualified"; reason = "dq - Price fishing. No asking price and no valid reason for selling."; regeneration = "Dead lead. Seller fishing with no price and no real reason."; }
  else if (hasAsking && hasMv && !hasReason && ratio > 0.70) { status = "Disqualified"; reason = `dq - No motivation and asking ($${asking.toLocaleString()}) not a deep discount (> 70% MV). Testing the market.`; regeneration = "Dead lead. Unmotivated, discount too shallow."; }
  else {
    if (hasAsking && hasMv) {
      if (ratio <= 0.70) {
        if (hasReason && closing3) { status = "Qualified"; reason = `🔥 HOT LEAD - Motivated, closes <= 3 mos, AP $${asking.toLocaleString()} <= 70% MV.`; }
        else { status = "Warm"; reason = `Warm Lead - Deep discount (AP $${asking.toLocaleString()} <= 70% MV) but missing strong motivation or fast timeline.`; }
      } else if (ratio < 1.0 && hasReason) { status = "Warm"; reason = `Warm Lead - Motivated seller, AP $${asking.toLocaleString()} below MV.`; }
    } else if (hasReason) { status = "Warm"; reason = "Warm Lead - Valid motivation, but no spoken price/MV. Needs price discovery."; }
  }

  if (!status) { status = "Disqualified"; reason = "dq - No qualifying signal detected on call."; }

  // Alternative property override
  if (status === "Disqualified" && otherProps) {
    status = "Qualified"; reason = `Qualified (Alternative Property) - Primary dead, seller volunteered off-market property: ${otherProps}.`;
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
  try {
    let leadId = "", audioUrl: string | undefined;
    let directAudio: ArrayBuffer | undefined, directMime: string | undefined, directSize: number | undefined;
    const ct = req.headers.get("content-type") || "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      leadId = String(form.get("leadId") || "");
      const file = form.get("file");
      if (file && typeof file !== "string") {
        const f = file as File;
        directAudio = await f.arrayBuffer(); directMime = f.type || "audio/mpeg"; directSize = f.size;
      }
      const u = form.get("audioUrl"); if (u) audioUrl = String(u);
    } else {
      const body = await req.json().catch(() => ({}));
      leadId = body.leadId || ""; audioUrl = body.audioUrl;
    }
    if (!leadId) return jsonRes({ error: "leadId required" }, 400);

    const sa = service();
    const { data: lead, error: leadErr } = await sa.from("leads").select("*").eq("id", leadId).single();
    if (leadErr || !lead) return jsonRes({ error: "Lead not found" }, 404);

    // DUPLICATE (address)
    if (lead.extracted_address) {
      const { data: dups } = await sa.from("leads").select("id")
        .eq("user_id", lead.user_id).ilike("extracted_address", lead.extracted_address).neq("id", lead.id).limit(1);
      if (dups && dups.length) {
        await sa.from("leads").update({ status: "Duplicate", rejection_reason: "Address already submitted.", ai_processed_at: new Date().toISOString() }).eq("id", lead.id);
        return jsonRes({ ok: true, status: "Duplicate" });
      }
    }

    // Resolve audio bytes
    let bytes = directAudio, mime = directMime, size = directSize ?? null;
    if (!bytes && (audioUrl || lead.call_recording_url)) {
      const url = audioUrl || lead.call_recording_url;
      const resp = await fetch(url);
      if (resp.ok) { bytes = await resp.arrayBuffer(); mime = resp.headers.get("content-type") || "audio/mpeg"; size = bytes.byteLength; }
    }

    // No call → can't run the engine; flag for callback
    if (!bytes) {
      await sa.from("leads").update({
        status: "Call Back",
        qualification_reason: "No call recording attached — cannot verify. Upload the recording to run the review.",
        ai_status_reason: "Awaiting call recording",
        ai_model: MODEL, ai_processed_at: new Date().toISOString(),
      }).eq("id", lead.id);
      return jsonRes({ ok: true, status: "Call Back", reason: "no_audio" });
    }

    // Audio too short
    if (size !== null && size < MIN_FILE_SIZE_BYTES) {
      await sa.from("leads").update({
        status: "Disqualified", rejection_reason: `Audio too short to evaluate (${size}B).`,
        audio_size_bytes: size, ai_processed_at: new Date().toISOString(),
      }).eq("id", lead.id);
      return jsonRes({ ok: true, status: "Disqualified", reason: "audio_too_short" });
    }

    // Campaign rules
    let rules = "";
    if (lead.campaign_id) {
      const { data: c } = await sa.from("campaigns").select("rules").eq("id", lead.campaign_id).maybeSingle();
      rules = c?.rules || "";
    }

    const key = geminiKey();
    const up = await uploadToGemini(bytes, mime || "audio/mpeg", key);

    // Two-pass: qualification + coaching
    const q = await runQualification(up.uri, up.mime, rules, key);
    let coaching = "No feedback.";
    try { coaching = await runCoaching(up.uri, up.mime, key); } catch { /* coaching is best-effort */ }

    const { status, reason, regeneration } = decide(q);
    const coachingArr = coaching.split(/\n+/).map(s => s.trim()).filter(Boolean);

    await sa.from("leads").update({
      status,
      qualification_reason: reason,
      ai_feedback: coaching,
      ai_coaching_points: coachingArr,
      ai_status_reason: safeStr(q.exact_reason_quote) || reason,
      ai_model: MODEL,
      ai_processed_at: new Date().toISOString(),
      audio_size_bytes: size,
      extracted_address: lead.extracted_address || (q.raw_extracted_address && q.raw_extracted_address !== "Not stated on call" ? q.raw_extracted_address : lead.extracted_address),
      asking_price: lead.asking_price || (extractFirstPrice(q.spoken_asking_price) || null),
      bant_budget: safeStr(q.spoken_asking_price) !== "None" ? safeStr(q.spoken_asking_price) : null,
      bant_authority: q.is_decision_maker === false ? "Not decision maker" : "Decision maker",
      bant_need: q.has_reason_for_selling ? safeStr(q.exact_reason_quote) : "No clear motivation",
      bant_timeline: q.closing_within_3_months ? "<= 3 months" : (q.timeline_over_6_months ? "> 6 months" : "Not specified"),
      metadata: {
        ...(lead.metadata || {}),
        lead_template: safeStr(q.raw_lead_template),
        compliance_check: safeStr(q.compliance_check),
        compliance_passed: q.compliance_passed === true,
        tone: safeStr(q.owner_tone_of_voice),
        lead_category: safeStr(q.lead_category),
        regeneration_steps: regeneration,
        extracted_items: q.extracted_items || [],
        spoken_market_value: safeStr(q.spoken_market_value),
        call_summary: safeStr(q.call_summary),
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
          qualified_count: qualifiedCount + (status === "Qualified" ? 1 : 0),
          last_feedback: coaching,
          last_status: status,
        },
      }).eq("id", lead.caller_id);
    }

    return jsonRes({ ok: true, status, reason });
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
