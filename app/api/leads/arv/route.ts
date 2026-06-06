// app/api/leads/arv/route.ts
// Compute ARV from a property + comparables on the server. Pure heuristic — no
// vendor secret leaves the server. Used by the Submit Lead form's auto-fetch.
//
//   POST { normalized: { sqft?, ... }, comparables: [{price,sqft,...}], condition?, zipMultiplier? }
//   -> { estimatedArv, confidence, pricePerSqft, compsUsed, breakdown }
import { calculateArv, type Condition } from "@/services/arv";
import type { Comparable } from "@/services/propertyDataProvider";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Body {
  normalized?: { sqft?: number };
  comparables?: Comparable[];
  condition?: Condition;
  zipMultiplier?: number;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json().catch(() => ({}))) as Body;
    const out = calculateArv({
      subjectSqft: b.normalized?.sqft,
      comparables: Array.isArray(b.comparables) ? b.comparables : [],
      condition: b.condition,
      zipMultiplier: b.zipMultiplier ?? 1.0,
    });
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
