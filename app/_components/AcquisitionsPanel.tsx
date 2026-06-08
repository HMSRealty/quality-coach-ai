"use client";

// Acquisitions & Deal Math Engine — Clean Enterprise (White / Sky / Emerald).
//   1. Retail-vs-Wholesale router badge
//   2. MAO calculator: (ARV * 0.70) - Rehab - Wholesale Fee  (money in green)
//   3. AI Handoff Dossier (sky top border, 3 bullets)
//   4. 1-click webhook export with morph-to-checkmark success animation
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  Calculator, FileText, Send, CheckCircle2, Loader2, AlertCircle,
  Handshake, Building2, Brain, HeartCrack, DollarSign, ArrowRight, ChevronDown, ChevronUp,
} from "lucide-react";

interface Comp { address: string; layout: string; sqft: number; status: string; value: number; ppsf: number; }
const numOf = (v: unknown) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };

// Reject obviously-fabricated / placeholder addresses (AI hallucinations).
const FAKE_ADDR = /anywhere|somewhere|\banother (rd|st|ave|dr)|nearby (ln|st|rd)|anytown|\bexample\b|placeholder|\bsample\b|\bfictional\b|\bunknown\b|^comparable\s*\d/i;
const isRealAddr = (a: string) => !!a && a.length > 6 && !FAKE_ADDR.test(a);

// Gemini's appraiser comps (preferred — include layout + status).
function fromAiComps(raw: Array<Record<string, unknown>> | null | undefined): Comp[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => {
    const value = numOf(c.value);
    const sqft = numOf(c.sqft);
    return {
      address: String(c.address ?? `Comparable ${i + 1}`),
      layout: String(c.layout ?? "—"),
      sqft, status: String(c.status ?? "Sold"), value,
      ppsf: value && sqft ? Math.round(value / sqft) : 0,
    };
  }).filter((c) => c.value > 0 || c.sqft > 0);
}
// Raw provider comps (fallback when the AI didn't return its own).
function fromRawComps(raw: Array<Record<string, unknown>> | null | undefined): Comp[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => {
    const value = numOf(c.price ?? c.soldPrice ?? c.lastSoldPrice ?? c.amount ?? c.zestimate);
    const sqft = numOf(c.sqft ?? c.livingArea ?? c.area ?? c.finishedSqFt);
    const beds = numOf(c.beds ?? c.bedrooms); const baths = numOf(c.baths ?? c.bathrooms);
    return {
      address: String(c.address ?? c.streetAddress ?? c.formattedAddress ?? `Comparable ${i + 1}`),
      layout: beds || baths ? `${beds || "?"} Bed, ${baths || "?"} Bath` : "—",
      sqft, status: "Sold", value, ppsf: value && sqft ? Math.round(value / sqft) : 0,
    };
  }).filter((c) => c.value > 0 || c.sqft > 0);
}

const SPRING = { type: "spring", stiffness: 460, damping: 32, mass: 0.7 } as const;
const SKY = "#0EA5E9";
const SKY_600 = "#0284C7";
const MONEY = "#059669";
const AMBER = "#D97706";
const RED = "#DC2626";
const money = (n: number) => `${n < 0 ? "-$" : "$"}${Math.round(Math.abs(n)).toLocaleString()}`;

type Verdict = "Works" | "Marginal" | "Pass";
const vColor = (v: Verdict) => (v === "Works" ? MONEY : v === "Marginal" ? AMBER : RED);
const vRank = (v: Verdict) => (v === "Works" ? 2 : v === "Marginal" ? 1 : 0);

