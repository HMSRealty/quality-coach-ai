// services/arv.ts
// ---------------------------------------------------------------------------
// ARV (After-Repair Value) heuristic. Pure & deterministic — no network, no DB.
// Feed it comparables (from services/propertyDataProvider) + subject details.
//
// Model (industry-standard "comp PPSF" approach):
//   1. price-per-sqft (PPSF) of each comparable
//   2. trimmed mean PPSF  (drop the high/low outlier to resist bad comps)
//   3. base = trimmedPPSF * subjectSqft
//   4. ARV  = base * conditionMultiplier * zipMultiplier
//   5. confidence ∝ (#comps) and (tightness of PPSF spread)
// This is a documented heuristic, NOT an appraisal. Swap in a real AVM later
// behind the same signature.
// ---------------------------------------------------------------------------

import type { Comparable } from "./propertyDataProvider";

export type Condition = "distressed" | "poor" | "fair" | "good" | "excellent";

// Subject condition vs. the (renovated) comps. A distressed home is worth less
// than the comp PPSF implies; an excellent one a bit more.
const CONDITION_MULTIPLIER: Record<Condition, number> = {
  distressed: 0.82,
  poor:       0.90,
  fair:       1.00,
  good:       1.08,
  excellent:  1.15,
};

export interface ArvInput {
  subjectSqft?: number;
  comparables: Comparable[];
  condition?: Condition;     // default "fair"
  zipMultiplier?: number;    // local-market hotness, default 1.0 (from a lookup table)
}

export interface ArvResult {
  estimatedArv: number | null;
  confidence: number;        // 0..1
  pricePerSqft: number | null;
  compsUsed: number;
  breakdown: Record<string, number>;
}

// ----------------------------------------------------------------- stats
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function trimmedMean(xs: number[]): number {
  if (xs.length <= 2) return mean(xs);
  const sorted = [...xs].sort((a, b) => a - b).slice(1, -1); // drop min & max
  return mean(sorted);
}
function coefficientOfVariation(xs: number[]): number {
  if (xs.length < 2) return 1;
  const m = mean(xs);
  if (m === 0) return 1;
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance) / m; // 0 = identical, higher = noisier
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const emptyResult = (): ArvResult => ({
  estimatedArv: null, confidence: 0, pricePerSqft: null, compsUsed: 0, breakdown: {},
});

// ------------------------------------------------------------- main entry
export function calculateArv(input: ArvInput): ArvResult {
  const condition = input.condition ?? "fair";
  const zip = input.zipMultiplier ?? 1.0;
  const cMult = CONDITION_MULTIPLIER[condition];

  const usable = input.comparables.filter((c) => c.price > 0 && (c.sqft ?? 0) > 0);

  // Fallback path: no per-sqft data → average raw comp prices, low confidence.
  if (usable.length === 0 || !input.subjectSqft) {
    const prices = input.comparables.map((c) => c.price).filter((p) => p > 0);
    if (prices.length === 0) return emptyResult();
    const avg = mean(prices);
    return {
      estimatedArv: Math.round(avg * cMult * zip),
      confidence: 0.3,
      pricePerSqft: null,
      compsUsed: prices.length,
      breakdown: { rawAvg: Math.round(avg), condition: cMult, zip },
    };
  }

  const ppsfArr = usable.map((c) => c.price / (c.sqft as number));
  const ppsf = trimmedMean(ppsfArr);
  const base = ppsf * input.subjectSqft;
  const estimatedArv = Math.round(base * cMult * zip);

  // Confidence: weighted blend of comp count and price-per-sqft tightness.
  const countScore = Math.min(usable.length / 6, 1);              // 6+ comps → full
  const spreadScore = Math.max(0, 1 - coefficientOfVariation(ppsfArr)); // tight → 1
  const confidence = Math.min(0.2 + 0.5 * countScore + 0.3 * spreadScore, 0.95);

  return {
    estimatedArv,
    confidence: round2(confidence),
    pricePerSqft: round2(ppsf),
    compsUsed: usable.length,
    breakdown: {
      ppsf: round2(ppsf),
      subjectSqft: input.subjectSqft,
      condition: cMult,
      zip,
      base: Math.round(base),
    },
  };
}
