// app/api/agents/scorecard/route.ts
// Compute (or fetch a cached) Agent Scorecard. Grades an agent out of 100 based
// on their LAST 90 days of leads: AI verdict mix, AI coaching themes, conversion,
// objection breakdown. Single Gemini call. Caches into agent_scorecards.
//
//   POST { agentName }   -> { grade, rationale, strengths[], weaknesses[], leadsCounted }
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
function geminiKey() {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!k) throw new Error("Missing GEMINI_API_KEY");
  return k;
}

interface Body { agentName?: string; force?: boolean }

export async function POST(req: Request): Promise<Response> {
  try {
    const { agentName, force } = (await req.json().catch(() => ({}))) as Body;
    if (!agentName) return Response.json({ ok: false, error: "agentName required" }, { status: 400 });

    const sb = service();
    // Cache: return if updated in the last 12 hours unless force=true.
    if (!force) {
      const { data: cache } = await sb.from("agent_scorecards")
        .select("grade, rationale, strengths, weaknesses, leads_counted, updated_at")
        .eq("agent_name", agentName).maybeSingle();
      if (cache && Date.now() - new Date(cache.updated_at as string).getTime() < 12 * 60 * 60 * 1000) {
        return Response.json({ ok: true, ...cache, cached: true });
      }
    }

    // Pull the last 90 days of decided leads for this agent.
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: leads } = await sb.from("leads")
      .select("id, status, qualification_reason, ai_feedback, ai_coaching_points, metadata, organization_id, created_at")
      .eq("agent_name", agentName)
      .gte("created_at", since)
      .neq("status", "Processing")
      .order("created_at", { ascending: false })
      .limit(60);

    const sample = (leads || []).slice(0, 30); // cap input size
    if (sample.length === 0) {
      return Response.json({ ok: true, grade: 0, rationale: "No leads in the last 90 days.", strengths: [], weaknesses: [], leadsCounted: 0 });
    }
    const orgId = (sample[0] as { organization_id?: string }).organization_id ?? null;

    // Build a compact JSON the model can reason over without re-listening to audio.
    const compact = sample.map((l) => {
      const md = (l.metadata || {}) as Record<string, unknown>;
      return {
        status: l.status,
        objection: md.primary_objection ?? null,
        compliance_passed: md.compliance_passed === true,
        category: md.lead_category ?? null,
        reason: l.qualification_reason,
        coaching: Array.isArray(l.ai_coaching_points) ? l.ai_coaching_points.slice(0, 3) : [],
        feedback: typeof l.ai_feedback === "string" ? l.ai_feedback.slice(0, 360) : null,
      };
    });

    const counts = compact.reduce<Record<string, number>>((acc, l) => {
      const s = (l.status || "").toString(); acc[s] = (acc[s] || 0) + 1; return acc;
    }, {});

    const system = `You are an elite cold-calling sales coach grading ONE agent's performance.
Score 0-100 (100 = world-class closer). Weight: motivation discovery, objection handling, compliance,
discovery completeness, control of call, time-to-asking-price. NOT call count.
Return STRICT JSON: { grade:number, rationale:string (≤350 chars), strengths:string[] (≤4), weaknesses:string[] (≤4) }`;
    const user = `AGENT: ${agentName}\nLEADS ANALYZED: ${compact.length}\nVERDICT MIX: ${JSON.stringify(counts)}\n\nPER-LEAD SAMPLE (most recent first):\n${JSON.stringify(compact, null, 2)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey()}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              grade:      { type: "NUMBER" },
              rationale:  { type: "STRING" },
              strengths:  { type: "ARRAY", items: { type: "STRING" } },
              weaknesses: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["grade","rationale","strengths","weaknesses"],
          },
        },
      }),
    });
    const text = await r.text();
    if (!r.ok) return Response.json({ ok: false, error: `Gemini ${r.status}: ${text.slice(0, 300)}` }, { status: 500 });
    const parsed = JSON.parse(text);
    const json = JSON.parse(parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");

    const grade = Math.max(0, Math.min(100, Math.round(Number(json.grade) || 0)));

    // Cache.
    await sb.from("agent_scorecards").upsert({
      agent_name: agentName,
      organization_id: orgId,
      grade,
      rationale: String(json.rationale || ""),
      strengths: Array.isArray(json.strengths) ? json.strengths : [],
      weaknesses: Array.isArray(json.weaknesses) ? json.weaknesses : [],
      leads_counted: compact.length,
      updated_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      grade,
      rationale: json.rationale || "",
      strengths: json.strengths || [],
      weaknesses: json.weaknesses || [],
      leadsCounted: compact.length,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
