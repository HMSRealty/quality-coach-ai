"use client";

// Acquisitions & Deal Math Engine — Manual ARV + Comps table.
// Acquisition runs the ARV manually: enter comps, set ARV, get MAO.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  Calculator, FileText, Send, CheckCircle2, Loader2, AlertCircle,
  Handshake, Building2, Brain, HeartCrack, DollarSign, ArrowRight,
  Plus, Trash2, Search, ExternalLink,
} from "lucide-react";

interface ManualComp { address: string; layout: string; sqft: string; status: string; value: string; }
const numOf = (v: unknown) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };

const SPRING = { type: "spring", stiffness: 460, damping: 32, mass: 0.7 } as const;
const SKY = "#3B82F6";
const SKY_600 = "#2563EB";
const MONEY = "#2563EB";
const AMBER = "#D97706";
const RED = "#DC2626";
const money = (n: number) => `${n < 0 ? "-$" : "$"}${Math.round(Math.abs(n)).toLocaleString()}`;

type Verdict = "Works" | "Marginal" | "Pass";
const vColor = (v: Verdict) => (v === "Works" ? MONEY : v === "Marginal" ? AMBER : RED);
const vRank = (v: Verdict) => (v === "Works" ? 2 : v === "Marginal" ? 1 : 0);

function evalStrategies(opts: { arvLow: number; arvHigh: number; arvMid: number; rehab: number; purchase: number; rent: number }) {
  const { arvLow, arvHigh, arvMid, rehab, purchase, rent } = opts;
  const dbg = (loan: number) => loan * 0.0067;
  const noi = rent * 0.6;

  const flipAt = (arv: number) => arv - purchase - rehab - arv * 0.08 - arv * 0.03;
  const flipLow = flipAt(arvLow || arvMid), flipHigh = flipAt(arvHigh || arvMid), flipMid = flipAt(arvMid);
  const flipV: Verdict = flipMid >= 30000 ? "Works" : flipMid >= 12000 ? "Marginal" : "Pass";

  const refi = arvMid * 0.75;
  const cashLeft = purchase + rehab - refi;
  const brrrrCf = noi - dbg(refi);
  const brrrrV: Verdict = cashLeft <= 10000 && brrrrCf > 100 ? "Works"
    : cashLeft <= 30000 && brrrrCf >= 0 ? "Marginal" : "Pass";

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

const emptyComp = (): ManualComp => ({ address: "", layout: "", sqft: "", status: "Sold", value: "" });

const INP: React.CSSProperties = {
  width: "100%", padding: "6px 9px", borderRadius: 8,
  border: "1px solid var(--border-2)", background: "#0A0A0E",
  color: "#F4F4FF", fontSize: 12.5, outline: "none",
};

export function AcquisitionsPanel({
  leadId, address, ownerName, zestimate, rent, defaultRehab, askingPrice,
  personality, painPoint, bottomLine,
}: {
  leadId: string;
  address: string | null;
  ownerName: string | null;
  zestimate?: number | null;
  rent?: number | null;
  defaultRehab: number;
  askingPrice: number | null;
  personality: string | null;
  painPoint: string | null;
  bottomLine: string | null;
}) {
  const [arv, setArv] = useState(0);
  const [rehab, setRehab] = useState(defaultRehab || 0);
  const [fee, setFee] = useState(10000);
  const [comps, setComps] = useState<ManualComp[]>([emptyComp()]);
  const [fetchingComps, setFetchingComps] = useState(false);
  const [compsErr, setCompsErr] = useState("");

  const mao = useMemo(() => Math.max(0, arv * 0.70 - rehab - fee), [arv, rehab, fee]);
  const purchase = askingPrice || mao;

  const strat = useMemo(
    () => evalStrategies({ arvLow: arv, arvHigh: arv, arvMid: arv, rehab, purchase, rent: rent || 0 }),
    [arv, rehab, purchase, rent],
  );

  const route = useMemo<"wholesale" | "retail">(() => {
    if (!askingPrice || !arv) return "wholesale";
    if (askingPrice <= mao * 1.08) return "wholesale";
    if (askingPrice >= arv * 0.90) return "retail";
    return "wholesale";
  }, [askingPrice, arv, mao]);

  // Auto-derive median ARV from comps when arv is 0 (user hasn't overridden).
  const compRows = comps.map(c => ({ ...c, sqftN: numOf(c.sqft), valueN: numOf(c.value) }));
  const validComps = compRows.filter(c => c.valueN > 0);
  const medianValue = (() => {
    if (!validComps.length) return 0;
    const sorted = [...validComps].sort((a, b) => a.valueN - b.valueN);
    return sorted[Math.floor(sorted.length / 2)].valueN;
  })();

  const setComp = (i: number, patch: Partial<ManualComp>) =>
    setComps(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addComp = () => setComps(cs => [...cs, emptyComp()]);
  const removeComp = (i: number) => setComps(cs => cs.filter((_, idx) => idx !== i));

  const fetchZillowComps = async () => {
    if (!address) return;
    setFetchingComps(true); setCompsErr("");
    try {
      const res = await fetch(`/api/zillow?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Zillow fetch failed");
      const zComps: Array<{ address?: string; sqft?: number; price?: number }> = data.comparables || [];
      if (!zComps.length) { setCompsErr("No comparables returned from Zillow for this address."); setFetchingComps(false); return; }
      const mapped: ManualComp[] = zComps.map(c => ({
        address: c.address || "",
        layout: "",
        sqft: c.sqft ? String(c.sqft) : "",
        status: "Sold",
        value: c.price ? String(c.price) : "",
      }));
      setComps(mapped);
    } catch (e) {
      setCompsErr(e instanceof Error ? e.message : "Failed to fetch from Zillow");
    }
    setFetchingComps(false);
  };

  const openGoogleSearch = () => {
    const q = address ? `${address} comparable homes sold recently` : "real estate comparable sales";
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener");
  };

  const generateOfferPDF = () => {
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cash Offer — ${address || "Property"}</title>
      <style>
        *{font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#F4F4FF;box-sizing:border-box}
        body{max-width:720px;margin:40px auto;padding:0 32px}
        .bar{height:6px;background:linear-gradient(135deg,#3B82F6,#2563EB);border-radius:6px}
        h1{font-size:26px;margin:24px 0 4px} .muted{color:#9A9AB0;font-size:13px}
        .card{border:1px solid #22222c;border-radius:14px;padding:20px;margin-top:20px}
        .row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #101018;font-size:14px}
        .row:last-child{border-bottom:none}
        .mao{font-size:30px;font-weight:900;color:#2563EB}
        .sky{color:#2563EB;font-weight:800}
      </style></head><body>
      <div class="bar"></div>
      <h1>Cash Offer Summary</h1>
      <p class="muted">${today} · Prepared for ${ownerName || "Property Owner"}</p>
      <div class="card">
        <div class="row"><span>Property</span><strong>${address || "—"}</strong></div>
        ${zestimate ? `<div class="row"><span>Zestimate (Zillow)</span><strong>${money(zestimate)}</strong></div>` : ""}
        <div class="row"><span>After-Repair Value (manual)</span><strong>${arv ? money(arv) : "—"}</strong></div>
        <div class="row"><span>Estimated Rehab</span><strong>${money(rehab)}</strong></div>
        <div class="row"><span>Wholesale / Assignment Fee</span><strong>${money(fee)}</strong></div>
        <div class="row"><span>Formula</span><span class="muted">(ARV × 70%) − Rehab − Fee</span></div>
        <div class="row"><span class="sky">Maximum Allowable Offer</span><span class="mao">${money(mao)}</span></div>
      </div>
      ${validComps.length ? `<div class="card">
        <div style="font-weight:800;margin-bottom:10px">Comparable Properties (${validComps.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr style="color:#9A9AB0;text-align:left"><th style="text-align:left;padding:6px 0">Address</th><th style="text-align:left">Layout</th><th style="text-align:right">Sq. Ft.</th><th style="text-align:left;padding-left:10px">Status</th><th style="text-align:right">Value</th></tr>
          ${validComps.map(c => `<tr style="border-top:1px solid #101018"><td style="padding:6px 0">${c.address || "—"}</td><td>${c.layout || "—"}</td><td style="text-align:right">${c.sqftN ? c.sqftN.toLocaleString() : "—"}</td><td style="padding-left:10px">${c.status}</td><td style="text-align:right;color:#2563EB;font-weight:700">${money(c.valueN)}</td></tr>`).join("")}
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

      {/* ── Comparable Properties (manual entry) ── */}
      <div style={{ background: "#0A0A0E", border: "1px solid var(--border-2)", borderRadius: 18, boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border-1)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: "color-mix(in srgb, #3B82F6 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Building2 size={16} color={SKY_600} />
            </span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Comparable Properties</p>
              <p style={{ fontSize: 11, color: "var(--text-3)" }}>Enter comps manually — median value auto-populates ARV</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {medianValue > 0 && (
              <span style={{ fontSize: 12, fontWeight: 800, color: MONEY, background: "color-mix(in srgb, #2563EB 12%, transparent)", padding: "4px 11px", borderRadius: 999 }}>
                Median: {money(medianValue)}
              </span>
            )}
            {address && (
              <button onClick={fetchZillowComps} disabled={fetchingComps} title="Auto-fill comps from Zillow"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "1px solid #3B82F633", background: "#0d1626", color: SKY_600, fontSize: 11.5, fontWeight: 800, cursor: fetchingComps ? "wait" : "pointer" }}>
                {fetchingComps ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                {fetchingComps ? "Fetching…" : "Fetch from Zillow"}
              </button>
            )}
            <button onClick={openGoogleSearch} title="Search Google for comps"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--surface-3)", color: "var(--text-2)", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>
              <ExternalLink size={11} /> Google Search
            </button>
          </div>
        </div>

        <div style={{ padding: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "#101018" }}>
                {["Address", "Layout", "Sq. Ft.", "Status", "Sale Value", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 10px", textAlign: i >= 4 ? "right" : "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", whiteSpace: "nowrap", borderBottom: "1px solid var(--border-2)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comps.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-1)" }}>
                  <td style={{ padding: "6px 8px", minWidth: 180 }}>
                    <input value={c.address} onChange={e => setComp(i, { address: e.target.value })} placeholder="123 Oak St, City, ST" style={INP} />
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 110 }}>
                    <input value={c.layout} onChange={e => setComp(i, { layout: e.target.value })} placeholder="3 Bed / 2 Bath" style={INP} />
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 90 }}>
                    <input type="number" min={0} value={c.sqft} onChange={e => setComp(i, { sqft: e.target.value })} placeholder="1500" style={{ ...INP, textAlign: "right" }} />
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 100 }}>
                    <select value={c.status} onChange={e => setComp(i, { status: e.target.value })} style={{ ...INP }}>
                      <option>Sold</option>
                      <option>Active</option>
                      <option>Pending</option>
                    </select>
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 110 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>$</span>
                      <input type="number" min={0} value={c.value} onChange={e => setComp(i, { value: e.target.value })} placeholder="0" style={{ ...INP, textAlign: "right" }} />
                    </div>
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    <button onClick={() => removeComp(i)} disabled={comps.length === 1} style={{ background: "none", border: "none", cursor: comps.length === 1 ? "default" : "pointer", color: "var(--text-3)", padding: 4, display: "flex" }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={addComp} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, background: "#101018", border: "1px solid var(--border-2)", color: SKY_600, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={13} /> Add comp
            </button>
            {compsErr && <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{compsErr}</span>}
          </div>
        </div>
      </div>

      {/* ── MAO Calculator ── */}
      <div style={{ background: "#0A0A0E", border: "1px solid var(--border-2)", borderRadius: 18, boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {zestimate ? <ReadRow label="Zestimate (Zillow)" value={money(zestimate)} sub="Market-value reference" /> : null}
            {medianValue > 0 && (
              <ReadRow label="Median comp value" value={money(medianValue)} sub={`From ${validComps.length} comp${validComps.length === 1 ? "" : "s"} above`} accent={SKY_600} />
            )}
            {/* Manual ARV input */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderRadius: 10, background: "#0d1626", border: `1px solid ${SKY_600}55` }}>
              <div>
                <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 700 }}>ARV (After-Repair Value)</span>
                <p style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>Enter manually — used for MAO</p>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: SKY_600 }}>$</span>
                <input type="number" min={0} step={1000} value={arv || ""} onChange={e => setArv(Math.max(0, Number(e.target.value) || 0))}
                  placeholder={medianValue ? String(medianValue) : "0"}
                  style={{ width: 110, textAlign: "right", padding: "5px 8px", borderRadius: 8, border: `1px solid ${SKY_600}55`, background: "#0A0A0E", color: "#F4F4FF", fontSize: 15, fontWeight: 800, outline: "none" }} />
              </div>
            </div>
            <NumberRow label="Estimated Rehab Cost" value={rehab} onChange={setRehab} />
            <NumberRow label="Wholesale / Assignment Fee" value={fee} onChange={setFee} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-3)", paddingTop: 4 }}>
              <span style={{ fontWeight: 700, color: SKY_600 }}>(ARV × 0.70)</span> − Rehab − Fee
            </div>
          </div>

          <div style={{
            borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", justifyContent: "center",
            background: "var(--money-soft)", border: "1px solid color-mix(in srgb, #2563EB 30%, transparent)",
          }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: MONEY, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <DollarSign size={12} /> Maximum Allowable Offer
            </p>
            <motion.p key={mao} initial={{ scale: 0.92, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING}
              style={{ fontSize: 38, fontWeight: 900, color: MONEY, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "6px 0 2px" }}>
              {arv ? money(mao) : "—"}
            </motion.p>
            {askingPrice ? (
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                Seller asking <strong style={{ color: "var(--text-1)" }}>{money(askingPrice)}</strong>
                {arv && askingPrice <= mao ? " · spread in your favor" : arv ? ` · ${money(askingPrice - mao)} over MAO` : ""}
              </p>
            ) : null}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={generateOfferPDF}
              style={{
                marginTop: 14, padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                background: "var(--grad-primary)", color: "#fff", fontSize: 12.5, fontWeight: 800,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                boxShadow: "0 8px 20px color-mix(in srgb, #3B82F6 35%, transparent)",
              }}>
              <FileText size={14} /> Generate Offer PDF
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── EXIT STRATEGY ── */}
      {arv > 0 && (
        <div style={{ background: "#0A0A0E", border: "1px solid var(--border-2)", borderRadius: 18, padding: 22, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "color-mix(in srgb, #3B82F6 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Calculator size={15} color={SKY_600} />
              </span>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#F4F4FF" }}>Does this deal work? — Flip vs BRRRR vs Hold</p>
            </div>
            {strat.best !== "None" && (
              <span style={{ fontSize: 11.5, fontWeight: 800, color: MONEY, background: "color-mix(in srgb, #2563EB 12%, transparent)", padding: "4px 11px", borderRadius: 999 }}>
                Best fit: {strat.best}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 14 }}>
            At purchase <strong style={{ color: "var(--text-1)" }}>{money(purchase)}</strong> · rehab {money(rehab)} · ARV {money(arv)}{rent ? ` · est. rent ${money(rent)}/mo` : ""}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }} className="ci-grid">
            <StrategyCard title="Fix & Flip" verdict={strat.flip.v}
              metric={money(strat.flip.mid)}
              metricLabel="Net profit (sell)"
              note={`After 8% selling + 3% holding on ARV.`} />
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
            Estimates only — assumes ~7% financing, conventional terms, and standard cost ratios.
          </p>
        </div>
      )}

      {/* ── AI Handoff Dossier ── */}
      {(personality || painPoint || bottomLine) && (
        <div style={{ background: "#0A0A0E", border: "1px solid var(--border-2)", borderTop: `3px solid ${SKY}`, borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "color-mix(in srgb, #3B82F6 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
    <div style={{ borderRadius: 14, padding: 16, background: "#0A0A0E", border: `1px solid ${verdict === "Works" ? "color-mix(in srgb, #2563EB 35%, transparent)" : "var(--border-2)"}`, borderTop: `3px solid ${c}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: "#F4F4FF" }}>{title}</p>
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderRadius: 10, background: "#0A0A0E", border: "1px solid var(--border-2)" }}>
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
        <p style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: isMoney ? 800 : 500, color: isMoney ? MONEY : "#F4F4FF" }}>
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
