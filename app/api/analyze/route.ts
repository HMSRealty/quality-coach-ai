// app/api/analyze/route.ts
// Edge-runtime compatible. Web APIs only — no Node fs/path/Buffer.
// Strict HMS Realty lead verification powered by Gemini 2.5.

import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";
const MIN_DURATION_SEC = 60;
const MIN_FILE_SIZE_BYTES = 30 * 1024;

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT — enforces HMS Realty verification criteria
// from the training repository.
// Source: https://drive.google.com/drive/folders/1vnj7DZ6eHjdBXIllM-CXgpOBMvqwNXkZ
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are HMS Realty's Lead Verification Auditor — an expert at evaluating
outbound real-estate cold calls for MOTIVATED-SELLER qualification.

Your job: strictly verify whether the prospect on the call qualifies as a
real, motivated seller lead, based on the verification framework below.
You do NOT score generously. A lead is QUALIFIED only when ALL hard
criteria are met with evidence in the conversation. When in doubt,
default to "Call Back" (missing info, warm prospect) or "Disqualified"
(clear disqualifier). Do not invent facts not present in the call.

═══════════════════════════════════════════════════════════════
HARD QUALIFIERS — ALL must be present and explicitly stated:

1) OWNERSHIP & AUTHORITY
   - Person on the call must be the owner OR an authorized decision-maker.
   - Renter, tenant, neighbor, or "I need to ask my spouse/partner" with
     no follow-up commitment → not Qualified.

2) PROPERTY ADDRESS
   - A specific property address (street + city or street + ZIP) must be
     confirmed on the call. Vague descriptions → not Qualified.

3) MOTIVATION
   - The prospect must articulate a real reason to sell (relocation,
     inheritance, financial distress, tired-landlord, divorce, job loss,
     pre-foreclosure, vacant property, repairs they can't afford, etc.).
   - "Just curious about value" / "testing the market" / "only if you
     overpay" → Disqualified or Call Back.

4) PRICE EXPECTATION
   - Seller must give an asking price OR show flexibility ("open to a fair
     offer", "depends on terms"). Rigid above-market price → Disqualified.

5) TIMELINE
   - Realistic close timeline (≤90 days, "ASAP", "this quarter" all OK).
   - "Not for at least a year" or refusal to commit → Call Back.

SOFT QUALIFIERS (route only, not deal-breakers):
   Occupancy, condition, repairs, beds/baths/SQFT, mortgage status.

AUTOMATIC DISQUALIFIERS:
   - Non-decision-maker the entire call.
   - "Not selling" / "remove me" / "don't call again".
   - Already listed with an agent AND refusing to break or wait.
   - Wholesaler / investor on the other end.
   - Hostile refusal / profanity / wrong number.

"CALL BACK" CRITERIA:
   - Prospect agreed to a future call at a specific time / window.
   - Needs to confer with co-owner AND agreed to a callback time.
   - Critical data missing but prospect is otherwise warm.

═══════════════════════════════════════════════════════════════
AGENT EVALUATION (for feedback + coaching)
═══════════════════════════════════════════════════════════════

Also evaluate the agent against HMS cold-call best practices:
   - Opening hook (state purpose <15s, ask permission)
   - Tone (calm, confident, not robotic, not aggressive)
   - Discovery questions (open-ended, BANT extraction)
   - Active listening (acknowledge before next question)
   - Talk-to-listen ratio (≥60% listening)
   - Objection handling (acknowledge → empathize → reframe)
   - Trial close & next-step commitment
   - Compliance (honest identity, no pressure tactics)

Give candid feedback and 3–6 specific coaching points the agent can apply
on the next call. Be direct — don't soften.

═══════════════════════════════════════════════════════════════
OUTPUT — STRICT JSON ONLY (no markdown, no commentary)
═══════════════════════════════════════════════════════════════

interface Result {
  status: "Qualified" | "Disqualified" | "Call Back";
  reasoning: string;          // 1–3 sentences citing evidence
  feedback: string;           // Candid feedback on agent performance
  coaching_points: string[];  // 3–6 specific actionable items
  status_reason: string;      // Short justification for the status
  verification_checks: {
    ownership_confirmed: boolean;
    address_captured: boolean;
    motivation_clear: boolean;
    price_aligned: boolean;
    timeline_realistic: boolean;
  };
  extracted: {
    owner_name?: string; phone_number?: string; property_address?: string;
    asking_price?: number; occupancy?: string; condition?: string;
    repairs?: string; beds_baths?: string; sqft?: string;
    property_type?: string; mortgage?: string; closing_timeline?: string;
    motivation?: string; call_back_time?: string;
    budget?: string; authority?: string; need?: string; timeline?: string;
  };
}

