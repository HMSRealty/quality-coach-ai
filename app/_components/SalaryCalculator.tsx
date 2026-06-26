"use client";

// Manual salary calculator — enter hours, leads, and KPI values; the component
// auto-calculates gross pay = base + hourly + per-lead bonus + KPI bonuses.
import { useState } from "react";
import { Plus, Trash2, Calculator } from "lucide-react";

const SKY_600 = "#2563EB";
const MONEY = "#2563EB";
const money = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface KpiRow { name: string; target: number; actual: number; bonusPerUnit: number; }

const emptyKpi = (): KpiRow => ({ name: "", target: 0, actual: 0, bonusPerUnit: 0 });

const INP: React.CSSProperties = {
  width: "100%", padding: "7px 9px", borderRadius: 8,
  border: "1px solid var(--border-2)", background: "#FFFFFF",
  color: "#15131D", fontSize: 13, outline: "none",
};
const NUM: React.CSSProperties = { ...INP, textAlign: "right" };

export function SalaryCalculator() {
  const [baseSalary, setBaseSalary] = useState(0);
  const [hours, setHours] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [leads, setLeads] = useState(0);
  const [bonusPerLead, setBonusPerLead] = useState(0);
  const [kpis, setKpis] = useState<KpiRow[]>([emptyKpi()]);

  const setKpi = (i: number, patch: Partial<KpiRow>) =>
    setKpis(ks => ks.map((k, idx) => idx === i ? { ...k, ...patch } : k));
  const addKpi = () => setKpis(ks => [...ks, emptyKpi()]);
  const removeKpi = (i: number) => setKpis(ks => ks.filter((_, idx) => idx !== i));

  const hourlyPay = hours * hourlyRate;
  const leadBonus = leads * bonusPerLead;
  const kpiBonus = kpis.reduce((sum, k) => {
    const units = Math.min(k.actual, k.target > 0 ? k.actual : k.actual);
    return sum + units * k.bonusPerUnit;
  }, 0);
  const gross = baseSalary + hourlyPay + leadBonus + kpiBonus;

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: "color-mix(in srgb, #3B82F6 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Calculator size={16} color={SKY_600} />
        </span>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: "#15131D" }}>Salary Calculator</p>
          <p style={{ fontSize: 11.5, color: "var(--text-3)" }}>Enter hours, leads, and KPIs — gross pay is calculated automatically.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Field label="Base Salary ($)" value={baseSalary} onChange={setBaseSalary} />
        <Field label="Hours Worked" value={hours} onChange={setHours} step={0.5} />
        <Field label="Hourly Rate ($/hr)" value={hourlyRate} onChange={setHourlyRate} step={0.5} />
        <Field label="Leads Generated" value={leads} onChange={setLeads} step={1} />
        <Field label="Bonus / Lead ($)" value={bonusPerLead} onChange={setBonusPerLead} />
      </div>

      {/* KPI rows */}
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>KPIs</p>
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border-2)", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
          <thead>
            <tr style={{ background: "#F1F2F8" }}>
              {["KPI Name", "Target", "Actual", "Bonus / Unit", "Earned", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 10px", textAlign: i >= 3 ? "right" : "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpis.map((k, i) => {
              const earned = k.actual * k.bonusPerUnit;
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-1)" }}>
                  <td style={{ padding: "6px 8px", minWidth: 140 }}>
                    <input value={k.name} onChange={e => setKpi(i, { name: e.target.value })} placeholder="e.g. Appointments Set" style={INP} />
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 90 }}>
                    <input type="number" min={0} value={k.target || ""} onChange={e => setKpi(i, { target: Math.max(0, Number(e.target.value) || 0) })} placeholder="0" style={NUM} />
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 90 }}>
                    <input type="number" min={0} value={k.actual || ""} onChange={e => setKpi(i, { actual: Math.max(0, Number(e.target.value) || 0) })} placeholder="0" style={NUM} />
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 110 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ color: "var(--text-3)", fontWeight: 700 }}>$</span>
                      <input type="number" min={0} value={k.bonusPerUnit || ""} onChange={e => setKpi(i, { bonusPerUnit: Math.max(0, Number(e.target.value) || 0) })} placeholder="0" style={NUM} />
                    </div>
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 800, color: earned > 0 ? MONEY : "var(--text-3)", whiteSpace: "nowrap" }}>
                    {earned > 0 ? money(earned) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    <button onClick={() => removeKpi(i)} disabled={kpis.length === 1} style={{ background: "none", border: "none", cursor: kpis.length === 1 ? "default" : "pointer", color: "var(--text-3)", padding: 4, display: "flex" }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={addKpi} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, padding: "7px 13px", borderRadius: 9, background: "#F1F2F8", border: "1px solid var(--border-2)", color: SKY_600, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
        <Plus size={13} /> Add KPI
      </button>

      {/* Results breakdown */}
      <div style={{ background: "#F1F2F8", borderRadius: 14, padding: 18, border: "1px solid var(--border-2)" }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>Pay Breakdown</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BreakdownRow label="Base Salary" value={baseSalary} />
          <BreakdownRow label={`Hourly Pay (${hours} hrs × $${hourlyRate}/hr)`} value={hourlyPay} />
          <BreakdownRow label={`Lead Bonus (${leads} leads × $${bonusPerLead}/lead)`} value={leadBonus} />
          <BreakdownRow label="KPI Bonuses" value={kpiBonus} />
          <div style={{ height: 1, background: "var(--border-2)", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#15131D" }}>Gross Pay</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: MONEY, letterSpacing: "-0.02em" }}>{money(gross)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>{label}</label>
      <input type="number" min={0} step={step} value={value || ""}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        placeholder="0"
        style={{ ...NUM, fontSize: 15, fontWeight: 700 }} />
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: value > 0 ? "#000" : "var(--text-4)" }}>{value > 0 ? money(value) : "—"}</span>
    </div>
  );
}
