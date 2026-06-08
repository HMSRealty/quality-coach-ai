"use client";

// Dialer Hours → Pay calculator.
// Understands the dialer export format "12 Hours 60 Mins." (and variants),
// converts it to decimal hours, and multiplies by an hourly rate.
// Supports CSV upload keyed on the "Payable Hours" column + a name column,
// matching names to CRM agents, and manual employee rows.
import { useMemo, useRef, useState } from "react";
import { Clock, Upload, Plus, Trash2, Download } from "lucide-react";

const SKY = "#0EA5E9";
const SKY_600 = "#0284C7";
const MONEY = "#059669";
const money = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Parse "12 Hours 60 Mins." / "12h 30m" / "12:30" / "12.5" → decimal hours.
export function parsePayableHours(raw: string): number {
  if (!raw) return 0;
  const s = String(raw).trim().toLowerCase();
  // "12:30" clock form
  const clock = s.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  const hM = s.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const mM = s.match(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|m)\b/);
  if (hM || mM) {
    const h = hM ? Number(hM[1]) : 0;
    const m = mM ? Number(mM[1]) : 0;
    return h + m / 60;          // "12 Hours 60 Mins" -> 13.0
  }
  // bare number → hours
  const n = Number(s.replace(/[^\d.]/g, ""));
  return isFinite(n) ? n : 0;
}

interface Row { name: string; raw: string; rate: number | null; }

// CSV parse → rows keyed on a name column + the "Payable Hours" column.
function parseCSV(text: string): { name: string; raw: string }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const split = (l: string) => l.split(",").map(c => c.replace(/^"|"$/g, "").trim());
  const header = split(lines[0]).map(h => h.toLowerCase());
  const hoursIdx = header.findIndex(h => h.includes("payable") && h.includes("hour"));
  const nameIdx = header.findIndex(h => ["name", "agent", "agent name", "employee", "full name"].includes(h));
  if (hoursIdx < 0) return [];
  return lines.slice(1).map(split).map(cells => ({
    name: nameIdx >= 0 ? (cells[nameIdx] || "") : "",
    raw: cells[hoursIdx] || "",
  })).filter(r => r.raw);
}

export function DialerHoursCalculator() {
  const [rate, setRate] = useState(12);
  const [rows, setRows] = useState<Row[]>([{ name: "", raw: "", rate: null }]);
  const fileRef = useRef<HTMLInputElement>(null);

  const computed = useMemo(() => rows.map(r => {
    const hours = parsePayableHours(r.raw);
    const pay = hours * (r.rate ?? rate);
    return { ...r, hours, pay };
  }), [rows, rate]);
  const totals = computed.reduce((a, c) => ({ hours: a.hours + c.hours, pay: a.pay + c.pay }), { hours: 0, pay: 0 });

  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, { name: "", raw: "", rate: null }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { alert('CSV must include a "Payable Hours" column (and ideally a Name column).'); }
    else setRows(parsed.map(p => ({ name: p.name, raw: p.raw, rate: null })));
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = () => {
    const csv = "Name,Payable Hours\nJohn Smith,12 Hours 60 Mins.\nJane Doe,8 Hours 30 Mins.";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "dialer-hours-template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", whiteSpace: "nowrap" };
  const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border-2)", background: "#fff", color: "#000", fontSize: 13, outline: "none" };

  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "color-mix(in srgb, #0EA5E9 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Clock size={16} color={SKY_600} /></span>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#000" }}>Dialer Hours → Pay</p>
            <p style={{ fontSize: 11.5, color: "var(--text-3)" }}>Reads the &quot;Payable Hours&quot; column (e.g. &quot;12 Hours 60 Mins.&quot;) and multiplies by the hourly rate.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#000" }}>Hourly rate</label>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span style={{ fontWeight: 800, color: "var(--text-3)" }}>$</span>
            <input type="number" min={0} step={0.5} value={rate} onChange={e => setRate(Math.max(0, Number(e.target.value) || 0))}
              style={{ ...inp, width: 76, fontWeight: 800 }} />
          </div>
          <button onClick={() => fileRef.current?.click()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, background: SKY, color: "#fff", border: "none", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}><Upload size={13} /> Upload CSV</button>
          <button onClick={downloadTemplate} className="btn-ghost" style={{ fontSize: 12, padding: "8px 12px" }}><Download size={12} /> Template</button>
          <input ref={fileRef} type="file" accept=".csv" onChange={onFile} style={{ display: "none" }} />
        </div>
      </div>

      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border-2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={th}>Employee</th>
              <th style={th}>Payable Hours (raw)</th>
              <th style={{ ...th, textAlign: "right" }}>Hours</th>
              <th style={{ ...th, textAlign: "right" }}>Rate</th>
              <th style={{ ...th, textAlign: "right" }}>Pay</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {computed.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td style={{ padding: "7px 10px", minWidth: 150 }}><input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="Name (matches CRM agent)" style={inp} /></td>
                <td style={{ padding: "7px 10px", minWidth: 170 }}><input value={r.raw} onChange={e => setRow(i, { raw: e.target.value })} placeholder="12 Hours 60 Mins." style={inp} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#000", whiteSpace: "nowrap" }}>{r.hours ? r.hours.toFixed(2) : "—"}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>
                  <input type="number" min={0} step={0.5} value={r.rate ?? ""} onChange={e => setRow(i, { rate: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })}
                    placeholder={String(rate)} style={{ ...inp, width: 70, textAlign: "right" }} />
                </td>
                <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 900, color: MONEY, whiteSpace: "nowrap" }}>{r.hours ? money(r.pay) : "—"}</td>
                <td style={{ padding: "7px 10px", textAlign: "center" }}><button onClick={() => removeRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", padding: 3 }}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border-2)", background: "#F8FAFC" }}>
              <td style={{ padding: "10px 12px", fontWeight: 900, color: "#000" }}>Total</td>
              <td />
              <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "#000", whiteSpace: "nowrap" }}>{totals.hours.toFixed(2)} h</td>
              <td />
              <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: MONEY, whiteSpace: "nowrap" }}>{money(totals.pay)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button onClick={addRow} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "8px 14px", borderRadius: 9, background: "#F8FAFC", border: "1px solid var(--border-2)", color: SKY_600, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}><Plus size={14} /> Add employee</button>
      <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 10 }}>
        Parses &quot;Hours&quot; + &quot;Mins&quot; (so &quot;12 Hours 60 Mins.&quot; = 13.00 h), also accepts 12:30, 12h 30m, or a plain number. Per-row rate overrides the default.
      </p>
    </div>
  );
}