// Evaluate the three exit strategies for the deal across the ARV price band.
// Standard investor math; deliberately conservative on costs.
function evalStrategies(opts: { arvLow: number; arvHigh: number; arvMid: number; rehab: number; purchase: number; rent: number }) {
  const { arvLow, arvHigh, arvMid, rehab, purchase, rent } = opts;
  const dbg = (loan: number) => loan * 0.0067;            // ~7% 30-yr P&I per $ of loan / month
  const noi = rent * 0.6;                                  // rent minus ~40% (tax/ins/maint/vac/mgmt)

  // FLIP — profit = ARV − purchase − rehab − selling(8%) − holding(3%)
  const flipAt = (arv: number) => arv - purchase - rehab - arv * 0.08 - arv * 0.03;
  const flipLow = flipAt(arvLow || arvMid), flipHigh = flipAt(arvHigh || arvMid), flipMid = flipAt(arvMid);
  const flipV: Verdict = flipMid >= 30000 ? "Works" : flipMid >= 12000 ? "Marginal" : "Pass";

  // BRRRR — refi 75% ARV; cash left in = (purchase+rehab) − refi; cashflow after refi debt
  const refi = arvMid * 0.75;
  const cashLeft = purchase + rehab - refi;
  const brrrrCf = noi - dbg(refi);
  const brrrrV: Verdict = cashLeft <= 10000 && brrrrCf > 100 ? "Works"
    : cashLeft <= 30000 && brrrrCf >= 0 ? "Marginal" : "Pass";

  // HOLD — buy at purchase, 20% down conventional; cashflow + 1% rule
  const holdCf = noi - dbg(purchase * 0.8);
  const onePct = rent > 0 && rent >= purchase * 0.01;
  const holdV: Verdict = holdCf >= 200 && onePct ? "Works" : holdCf >= 0 ? "Marginal" : "Pass";

  const ranked = [
    { key: "Flip", v: flipV, score: flipMid },
    { key: "BRRRR", v: brrrrV, score: brrrrCf * 1000 - cashLeft },
    { key: "Hold", v: holdV, score: holdCf * 1000 },
  ].sort((a, b) => vRank(b.v) - vRank(a.v) || b.score - a.score);
  const best = ranked[0].v === "Pass" ? "None" : ranked[0].key;

  return {
    flip: { v: flipV, low: flipLow, high: flipHigh, mid: flipMid },
    brrrr: { v: brrrrV, cashLeft, cashflow: brrrrCf },
    hold: { v: holdV, cashflow: holdCf, onePct },
    rent, best,
  };
}

