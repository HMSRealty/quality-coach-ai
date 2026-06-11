"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Save, Check } from "lucide-react";

const NAVY = "#0F172A";
const SLATE = "#475569";
const SKY = "#0EA5E9";
const MONEY = "#059669";

interface Row {
  id: string;
  title: string;
  base_salary: number;
  currency: "USD" | "EGP";
  hourly_rate: number;
  shift_type: "full_time" | "part_time" | "";
  working_days: number;
  target_leads: number;
  kpi_bonus: number;
  position: number;
  _dirty?: boolean;
  _new?: boolean;
}

const blank = (): Omit<Row, "id"> => ({
  title: "", base_salary: 0, currency: "USD", hourly_rate: 0,
  shift_type: "full_time", working_days: 22, target_leads: 0,
  kpi_bonus: 0, position: 0, _dirty: true, _new: true,
});

export function CompensationStructure() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        hourly_rate: Number(basisObj?.hourly_rate) || 0,
        shift_type: (basisObj?.shift_type || "") as "" | "full_time" | "part_time",
        working_days: Number(basisObj?.working_days) || 22,
        target_leads: Number(basisObj?.target_leads) || 0,
        kpi_bonus: Number(basisObj?.kpi_bonus) || kpis.reduce((a, k) => a + (Number(k.payment) || 0), 0),
        position: d.position || 0,
      };
    }));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patch = (id: string, p: Partial<Row>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...p, _dirty: true } : r));

  const addRow = () => {
    const r = blank();
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
        currency: r.currency, hourly_rate: r.hourly_rate, shift_type: r.shift_type,
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
    border: "1px solid var(--border-2)", background: "#fff",
    color: NAVY, fontSize: 13, outline: "none",
  };
  const num: React.CSSProperties = { ...inp, textAlign: "right", width: 90 };
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
    <div style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border-1)", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>Role Salary Structure</h2>
          <p style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>Define base salary, hourly rate, shift type, targets, and KPI bonus per role.</p>
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

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={th}>Title</th>
              <th style={{ ...th, textAlign: "right" }}>Basic</th>
              <th style={{ ...th, textAlign: "center" }}>Currency</th>
              <th style={{ ...th, textAlign: "right" }}>Hourly</th>
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
                    <input type="number" min={0} step={0.01} value={r.hourly_rate || ""}
                      onChange={e => patch(r.id, { hourly_rate: Number(e.target.value) || 0 })}
                      placeholder="—" style={num} />
                  </td>
                  <td style={td}>
                    <select value={r.shift_type} onChange={e => patch(r.id, { shift_type: e.target.value as "" | "full_time" | "part_time" })}
                      style={{ ...inp, width: 110, textAlign: "center" }}>
                      <option value="">—</option>
                      <option value="full_time">Full time</option>
                      <option value="part_time">Part time</option>
                    </select>
                  </td>
                  <td style={td}>
                    <input type="number" min={0} value={r.working_days}
                      onChange={e => patch(r.id, { working_days: Number(e.target.value) || 0 })}
                      style={{ ...num, width: 70 }} />
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
  );
}
