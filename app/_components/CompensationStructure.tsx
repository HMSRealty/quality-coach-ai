"use client";

// Role Salary Structure — the single source of truth for compensation.
// Hourly rate is COMPUTED from basic / working_days / (8 for full time, 4 for
// part time) and is NOT editable. Working days defaults to US working days
// minus federal holidays for the current year but is editable per row.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Save, Check, Calendar } from "lucide-react";

const NAVY = "#15131D";
const SLATE = "#6B6880";
const SKY = "#3B82F6";
const MONEY = "#2563EB";

interface Row {
  id: string;
  title: string;
  base_salary: number;
  currency: "USD" | "EGP";
  shift_type: "full_time" | "part_time";
  working_days: number;
  target_leads: number;
  kpi_bonus: number;
  position: number;
  _dirty?: boolean;
  _new?: boolean;
}

// US federal holidays + standard weekend rule. Returns the count of business
// days in `year` (Mon–Fri excluding federal holidays).
function usBusinessDays(year: number): number {
  const holidays = federalHolidays(year);
  const holidaySet = new Set(holidays.map(d => d.toISOString().slice(0, 10)));
  let count = 0;
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    const dow = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

// US federal holiday dates for a given year (observed dates).
function federalHolidays(year: number): Date[] {
  const nth = (n: number, dow: number, month: number) => {
    const d = new Date(Date.UTC(year, month, 1));
    let count = 0;
    while (d.getUTCMonth() === month) {
      if (d.getUTCDay() === dow) { count++; if (count === n) return new Date(d); }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return new Date(Date.UTC(year, month, 1));
  };
  const lastMon = (month: number) => {
    const d = new Date(Date.UTC(year, month + 1, 0));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  return [
    new Date(Date.UTC(year, 0, 1)),           // New Year's
    nth(3, 1, 0),                              // MLK Day — 3rd Mon Jan
    nth(3, 1, 1),                              // Presidents' — 3rd Mon Feb
    lastMon(4),                                // Memorial Day — last Mon May
    new Date(Date.UTC(year, 5, 19)),           // Juneteenth
    new Date(Date.UTC(year, 6, 4)),            // Independence Day
    nth(1, 1, 8),                              // Labor Day — 1st Mon Sep
    nth(2, 1, 9),                              // Columbus — 2nd Mon Oct
    new Date(Date.UTC(year, 10, 11)),          // Veterans Day
    nth(4, 4, 10),                             // Thanksgiving — 4th Thu Nov
    new Date(Date.UTC(year, 11, 25)),          // Christmas
  ];
}

// Per-month variant — used to derive the *monthly* working day default from
// the same set, since salaries are monthly. Returns avg working days/month.
function avgUsBusinessDaysPerMonth(year: number): number {
  return Math.round(usBusinessDays(year) / 12);
}

export const SHIFT_HOURS = { full_time: 8, part_time: 4 } as const;

export function computeHourly(basic: number, workingDays: number, shift: "full_time" | "part_time"): number {
  const hrs = SHIFT_HOURS[shift];
  if (!basic || !workingDays || !hrs) return 0;
  return basic / workingDays / hrs;
}

const blank = (defaultDays: number): Omit<Row, "id"> => ({
  title: "", base_salary: 0, currency: "USD",
  shift_type: "full_time", working_days: defaultDays, target_leads: 0,
  kpi_bonus: 0, position: 0, _dirty: true, _new: true,
});

export function CompensationStructure() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const year = new Date().getFullYear();
  const defaultMonthlyDays = useMemo(() => avgUsBusinessDaysPerMonth(year), [year]);
  const totalUsDays = useMemo(() => usBusinessDays(year), [year]);
  const holidays = useMemo(() => federalHolidays(year), [year]);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("comp_titles")
      .select("id, title, base_salary, kpis, basis, position")
      .eq("user_id", user.id).order("position", { ascending: true });
    setRows((data || []).map(d => {
      const kpis = Array.isArray(d.kpis) ? d.kpis as Record<string, unknown>[] : [];
      const basis = (d.basis || "") as string;
      const basisObj = (() => { try { return JSON.parse(basis); } catch { return null; } })();
      return {
        id: d.id,
        title: d.title || "",
        base_salary: Number(d.base_salary) || 0,
        currency: (basisObj?.currency || (Number(d.base_salary) >= 1000 ? "EGP" : "USD")) as "USD" | "EGP",
        shift_type: (basisObj?.shift_type === "part_time" ? "part_time" : "full_time"),
        working_days: Number(basisObj?.working_days) || defaultMonthlyDays,
        target_leads: Number(basisObj?.target_leads) || 0,
        kpi_bonus: Number(basisObj?.kpi_bonus) || kpis.reduce((a, k) => a + (Number(k.payment) || 0), 0),
        position: d.position || 0,
      };
    }));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const patch = (id: string, p: Partial<Row>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...p, _dirty: true } : r));

  const addRow = () => {
    const r = blank(defaultMonthlyDays);
    setRows(rs => [...rs, { ...r, id: `new-${Date.now()}`, position: rs.length } as Row]);
  };

  const removeRow = async (id: string) => {
    const r = rows.find(x => x.id === id);
    setRows(rs => rs.filter(x => x.id !== id));
    if (r && !r._new) await supabase.from("comp_titles").delete().eq("id", id);
  };

  const saveAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true);
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (prof?.organization_id as string) ?? null;
    for (const r of rows.filter(x => x._dirty)) {
      const basis = JSON.stringify({
        currency: r.currency, shift_type: r.shift_type,
        working_days: r.working_days, target_leads: r.target_leads, kpi_bonus: r.kpi_bonus,
      });
      const payload = {
        user_id: user.id, organization_id: orgId,
        title: r.title || "Untitled", base_salary: r.base_salary,
        kpis: [], basis, position: r.position,
      };
      if (r._new) await supabase.from("comp_titles").insert(payload);
      else await supabase.from("comp_titles").update(payload).eq("id", r.id);
    }
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await load();
  };

  const dirty = rows.some(r => r._dirty);
  const inp: React.CSSProperties = {
    width: "100%", padding: "7px 9px", borderRadius: 7,
    border: "1px solid var(--border-2)", background: "#FFFFFF",
    color: NAVY, fontSize: 13, outline: "none",
  };
  const num: React.CSSProperties = { ...inp, textAlign: "right", width: 90 };
  const computedCell: React.CSSProperties = {
    ...num, background: "#F1F2F8", color: SLATE, cursor: "not-allowed",
    fontWeight: 700,
  };
  const th: React.CSSProperties = {
    padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 800,
    letterSpacing: "0.05em", textTransform: "uppercase", color: SLATE,
    whiteSpace: "nowrap", borderBottom: "2px solid var(--border-2)",
    background: "var(--surface-3)",
  };
  const td: React.CSSProperties = {
    padding: "8px 10px", fontSize: 13, color: NAVY,
    borderBottom: "1px solid var(--border-1)", whiteSpace: "nowrap",
  };

  if (loading) return (
    <div style={{ padding: 50, textAlign: "center" }}>
      <Loader2 size={22} className="animate-spin" style={{ color: SKY }} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* US Working Days info card */}
      <div style={{ background: "#EFF5FF", border: "1px solid #BAE6FD", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Calendar size={16} color="#0C4A6E" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: "#0C4A6E" }}>{year} US Working Days: {totalUsDays} / year · {defaultMonthlyDays} avg / month</p>
          <p style={{ fontSize: 11, color: "#075985" }}>Excludes weekends and {holidays.length} federal holidays. The default is editable per role below.</p>
        </div>
        <p style={{ fontSize: 11, color: "#0C4A6E" }}>Hourly = <strong>Basic ÷ Working Days ÷ shift hrs</strong> (8 full-time, 4 part-time)</p>
      </div>

      <div style={{ background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border-1)", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>Role Salary Structure</h2>
            <p style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>This is the source of truth — payroll math everywhere else reflects these values.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addRow} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 9, background: SKY,
              color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
            }}><Plus size={14} /> Add role</button>
            <button onClick={saveAll} disabled={saving || !dirty} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 9,
              background: saved ? MONEY : dirty ? NAVY : "#94A3B8",
              color: "#fff", border: "none", fontSize: 12, fontWeight: 800,
              cursor: saving ? "wait" : "pointer", opacity: dirty || saved ? 1 : 0.5,
            }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
              {saved ? "Saved" : "Save all"}
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={th}>Title</th>
                <th style={{ ...th, textAlign: "right" }}>Basic</th>
                <th style={{ ...th, textAlign: "center" }}>Currency</th>
                <th style={{ ...th, textAlign: "right" }} title="Computed automatically">Hourly (computed)</th>
                <th style={{ ...th, textAlign: "center" }}>Shift Type</th>
                <th style={{ ...th, textAlign: "right" }}>Working Days</th>
                <th style={{ ...th, textAlign: "right" }}>Target Leads</th>
                <th style={{ ...th, textAlign: "right" }}>KPIs</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const hourly = computeHourly(r.base_salary, r.working_days, r.shift_type);
                const total = r.base_salary + r.kpi_bonus;
                const cur = r.currency === "EGP" ? "EGP" : "$";
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <input value={r.title} onChange={e => patch(r.id, { title: e.target.value })}
                        placeholder="Role title" style={{ ...inp, fontWeight: 700, minWidth: 130 }} />
                    </td>
                    <td style={td}>
                      <input type="number" min={0} value={r.base_salary}
                        onChange={e => patch(r.id, { base_salary: Number(e.target.value) || 0 })}
                        style={num} />
                    </td>
                    <td style={td}>
                      <select value={r.currency} onChange={e => patch(r.id, { currency: e.target.value as "USD" | "EGP" })}
                        style={{ ...inp, width: 75, textAlign: "center" }}>
                        <option value="USD">USD</option>
                        <option value="EGP">EGP</option>
                      </select>
                    </td>
                    <td style={td}>
                      <input readOnly value={hourly ? hourly.toFixed(2) : ""} title="Computed: Basic / Working Days / shift hrs"
                        placeholder="—" style={computedCell} />
                    </td>
                    <td style={td}>
                      <select value={r.shift_type} onChange={e => patch(r.id, { shift_type: e.target.value as "full_time" | "part_time" })}
                        style={{ ...inp, width: 110, textAlign: "center" }}>
                        <option value="full_time">Full time (8h)</option>
                        <option value="part_time">Part time (4h)</option>
                      </select>
                    </td>
                    <td style={td}>
                      <input type="number" min={0} value={r.working_days}
                        onChange={e => patch(r.id, { working_days: Number(e.target.value) || 0 })}
                        title={`Default: ${defaultMonthlyDays} (avg US business days/month)`}
                        style={{ ...num, width: 80 }} />
                    </td>
                    <td style={td}>
                      <input type="number" min={0} value={r.target_leads || ""}
                        onChange={e => patch(r.id, { target_leads: Number(e.target.value) || 0 })}
                        placeholder="—" style={{ ...num, width: 70 }} />
                    </td>
                    <td style={td}>
                      <input type="number" min={0} value={r.kpi_bonus || ""}
                        onChange={e => patch(r.id, { kpi_bonus: Number(e.target.value) || 0 })}
                        placeholder="—" style={num} />
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 900, color: MONEY, fontSize: 13 }}>
                      {cur === "$" ? `$${total.toLocaleString()}` : `${total.toLocaleString()} EGP`}
                    </td>
                    <td style={td}>
                      <button onClick={() => removeRow(r.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", display: "flex", padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: SLATE, padding: 40 }}>
                  No roles defined yet. Click <strong>Add role</strong> to start building your salary structure.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
