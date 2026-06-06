"use client";

// Wholesaler deal calculator. Inputs:
//   ARV (read from lead.metadata.arv or .zillow_data.zestimate × 1.0)
//   Repair cost (default from AI extraction, editable)
//   Wholesale fee (org-wide default 10000, editable)
// Formula: MAO = (ARV × 0.70) − Repairs − WholesaleFee
// "Generate Offer PDF" opens a print-styled window the user can save.
import { useState, useMemo } from "react";
import { Calculator, Hammer, FileText, Sparkles } from "lucide-react";
import { T } from "@/app/_components/tokens";

interface Props {
  leadId: string;
  ownerName?: string | null;
  propertyAddress?: string | null;
  arv: number;
  defaultRehab: number;
  repairsMentioned?: string[];
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function DealCalculator({ leadId, ownerName, propertyAddress, arv, defaultRehab, repairsMentioned }: Props) {
  const [rehab, setRehab] = useState(defaultRehab);
  const [feeStr, setFeeStr] = useState("10000");
  const [pctStr, setPctStr] = useState("70");

  const fee = Number(feeStr.replace(/[^0-9.]/g, "")) || 0;
  const pct = Math.min(100, Math.max(0, Number(pctStr) || 0));

  const baseline = useMemo(() => arv * (pct / 100), [arv, pct]);
  const mao = useMemo(() => Math.max(0, Math.round(baseline - rehab - fee)), [baseline, rehab, fee]);

  const generatePDF = () => {
    const w = window.open("", "_blank", "noopener,noreferrer,width=820,height=1100");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Offer · ${propertyAddress || leadId}</title>
      <style>
        body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 36px auto; color: #0F1424; padding: 0 28px; }
        h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -0.02em; }
        h2 { font-size: 16px; margin: 24px 0 6px; color: #0F1424; }
        .pill { display: inline-block; padding: 4px 12px; border-radius: 999px; background: #F2266F; color: #fff; font-weight: 800; font-size: 11px; letter-spacing: 0.06em; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        td, th { padding: 9px 12px; border-bottom: 1px solid #E2E5EE; font-size: 14px; text-align: left; }
        th { color: #6B7587; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
        .total { background: linear-gradient(135deg, #F2266F, #7C3AED); color: #fff; padding: 18px 22px; border-radius: 14px; margin-top: 18px; }
        .total .lbl { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85; }
        .total .v { font-size: 36px; font-weight: 900; letter-spacing: -0.02em; }
        .meta { color: #6B7587; font-size: 12px; margin-top: 2px; }
        .stamp { color: #6B7587; font-size: 11px; margin-top: 30px; border-top: 1px solid #E2E5EE; padding-top: 12px; }
        @media print { .noprint { display: none; } }
      </style></head><body>
      <p class="pill">RealTrack · Wholesale Offer</p>
      <h1>${propertyAddress || "Property"}</h1>
      <p class="meta">${ownerName ? "Owner: " + ownerName + " · " : ""}Lead #${leadId.slice(0,8)}</p>

      <h2>Deal Math</h2>
      <table>
        <tr><th>After Repair Value (ARV)</th><td>${fmt(arv)}</td></tr>
        <tr><th>× ${pct}% (Rule)</th><td>${fmt(baseline)}</td></tr>
        <tr><th>− Estimated Repairs</th><td>${fmt(rehab)}</td></tr>
        <tr><th>− Wholesale Fee</th><td>${fmt(fee)}</td></tr>
      </table>

      <div class="total">
        <div class="lbl">Maximum Allowable Offer (MAO)</div>
        <div class="v">${fmt(mao)}</div>
      </div>

      ${(repairsMentioned && repairsMentioned.length) ? `<h2>Repairs noted on the call</h2><ul>${repairsMentioned.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}

      <p class="stamp">Generated ${new Date().toLocaleString()}. This worksheet is internal — not a binding offer.</p>
      <p class="noprint" style="text-align:center; margin-top:24px;"><button onclick="window.print()" style="padding:10px 18px;border-radius:999px;border:none;background:#0B0F1F;color:#fff;font-weight:700;cursor:pointer;">Print / Save as PDF</button></p>
    </body></html>`);
    w.document.close();
  };

  if (!arv || arv <= 0) return null;
  return (
    <div style={{
      borderRadius: 18, padding: 22, background: "var(--surface-1)",
      border: "1px solid var(--border-2)", boxShadow: "var(--shadow-md)",
      position: "relative", overflow: "hidden",
    }}>
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: T.gradPrimary }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 10, background: T.gradPrimary,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Calculator size={15} color="#fff" />
        </span>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", color: "var(--text-3)", textTransform: "uppercase" }}>Wholesaler tool</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>Deal Calculator (MAO)</p>
        </div>
      </div>

      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <ReadOnly label="ARV (from Zillow + AI)" value={fmt(arv)} accent={T.magenta as string} />
        <Editable label={`% of ARV`} suffix="%" value={pctStr} onChange={setPctStr} />
        <EditableMoney label="Repairs" value={rehab} onChange={setRehab} />
        <EditableMoneyStr label="Wholesale fee" value={feeStr} onChange={setFeeStr} />
      </div>

      {repairsMentioned && repairsMentioned.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 4, marginRight: 4 }}>
            <Hammer size={11} /> AI heard:
          </span>
          {repairsMentioned.map((r, i) => (
            <span key={i} style={{ padding: "3px 9px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-2)", fontSize: 11, fontWeight: 700 }}>{r}</span>
          ))}
        </div>
      )}

      {/* Result */}
      <div style={{
        padding: 18, borderRadius: 14,
        background: T.gradPrimary, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        boxShadow: "var(--shadow-brand)",
      }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", opacity: 0.9, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Sparkles size={11} /> Maximum Allowable Offer
          </p>
          <p style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 4 }}>
            {fmt(mao)}
          </p>
          <p style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>
            (ARV × {pct}%) − repairs − fee
          </p>
        </div>
        <button onClick={generatePDF} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "11px 18px", borderRadius: 999, border: "none", cursor: "pointer",
          background: "rgba(255,255,255,0.20)", color: "#fff",
          backdropFilter: "blur(10px)",
          fontSize: 13, fontWeight: 700,
        }}>
          <FileText size={14} /> Generate Offer PDF
        </button>
      </div>
    </div>
  );
}

function ReadOnly({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-3)", border: "1px solid var(--border-2)" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color: accent || "var(--text-1)", marginTop: 4 }}>{value}</p>
    </div>
  );
}
function Editable({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-3)", border: "1px solid var(--border-2)" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
        <input value={value} onChange={(e) => onChange(e.target.value)}
          style={{ background: "transparent", border: "none", outline: "none", fontSize: 18, fontWeight: 800, color: "var(--text-1)", width: "100%" }} />
        {suffix && <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-3)" }}>{suffix}</span>}
      </div>
    </div>
  );
}
function EditableMoney({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-3)", border: "1px solid var(--border-2)" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-3)" }}>$</span>
        <input type="number" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          style={{ background: "transparent", border: "none", outline: "none", fontSize: 18, fontWeight: 800, color: "var(--text-1)", width: "100%" }} />
      </div>
    </div>
  );
}
function EditableMoneyStr({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-3)", border: "1px solid var(--border-2)" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-3)" }}>$</span>
        <input value={value} onChange={(e) => onChange(e.target.value)}
          style={{ background: "transparent", border: "none", outline: "none", fontSize: 18, fontWeight: 800, color: "var(--text-1)", width: "100%" }} />
      </div>
    </div>
  );
}
