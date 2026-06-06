// app/api/leads/arv/route.ts
// ARV pipeline. Strategy:
//   1) Live vendor call (ARVCast) using the property's city + street address.
//   2) Fallback to the comp-PPSF heuristic from services/arv.ts if the vendor
//      can't price it (or its key isn't configured).
// Keys are ENV-only — never hardcoded.
//
//   POST { normalized: { address?, sqft?, ... }, comparables?, condition?, zipMultiplier?, city? }
//   -> { estimatedArv, confidence, pricePerSqft?, compsUsed?, breakdown?, source }
import { calculateArv, type Condition } from "@/services/arv";
import type { Comparable } from "@/services/propertyDataProvider";
import { fetchArvCast, splitAddressForArvCast } from "@/services/arvCast";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Body {
  normalized?: { sqft?: number; address?: string };
  comparables?: Comparable[];
  condition?: Condition;
  zipMultiplier?: number;
  city?: string;          // optional override if the address string doesn't include it
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json().catch(() => ({}))) as Body;

    // ── STEP 1: try ARVCast first ──────────────────────────────────────────
    const fullAddr = b.normalized?.address || "";
    const split = splitAddressForArvCast(fullAddr, b.city);
    if (split) {
      try {
        const v = await fetchArvCast(split);
        if (v.arv && v.arv > 0) {
          return Response.json({
            estimatedArv: Math.round(v.arv),
            confidence: v.confidence,
            source: "arvcast",
            breakdown: { city: v.city, address: v.address },
          });
        }
      } catch (e) {
        // Surface the vendor error in the heuristic response so the caller can debug.
        console.warn("[arv] ARVCast failed, falling back to heuristic:", e);
      }
    }

    // ── STEP 2: comp-PPSF heuristic fallback ───────────────────────────────
    const out = calculateArv({
      subjectSqft: b.normalized?.sqft,
      comparables: Array.isArray(b.comparables) ? b.comparables : [],
      condition: b.condition,
      zipMultiplier: b.zipMultiplier ?? 1.0,
    });
    return Response.json({ ...out, source: "heuristic" });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