export function AcquisitionsPanel({
  leadId, address, ownerName, arv, arvLow, arvHigh, zestimate, arvReasoning, arvNarrative, rent, compsSource, aiComps, comparables, defaultRehab, askingPrice,
  personality, painPoint, bottomLine,
}: {
  leadId: string;
  address: string | null;
  ownerName: string | null;
  arv: number;              // AI-computed ARV (point estimate / midpoint)
  arvLow?: number | null;   // range — conservative
  arvHigh?: number | null;  // range — optimistic
  zestimate?: number | null; // Zillow Zestimate — market-value reference only
  arvReasoning?: string | null;
  arvNarrative?: string | null;
  rent?: number | null;       // AI-estimated market rent (BRRRR/Hold)
  compsSource?: string | null; // where comps came from: provider | searched | mixed | none
  aiComps?: Array<Record<string, unknown>> | null;          // Gemini's appraiser comps
  comparables?: Array<Record<string, unknown>> | null;      // raw provider comps (fallback)
  defaultRehab: number;
  askingPrice: number | null;
  personality: string | null;
  painPoint: string | null;
  bottomLine: string | null;
}) {
  const [rehab, setRehab] = useState(defaultRehab || 0);
  const [fee, setFee] = useState(10000);
  const [showComps, setShowComps] = useState(true);
  // Prefer REAL provider comps; only use the AI's comps if the provider returned
  // none — and in all cases drop fabricated placeholder addresses.
  const rawList = fromRawComps(comparables).filter(c => isRealAddr(c.address));
  const aiList = fromAiComps(aiComps).filter(c => isRealAddr(c.address));
  const comps = rawList.length ? rawList : aiList;
  const hasRange = !!(arvLow && arvHigh && arvHigh > arvLow);
  const arvDisplay = hasRange ? `${money(arvLow!)} – ${money(arvHigh!)}` : (arv ? money(arv) : "—");

  const mao = useMemo(() => Math.max(0, arv * 0.70 - rehab - fee), [arv, rehab, fee]);

  // Exit-strategy analysis (Flip vs BRRRR vs Hold) across the ARV price band.
  const arvMid = arv || (arvLow && arvHigh ? Math.round((arvLow + arvHigh) / 2) : 0);
  const purchase = askingPrice || mao;
  const strat = useMemo(
    () => evalStrategies({ arvLow: arvLow || arvMid, arvHigh: arvHigh || arvMid, arvMid, rehab, purchase, rent: rent || 0 }),
    [arvLow, arvHigh, arvMid, rehab, purchase, rent],
  );

  // Router: a wholesale/cash deal needs the asking price to sit at/below MAO (room
  // to assign). If the seller wants near-retail, route to MLS.
  const route = useMemo(() => {
    if (!askingPrice || !arv) return "wholesale" as const;
    if (askingPrice <= mao * 1.08) return "wholesale" as const;
    if (askingPrice >= arv * 0.90) return "retail" as const;
    return "wholesale" as const;
  }, [askingPrice, arv, mao]);

  const generateOfferPDF = () => {
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cash Offer — ${address || "Property"}</title>
      <style>
        *{font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#0F172A;box-sizing:border-box}
        body{max-width:720px;margin:40px auto;padding:0 32px}
        .bar{height:6px;background:linear-gradient(135deg,#0EA5E9,#0284C7);border-radius:6px}
        h1{font-size:26px;margin:24px 0 4px} .muted{color:#64748B;font-size:13px}
        .card{border:1px solid #E2E8F0;border-radius:14px;padding:20px;margin-top:20px}
        .row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #F1F5F9;font-size:14px}
        .row:last-child{border-bottom:none}
        .mao{font-size:30px;font-weight:900;color:#059669}
        .sky{color:#0284C7;font-weight:800}
      </style></head><body>
      <div class="bar"></div>
      <h1>Cash Offer Summary</h1>
      <p class="muted">${today} · Prepared for ${ownerName || "Property Owner"}</p>
      <div class="card">
        <div class="row"><span>Property</span><strong>${address || "—"}</strong></div>
        ${zestimate ? `<div class="row"><span>Zestimate (Zillow)</span><strong>${money(zestimate)}</strong></div>` : ""}
        <div class="row"><span>After-Repair Value (AI estimate)</span><strong>${hasRange ? `${money(arvLow!)} – ${money(arvHigh!)}` : money(arv)}</strong></div>
        <div class="row"><span>Estimated Rehab</span><strong>${money(rehab)}</strong></div>
        <div class="row"><span>Wholesale / Assignment Fee</span><strong>${money(fee)}</strong></div>
        <div class="row"><span>Formula</span><span class="muted">(ARV × 70%) − Rehab − Fee</span></div>
        <div class="row"><span class="sky">Maximum Allowable Offer</span><span class="mao">${money(mao)}</span></div>
      </div>
      ${(arvNarrative || arvReasoning) ? `<p class="muted" style="margin-top:14px"><strong style="color:#0284C7">ARV basis:</strong> ${arvNarrative || arvReasoning}</p>` : ""}
      ${comps.length ? `<div class="card">
        <div style="font-weight:800;margin-bottom:10px">Comparable Properties (${comps.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr style="color:#64748B;text-align:left"><th style="text-align:left;padding:6px 0">Address</th><th style="text-align:left">Layout</th><th style="text-align:right">Sq. Ft.</th><th style="text-align:left;padding-left:10px">Status</th><th style="text-align:right">Value</th></tr>
          ${comps.map(c => `<tr style="border-top:1px solid #F1F5F9"><td style="padding:6px 0">${c.address}</td><td>${c.layout}</td><td style="text-align:right">${c.sqft ? c.sqft.toLocaleString() : "—"}</td><td style="padding-left:10px">${c.status}</td><td style="text-align:right;color:#059669;font-weight:700">${c.value ? money(c.value) : "—"}</td></tr>`).join("")}
        </table>
      </div>` : ""}
      <p class="muted" style="margin-top:18px">This is a preliminary, non-binding cash offer estimate generated by RealTrack. Final offer subject to inspection and title review.</p>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to generate the offer PDF."); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 350);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── MAO Calculator (the money UI) ── */}
      <div style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 18, boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border-1)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Calculator size={16} color="#fff" />
            </span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Deal Math · MAO Calculator</p>
              <p style={{ fontSize: 11, color: "var(--text-3)" }}>Maximum Allowable Offer at the 70% rule</p>
            </div>
          </div>
          <RouterBadge route={route} />
        </div>

        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,0.9fr)", gap: 20 }} className="ci-grid">
          {/* Inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ReadRow label="Zestimate (Zillow)" value={zestimate ? money(zestimate) : "—"} sub="Market-value reference" />
            <ReadRow label="AI-Estimated ARV" value={arvDisplay} sub={hasRange ? `Midpoint ${arv ? money(arv) : "—"} · used for MAO` : (comps.length ? `From ${comps.length} comparable sale${comps.length === 1 ? "" : "s"}` : "Computed from comparable sales")} accent={SKY_600} />
            <NumberRow label="AI-Estimated Rehab Cost" value={rehab} onChange={setRehab} />
            <NumberRow label="Wholesale / Assignment Fee" value={fee} onChange={setFee} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-3)", paddingTop: 4 }}>
              <span style={{ fontWeight: 700, color: SKY_600 }}>(ARV × 0.70)</span> − Rehab − Fee
            </div>
          </div>

          {/* MAO result */}
          <div style={{
            borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", justifyContent: "center",
            background: "var(--money-soft)", border: "1px solid color-mix(in srgb, #059669 30%, transparent)",
          }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: MONEY, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <DollarSign size={12} /> Maximum Allowable Offer
            </p>
            <motion.p key={mao} initial={{ scale: 0.92, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING}
              style={{ fontSize: 38, fontWeight: 900, color: MONEY, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "6px 0 2px" }}>
              {money(mao)}
            </motion.p>
            {askingPrice ? (
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                Seller asking <strong style={{ color: "var(--text-1)" }}>{money(askingPrice)}</strong>
                {askingPrice <= mao ? " · spread in your favor" : ` · ${money(askingPrice - mao)} over MAO`}
              </p>
            ) : null}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={generateOfferPDF}
              style={{
                marginTop: 14, padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                background: "var(--grad-primary)", color: "#fff", fontSize: 12.5, fontWeight: 800,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                boxShadow: "0 8px 20px color-mix(in srgb, #0EA5E9 35%, transparent)",
              }}>
              <FileText size={14} /> Generate Offer PDF
            </motion.button>
          </div>
        </div>

        {/* ── ARV REPORT: range + narrative + comparable properties ── */}
        {(arvNarrative || arvReasoning || comps.length > 0) && (
          <div style={{ borderTop: "1px solid var(--border-1)", padding: "16px 20px" }}>
            {/* Estimated ARV range headline */}
            <p style={{ fontSize: 15, fontWeight: 900, color: "#000", marginBottom: 6 }}>
              Estimated ARV: <span style={{ color: SKY_600 }}>{arvDisplay}</span>
            </p>
            {(arvNarrative || arvReasoning) && (
              <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.65, marginBottom: comps.length ? 16 : 0 }}>
                {arvNarrative || arvReasoning}
              </p>
            )}

            {comps.length === 0 && arvMid > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 7 }}>
                <Building2 size={14} color="var(--text-3)" />
                No verified comparable sales were returned for this address — ARV estimated from the area&apos;s price-per-square-foot.
              </p>
            )}

            {comps.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <button onClick={() => setShowComps(v => !v)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", color: "#000", fontSize: 13, fontWeight: 800, padding: 0 }}>
                    <Building2 size={14} color={SKY_600} /> Comparable Properties ({comps.length})
                    {showComps ? <ChevronUp size={15} color="var(--text-3)" /> : <ChevronDown size={15} color="var(--text-3)" />}
                  </button>
                  {(() => {
                    const src = (compsSource || "").toLowerCase();
                    const cfg = src === "searched" ? { t: "🔍 Live web search", c: SKY_600 }
                      : src === "mixed" ? { t: "🔍 Search + Zillow", c: SKY_600 }
                      : src === "provider" ? { t: "Zillow data", c: "var(--text-3)" } : null;
                    return cfg ? <span style={{ fontSize: 10.5, fontWeight: 800, color: cfg.c, background: `color-mix(in srgb, ${cfg.c} 12%, transparent)`, padding: "3px 9px", borderRadius: 999 }}>{cfg.t}</span> : null;
                  })()}
                </div>

                <AnimatePresence initial={false}>
                  {showComps && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING}
                      style={{ overflow: "hidden" }}>
                      <div style={{ overflowX: "auto", marginTop: 12, borderRadius: 12, border: "1px solid var(--border-2)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: 12.5 }}>
                          <thead>
                            <tr style={{ background: "#F8FAFC" }}>
                              {["Address", "Layout", "Sq. Ft.", "Status", "Value", "$/sqft"].map((h, i) => (
                                <th key={h} style={{ textAlign: i >= 4 ? "right" : "left", padding: "9px 12px", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {comps.map((c, i) => {
                              const st = c.status.toLowerCase();
                              const stColor = st.includes("active") ? "#0284C7" : st.includes("estimate") ? "#92400E" : MONEY;
                              return (
                                <tr key={i} style={{ borderTop: "1px solid var(--border-1)" }}>
                                  <td style={{ padding: "9px 12px", color: "#000", fontWeight: 700, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.address}</td>
                                  <td style={{ padding: "9px 12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{c.layout}</td>
                                  <td style={{ padding: "9px 12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{c.sqft ? `${c.sqft.toLocaleString()} sqft` : "—"}</td>
                                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                                    <span style={{ fontSize: 10.5, fontWeight: 800, color: stColor, background: `color-mix(in srgb, ${stColor} 12%, transparent)`, padding: "2px 8px", borderRadius: 999 }}>{c.status}</span>
                                  </td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", color: "#000", fontWeight: 800, whiteSpace: "nowrap" }}>{c.value ? money(c.value) : "—"}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", color: SKY_600, fontWeight: 700, whiteSpace: "nowrap" }}>{c.ppsf ? `$${c.ppsf}` : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {(() => {
                            const ppsfs = comps.map(c => c.ppsf).filter((n): n is number => !!n).sort((a, b) => a - b);
                            const median = ppsfs.length ? ppsfs[Math.floor(ppsfs.length / 2)] : 0;
                            if (!median) return null;
                            return (
                              <tfoot>
                                <tr style={{ borderTop: "2px solid var(--border-2)", background: "#F8FAFC" }}>
                                  <td style={{ padding: "9px 12px", fontWeight: 800, color: "#000" }}>Median $/sqft</td>
                                  <td colSpan={4} />
                                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 900, color: SKY_600 }}>${median}</td>
                                </tr>
                              </tfoot>
                            );
                          })()}
                        </table>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
                        Recent sales, active listings &amp; market estimates for similar-footprint homes nearby. The AI derives the ARV range from the $/sqft band × the subject&apos;s square footage.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── EXIT STRATEGY: Flip vs BRRRR vs Hold ── */}
      {arvMid > 0 && (
        <div style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 18, padding: 22, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "color-mix(in srgb, #0EA5E9 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Calculator size={15} color={SKY_600} />
              </span>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#000" }}>Does this deal work? — Flip vs BRRRR vs Hold</p>
            </div>
            {strat.best !== "None" && (
              <span style={{ fontSize: 11.5, fontWeight: 800, color: MONEY, background: "color-mix(in srgb, #059669 12%, transparent)", padding: "4px 11px", borderRadius: 999 }}>
                Best fit: {strat.best}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 14 }}>
            At purchase <strong style={{ color: "var(--text-1)" }}>{money(purchase)}</strong> · rehab {money(rehab)} · ARV {arvDisplay}{rent ? ` · est. rent ${money(rent)}/mo` : ""}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }} className="ci-grid">
            <StrategyCard title="Fix & Flip" verdict={strat.flip.v}
              metric={hasRange ? `${money(strat.flip.low)} – ${money(strat.flip.high)}` : money(strat.flip.mid)}
              metricLabel="Net profit (sell)"
              note={`After 8% selling + 3% holding on ARV. Midpoint ${money(strat.flip.mid)}.`} />
            <StrategyCard title="BRRRR" verdict={strat.brrrr.v}
              metric={strat.brrrr.cashLeft <= 0 ? `All out +${money(-strat.brrrr.cashLeft)}` : `${money(strat.brrrr.cashLeft)} left in`}
              metricLabel="Capital after 75% refi"
              note={rent ? `Cash flow ${money(strat.brrrr.cashflow)}/mo post-refi.` : "Add a rent estimate for cash-flow check."} />
            <StrategyCard title="Buy & Hold" verdict={strat.hold.v}
              metric={rent ? `${money(strat.hold.cashflow)}/mo` : "—"}
              metricLabel="Cash flow (20% down)"
              note={rent ? `${strat.hold.onePct ? "Meets" : "Below"} the 1% rule (rent vs price).` : "Add a rent estimate to evaluate."} />
          </div>
          <p style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 12 }}>
            Estimates only — assumes ~7% financing, conventional terms, and standard cost ratios. Verify rents, taxes, and insurance before committing.
          </p>
        </div>
      )}

      {/* ── AI Handoff Dossier ── */}
      {(personality || painPoint || bottomLine) && (
        <div style={{ background: "#fff", border: "1px solid var(--border-2)", borderTop: `3px solid ${SKY}`, borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "color-mix(in srgb, #0EA5E9 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={15} color={SKY_600} />
            </span>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>AI Handoff Dossier</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DossierRow icon={Brain} label="Personality" value={personality} />
            <DossierRow icon={HeartCrack} label="Pain Point" value={painPoint} />
            <DossierRow icon={DollarSign} label="Bottom-Line Price" value={bottomLine} money />
          </div>
        </div>
      )}

      {/* ── 1-Click Webhook Export ── */}
      <WebhookExport leadId={leadId} />
    </div>
  );
}

function RouterBadge({ route }: { route: "wholesale" | "retail" }) {
  const wholesale = route === "wholesale";
  const c = wholesale ? MONEY : SKY_600;
  const Icon = wholesale ? Handshake : Building2;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 999,
      background: `color-mix(in srgb, ${c} 12%, transparent)`, color: c,
      border: `1px solid color-mix(in srgb, ${c} 35%, transparent)`, fontSize: 12, fontWeight: 800,
    }}>
      <Icon size={13} /> {wholesale ? "Wholesale / Cash Deal" : "Retail / MLS"}
    </span>
  );
}

function StrategyCard({ title, verdict, metric, metricLabel, note }: { title: string; verdict: Verdict; metric: string; metricLabel: string; note: string }) {
  const c = vColor(verdict);
  return (
    <div style={{ borderRadius: 14, padding: 16, background: "#fff", border: `1px solid ${verdict === "Works" ? "color-mix(in srgb, #059669 35%, transparent)" : "var(--border-2)"}`, borderTop: `3px solid ${c}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: "#000" }}>{title}</p>
        <span style={{ fontSize: 11, fontWeight: 900, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, padding: "3px 10px", borderRadius: 999 }}>{verdict}</span>
      </div>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>{metricLabel}</p>
      <p style={{ fontSize: 20, fontWeight: 900, color: c, lineHeight: 1.1, margin: "2px 0 6px" }}>{metric}</p>
      <p style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>{note}</p>
    </div>
  );
}

function ReadRow({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 10, background: "var(--surface-3)", border: "1px solid var(--border-1)" }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{label}</span>
        {sub && <p style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
      </div>
      <span style={{ fontSize: 15, fontWeight: 800, color: accent || "var(--text-1)", flexShrink: 0 }}>{value}</span>
    </div>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderRadius: 10, background: "#fff", border: "1px solid var(--border-2)" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{label}</span>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-3)" }}>$</span>
        <input type="number" min={0} step={500} value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          style={{ width: 96, textAlign: "right", padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--surface-3)", color: "var(--text-1)", fontSize: 14, fontWeight: 800, outline: "none" }} />
      </div>
    </div>
  );
}

function DossierRow({ icon: Icon, label, value, money: isMoney }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string | null; money?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <Icon size={13} color={isMoney ? MONEY : SKY_600} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>{label}</p>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: isMoney ? 800 : 500, color: isMoney ? MONEY : "#000" }}>
          {value || "Not captured on the call."}
        </p>
      </div>
    </div>
  );
}

type ExportState = "idle" | "sending" | "done" | "error";
function WebhookExport({ leadId }: { leadId: string }) {
  const [state, setState] = useState<ExportState>("idle");
  const [err, setErr] = useState("");

  const fire = async () => {
    if (state === "sending" || state === "done") return;
    setState("sending");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/leads/${leadId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Webhook failed");
      setState("done");
      setTimeout(() => setState("idle"), 3200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setState("error");
      setTimeout(() => setState("idle"), 3500);
    }
  };

  const done = state === "done";
  return (
    <motion.button
      onClick={fire}
      disabled={state === "sending"}
      animate={{ backgroundColor: done ? MONEY : state === "error" ? "#DC2626" : SKY }}
      transition={SPRING}
      whileHover={state === "idle" ? { scale: 1.01 } : undefined}
      whileTap={state === "idle" ? { scale: 0.99 } : undefined}
      style={{
        position: "relative", width: "100%", padding: "14px 18px", borderRadius: 12, border: "none",
        cursor: state === "sending" ? "wait" : "pointer", color: "#fff", fontSize: 14, fontWeight: 800,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
        boxShadow: `0 10px 26px color-mix(in srgb, ${done ? MONEY : SKY} 40%, transparent)`,
        overflow: "hidden",
      }}>
      <AnimatePresence mode="wait" initial={false}>
        {state === "idle" && (
          <motion.span key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <Send size={16} /> Export to Acquisitions CRM <ArrowRight size={15} />
          </motion.span>
        )}
        {state === "sending" && (
          <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <Loader2 size={16} className="animate-spin" /> Routing JSON…
          </motion.span>
        )}
        {state === "done" && (
          <motion.span key="done" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...SPRING, delay: 0.05 }}>
              <CheckCircle2 size={18} />
            </motion.span>
            Routed to CRM
          </motion.span>
        )}
        {state === "error" && (
          <motion.span key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <AlertCircle size={16} /> {err || "Export failed"}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
