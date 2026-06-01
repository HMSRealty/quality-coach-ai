// app/api/analyze/rerun/route.ts
// Edge-runtime compatible. Re-runs lead analysis via the canonical analyze route.

import { POST as analyzePOST } from "../route";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const leadId = body.leadId;
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Delegate to the canonical analyze route — it handles dedup, audio fetch,
    // Gemini call, and DB updates.
    const inner = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    return await analyzePOST(inner);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