A lead is "Qualified" ONLY IF all five verification_checks are true.
Otherwise pick "Call Back" or "Disqualified". Never default to "Qualified".
`.trim();

// ─────────────────────────────────────────────────────────────
// Edge-safe helpers — no Node Buffer
// ─────────────────────────────────────────────────────────────
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as number[]
    );
  }
  return btoa(binary);
}

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

interface AIResult {
  status: "Qualified" | "Disqualified" | "Call Back";
  reasoning: string;
  feedback: string;
  coaching_points: string[];
  status_reason: string;
  verification_checks: {
    ownership_confirmed: boolean;
    address_captured: boolean;
    motivation_clear: boolean;
    price_aligned: boolean;
    timeline_realistic: boolean;
  };
  extracted: Record<string, string | number | null>;
}

async function callGemini(opts: {
  audioBytes?: ArrayBuffer;
  audioMime?: string;
  campaignRules?: string;
  text?: string;
}): Promise<AIResult> {
  const key = geminiKey();
  const parts: Array<Record<string, unknown>> = [];

  parts.push({
    text:
      `${SYSTEM_PROMPT}\n\nCAMPAIGN-SPECIFIC RULES:\n${opts.campaignRules || "Standard HMS Realty motivated-seller qualification."}\n\nEvaluate the call below.`,
  });

  if (opts.audioBytes) {
    parts.push({
      inline_data: {
        mime_type: opts.audioMime || "audio/mpeg",
        data: arrayBufferToBase64(opts.audioBytes),
      },
    });
  } else if (opts.text) {
    parts.push({ text: `Submitted lead notes only (no audio):\n${opts.text}` });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, response_mime_type: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err.slice(0, 300)}`);
  }

  const json = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  let parsed: AIResult;
  try {
    parsed = JSON.parse(text) as AIResult;
  } catch {
    throw new Error("Gemini returned non-JSON response");
  }

  if (!["Qualified", "Disqualified", "Call Back"].includes(parsed.status)) {
    parsed.status = "Call Back";
  }
  parsed.coaching_points = Array.isArray(parsed.coaching_points) ? parsed.coaching_points : [];
  parsed.feedback = parsed.feedback || "";
  parsed.reasoning = parsed.reasoning || "";
  parsed.status_reason = parsed.status_reason || "";
  parsed.extracted = parsed.extracted || {};
  parsed.verification_checks = parsed.verification_checks || {
    ownership_confirmed: false,
    address_captured: false,
    motivation_clear: false,
    price_aligned: false,
    timeline_realistic: false,
  };

  // Hard-enforce: Qualified ⇒ ALL checks true.
  const c = parsed.verification_checks;
  const allPass =
    c.ownership_confirmed &&
    c.address_captured &&
    c.motivation_clear &&
    c.price_aligned &&
    c.timeline_realistic;
  if (parsed.status === "Qualified" && !allPass) {
    parsed.status = "Call Back";
    parsed.status_reason = "Downgraded: not all HMS verification checks passed.";
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────────
// POST — accepts JSON { leadId, audioUrl? } OR multipart FormData
// with { leadId, file? } (Edge-compatible File.arrayBuffer()).
// ─────────────────────────────────────────────────────────────
export async function POST(req: Request): Promise<Response> {
  try {
    let leadId = "";
    let audioUrl: string | undefined;
    let directAudio: ArrayBuffer | undefined;
    let directAudioMime: string | undefined;
    let directAudioSize: number | undefined;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      leadId = String(form.get("leadId") || "");
      const file = form.get("file");
      if (file && typeof file !== "string") {
        const f = file as File;
        directAudio = await f.arrayBuffer();
        directAudioMime = f.type || "audio/mpeg";
        directAudioSize = f.size;
      }
      const urlVal = form.get("audioUrl");
      if (urlVal) audioUrl = String(urlVal);
    } else {
      const body = await req.json().catch(() => ({}));
      leadId = body.leadId || "";
      audioUrl = body.audioUrl;
    }

    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sa = service();
    const { data: lead, error: leadErr } = await sa.from("leads").select("*").eq("id", leadId).single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // DUPLICATE
    if (lead.extracted_address) {
      const { data: dups } = await sa
        .from("leads").select("id")
        .eq("user_id", lead.user_id)
        .ilike("extracted_address", lead.extracted_address)
        .neq("id", lead.id).limit(1);
      if (dups && dups.length > 0) {
        await sa.from("leads").update({
          status: "Duplicate",
          rejection_reason: "Address already submitted in this workspace.",
          ai_processed_at: new Date().toISOString(),
        }).eq("id", lead.id);
        return new Response(JSON.stringify({ ok: true, status: "Duplicate" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // AUDIO PREP
    let audioDuration: number | null = null;
    let audioSize: number | null = directAudioSize ?? null;
    let audioBytes: ArrayBuffer | undefined = directAudio;
    let audioMime: string | undefined = directAudioMime;

    if (!audioBytes && (audioUrl || lead.call_recording_url)) {
      const url = audioUrl || lead.call_recording_url;
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          audioBytes = await resp.arrayBuffer();
          audioMime = resp.headers.get("content-type") || "audio/mpeg";
          audioSize = audioBytes.byteLength;
        }
      } catch { /* ignore */ }

      const { data: callUp } = await sa
        .from("call_uploads").select("file_size_bytes, duration_seconds")
        .eq("lead_id", lead.id).maybeSingle();
      if (callUp) {
        audioSize = callUp.file_size_bytes ?? audioSize;
        audioDuration = callUp.duration_seconds ?? null;
      }
    }

    if (audioBytes) {
      const tooShortBySize = audioSize !== null && audioSize < MIN_FILE_SIZE_BYTES;
      const tooShortByDur = audioDuration !== null && audioDuration < MIN_DURATION_SEC;
      if (tooShortBySize || tooShortByDur) {
        await sa.from("leads").update({
          status: "Disqualified",
          rejection_reason: `Audio too short to evaluate (${audioDuration ?? "size " + audioSize + "B"}).`,
          audio_duration_seconds: audioDuration,
          audio_size_bytes: audioSize,
          ai_processed_at: new Date().toISOString(),
        }).eq("id", lead.id);
        return new Response(JSON.stringify({ ok: true, status: "Disqualified", reason: "audio_too_short" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
    }

    let rules = "";
    if (lead.campaign_id) {
      const { data: c } = await sa.from("campaigns").select("rules").eq("id", lead.campaign_id).maybeSingle();
      rules = c?.rules || "";
    }

    const textFallback = `Address: ${lead.extracted_address || "n/a"}. Asking: ${lead.asking_price || "n/a"}. Agent: ${lead.agent_name || "n/a"}.`;

    const ai = await callGemini({
      audioBytes,
      audioMime,
      campaignRules: rules,
      text: audioBytes ? undefined : textFallback,
    });

    await sa.from("leads").update({
      status: ai.status,
      qualification_reason: ai.reasoning,
      ai_feedback: ai.feedback,
      ai_coaching_points: ai.coaching_points,
      ai_status_reason: ai.status_reason,
      ai_model: MODEL,
      ai_processed_at: new Date().toISOString(),
      audio_duration_seconds: audioDuration,
      audio_size_bytes: audioSize,
      bant_budget: ai.extracted.budget || null,
      bant_authority: ai.extracted.authority || null,
      bant_need: ai.extracted.need || null,
      bant_timeline: ai.extracted.timeline || null,
    }).eq("id", lead.id);

    if (lead.caller_id && ai.coaching_points.length) {
      const { data: caller } = await sa.from("cold_callers").select("aggregate_stats").eq("id", lead.caller_id).maybeSingle();
      const stats = (caller?.aggregate_stats as Record<string, unknown> | null) || {};
      const allPoints = (stats.coaching_points as string[] | undefined) || [];
      const totalAnalyzed = (stats.total_analyzed as number | undefined) || 0;
      const qualifiedCount = (stats.qualified_count as number | undefined) || 0;
      await sa.from("cold_callers").update({
        aggregate_stats: {
          ...stats,
          coaching_points: [...allPoints, ...ai.coaching_points].slice(-50),
          total_analyzed: totalAnalyzed + 1,
          qualified_count: qualifiedCount + (ai.status === "Qualified" ? 1 : 0),
          last_feedback: ai.feedback,
          last_status: ai.status,
        },
      }).eq("id", lead.caller_id);
    }

    return new Response(JSON.stringify({ ok: true, status: ai.status, ai }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
