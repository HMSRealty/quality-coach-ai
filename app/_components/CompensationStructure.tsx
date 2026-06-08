"use client";

// Compensation base per title + editable KPI structure (KPI · % · payment).
// The "payment base ground" Payroll builds on. Persisted to public.comp_titles.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Briefcase, Plus, Trash2, Loader2, Save, Check } from "lucide-react";

const SKY = "#0EA5E9";
const SKY_600 = "#0284C7";
const MONEY = "#059669";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

interface Kpi { name: string; percentage: number; payment: number; }
interface Title { id: string; title: string; base_salary: number; kpis: Kpi[]; basis: string | null; position: number; }

// Contextual hint for known roles (per your spec).
function basisHint(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("team leader") || t.includes("leader")) return "Based on documentation + team performance";
  if (t.includes("trainer") || t.includes("coach")) return "Based on documentation + coaching/training sessions";
  if (t.includes("qa")) return "Based on calls reviewed + accuracy";
  return "";
}

export function CompensationStructure() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("comp_titles")
      .select("id, title, base_salary, kpis, basis, position")
      .eq("user_id", user.id).order("position", { ascending: true });
    setTitles((data || []).map(d => ({
      id: d.id, title: d.title, base_salary: Number(d.base_salary) || 0,
      kpis: Array.isArray(d.kpis) ? (d.kpis as Kpi[]) : [], basis: d.basis, position: d.position,
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addTitle = async () => {
    const name = newTitle.trim(); if (!name) return;
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    await supabase.from("comp_titles").insert({
      user_id: user.id, organization_id: (prof?.organization_id as string) ?? null,
      title: name, base_salary: 0, kpis: [], basis: basisHint(name) || null, position: titles.length,
    });
    setNewTitle(""); load();
  };

  const saveTitle = async (t: Title) => {
    setSavingId(t.id); setSavedId(null);
    await supabase.from("comp_titles").update({
      title: t.title, base_salary: t.base_salary, kpis: t.kpis, basis: t.basis,
    }).eq("id", t.id);
    setSavingId(null); setSavedId(t.id); setTimeout(() => setSavedId(null), 1600);
  };
  const delTitle = async (id: string) => {
    if (!confirm("Delete this title and its KPIs?")) return;
    await supabase.from("comp_titles").delete().eq("id", id);
    setTitles(p => p.filter(t => t.id !== id));
  };

  const patch = (id: string, fn: (t: Title) => Title) => setTitles(p => p.map(t => t.id === id ? fn(t) : t));

  const inp: React.CSSProperties = { padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border-2)", background: "#fff", color: "#000", fontSize: 13, outline: "none" };

  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 16, padding: 22, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "color-mix(in srgb, #0EA5E9 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Briefcase size={16} color={SKY_600} /></span>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#000" }}>Compensation &amp; KPI Structure</p>
            <p style={{ fontSize: 11.5, color: "var(--text-3)" }}>Base salary per title + editable KPI table (KPI · % · payment).</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addTitle(); }}
            placeholder="New title (e.g. Team Leader)" style={{ ...inp, minWidth: 200 }} />
          <button onClick={addTitle} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: SKY, color: "#fff", border: "none", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}><Plus size={14} /> Add title</button>
        </div>
      </div>

      {loading ? <Loader2 size={18} className="animate-spin" style={{ color: SKY_600 }} /> : titles.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>No titles yet. Add one (e.g. Caller, Team Leader, Trainer) to set the salary base + KPIs.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {titles.map(t => {
            const kpiTotal = t.kpis.reduce((a, k) => a + (Number(k.payment) || 0), 0);
            return (
              <div key={t.id} style={{ border: "1px solid var(--border-2)", borderRadius: 12, padding: 14, background: "#F8FAFC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <input value={t.title} onChange={e => patch(t.id, x => ({ ...x, title: e.target.value, basis: x.basis || basisHint(e.target.value) }))} style={{ ...inp, fontWeight: 800, minWidth: 160 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>Base</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <span style={{ fontWeight: 800, color: "var(--text-3)" }}>$</span>
                    <input type="number" min={0} step={100} value={t.base_salary} onChange={e => patch(t.id, x => ({ ...x, base_salary: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...inp, width: 110, fontWeight: 800, textAlign: "right" }} />
                  </span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => saveTitle(t)} disabled={savingId === t.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, background: savedId === t.id ? MONEY : "#fff", color: savedId === t.id ? "#fff" : SKY_600, border: `1px solid ${savedId === t.id ? MONEY : SKY}`, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    {savingId === t.id ? <Loader2 size={12} className="animate-spin" /> : savedId === t.id ? <Check size={12} /> : <Save size={12} />} {savedId === t.id ? "Saved" : "Save"}
                  </button>
                  <button onClick={() => delTitle(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", padding: 4 }}><Trash2 size={15} /></button>
                </div>
                <input value={t.basis ?? ""} onChange={e => patch(t.id, x => ({ ...x, basis: e.target.value }))} placeholder="KPI basis (e.g. Documentation + team performance)"
                  style={{ ...inp, width: "100%", fontSize: 12, color: "var(--text-2)", marginBottom: 10, background: "#fff" }} />

                {/* KPI table */}
                <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460, fontSize: 12.5 }}>
                    <thead><tr style={{ background: "#F1F5F9" }}>
                      {["KPI", "Percentage", "Payment", ""].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? "left" : i === 3 ? "center" : "right", padding: "7px 10px", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {t.kpis.map((k, ki) => (
                        <tr key={ki} style={{ borderTop: "1px solid var(--border-1)" }}>
                          <td style={{ padding: "6px 8px" }}><input value={k.name} onChange={e => patch(t.id, x => ({ ...x, kpis: x.kpis.map((kk, j) => j === ki ? { ...kk, name: e.target.value } : kk) }))} placeholder="KPI name" style={{ ...inp, width: "100%" }} /></td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}><input type="number" min={0} value={k.percentage} onChange={e => patch(t.id, x => ({ ...x, kpis: x.kpis.map((kk, j) => j === ki ? { ...kk, percentage: Number(e.target.value) || 0 } : kk) }))} style={{ ...inp, width: 80, textAlign: "right" }} />%</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}><span style={{ color: "var(--text-3)" }}>$</span><input type="number" min={0} value={k.payment} onChange={e => patch(t.id, x => ({ ...x, kpis: x.kpis.map((kk, j) => j === ki ? { ...kk, payment: Number(e.target.value) || 0 } : kk) }))} style={{ ...inp, width: 100, textAlign: "right" }} /></td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}><button onClick={() => patch(t.id, x => ({ ...x, kpis: x.kpis.filter((_, j) => j !== ki) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", margin: "0 auto" }}><Trash2 size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{ borderTop: "2px solid var(--border-2)", background: "#F8FAFC" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 800 }}>KPI total</td><td />
                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 900, color: MONEY }}>{money(kpiTotal)}</td><td />
                    </tr></tfoot>
                  </table>
                </div>
                <button onClick={() => patch(t.id, x => ({ ...x, kpis: [...x.kpis, { name: "", percentage: 0, payment: 0 }] }))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "6px 12px", borderRadius: 8, background: "#fff", border: "1px solid var(--border-2)", color: SKY_600, fontSize: 12, fontWeight: 800, cursor: "pointer" }}><Plus size={13} /> Add KPI</button>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
                  Total earning potential: <strong style={{ color: "#000" }}>{money(t.base_salary + kpiTotal)}</strong> (base {money(t.base_salary)} + KPIs {money(kpiTotal)}).
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
