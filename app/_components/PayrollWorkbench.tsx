"use client";

// Fully customizable payroll workbench — inspired by a real call-center payroll
// sheet, but every number/date/payment is user-editable and nothing is hardcoded.
//   • Config panel: custom period dates, business days, session hrs, USD↔EGP rate,
//     KPI threshold + pay, lead bonus, OT multiplier, Friday spiff, manager quality
//     target + KPI bonus — all adjustable, persisted to payroll_settings.
//   • Two tracks: Callers (USD, hourly) and Managers (EGP, monthly salary).
//   • Payment Summary: per-person net payout in EGP, grouped totals.
// People + their per-person numbers live in agent_pay. Production (leads) is
// auto-pulled for the selected dates but every figure can be overridden.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus, Trash2, Save, Users, Download, RefreshCw, Settings2 } from "lucide-react";

const SKY = "#0EA5E9", SKY600 = "#0284C7", MONEY = "#059669", NAVY = "#0F172A", SLATE = "#475569";
const PAY_METHODS = ["Instapay", "Payoneer", "Vodafone Cash", "Orange Cash", "Etisalat Cash", "Axis Pay", "Bank Transfer", "Cash", "Other"];

type Cfg = {
  periodStart: string; periodEnd: string;
  businessDays: number; sessionHrs: number; usdEgp: number;
  kpiThreshold: number; kpiFullPayUsd: number; leadBonusUsd: number; otMultiplier: number;
  fridaySpiffEgp: number; mgrQualityTarget: number; mgrKpiBonusEgp: number;
};
const todayISO = (off = 0) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
const DEFAULT_CFG: Cfg = {
  periodStart: todayISO(-21), periodEnd: todayISO(0),
  businessDays: 22, sessionHrs: 8, usdEgp: 48,
  kpiThreshold: 70, kpiFullPayUsd: 50, leadBonusUsd: 1, otMultiplier: 1.5,
  fridaySpiffEgp: 1500, mgrQualityTarget: 85, mgrKpiBonusEgp: 3000,
};

type Extras = {
  worked?: number; neededOverride?: number; tgt?: number; otHrs?: number;
  fridayCount?: number; referralEgp?: number; deductedDays?: number; qualityPct?: number;
  manualUsd?: number; manualEgp?: number;
};
type Person = {
  id: string; name: string; category: "caller" | "manager"; role: string | null;
  hourly_rate: number; monthly_salary: number;
  payment_method: string | null; payment_info: string | null; color: string | null; email: string | null;
  extras: Extras; position: number; _dirty?: boolean; _new?: boolean;
};
type Prod = { qualified: number; total: number };

const n = (v: unknown, d = 0) => { const x = Number(v); return isFinite(x) ? x : d; };
const usd = (x: number) => `$${(Math.round(x * 100) / 100).toLocaleString()}`;
const egp = (x: number) => `${Math.round(x).toLocaleString()} EGP`;

export function PayrollWorkbench() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [people, setPeople] = useState<Person[]>([]);
  const [prod, setProd] = useState<Record<string, Prod>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCfg, setShowCfg] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [{ data: ps }, { data: ap }] = await Promise.all([
      supabase.from("payroll_settings").select("config").eq("user_id", user.id).maybeSingle(),
      supabase.from("agent_pay").select("*").eq("user_id", user.id).order("position", { ascending: true }),
    ]);
    if (ps?.config) setCfg({ ...DEFAULT_CFG, ...(ps.config as Partial<Cfg>) });
    setPeople(((ap || []) as Person[]).map(p => ({ ...p, extras: (p.extras || {}) as Extras })));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Pull production for the selected dates.
  const loadProd = useCallback(async () => {
    const { data } = await supabase.from("leads")
      .select("agent_name, status, submission_date")
      .gte("submission_date", cfg.periodStart).lte("submission_date", cfg.periodEnd);
    const m: Record<string, Prod> = {};
    for (const l of (data || []) as Array<{ agent_name: string | null; status: string }>) {
      const name = (l.agent_name || "").trim(); if (!name) continue;
      const s = (l.status || "").toLowerCase();
      const row = m[name] || { qualified: 0, total: 0 };
      row.total++;
      if (["hot", "warm", "cold"].includes(s)) row.qualified++;
      m[name] = row;
    }
    setProd(m);
  }, [cfg.periodStart, cfg.periodEnd]);
  useEffect(() => { loadProd(); }, [loadProd]);

  const setCfgK = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg(c => ({ ...c, [k]: v }));
  const patchPerson = (id: string, patch: Partial<Person>) =>
    setPeople(ps => ps.map(p => p.id === id ? { ...p, ...patch, _dirty: true } : p));
  const patchExtra = (id: string, k: keyof Extras, v: number) =>
    setPeople(ps => ps.map(p => p.id === id ? { ...p, extras: { ...p.extras, [k]: v }, _dirty: true } : p));

  const addPerson = (category: "caller" | "manager") =>
    setPeople(ps => [...ps, {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "", category, role: null, hourly_rate: category === "caller" ? 3 : 0,
      monthly_salary: category === "manager" ? 12000 : 0, payment_method: "Instapay",
      payment_info: "", color: null, email: null, extras: {}, position: ps.length, _dirty: true, _new: true,
    }]);
  const removePerson = async (id: string) => {
    const p = people.find(x => x.id === id);
    setPeople(ps => ps.filter(x => x.id !== id));
    if (p && !p._new) await supabase.from("agent_pay").delete().eq("id", id);
  };

  const seedFromCallers = async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data } = await supabase.from("cold_callers").select("name, email, shift_type").eq("user_id", user.id).eq("is_active", true);
    const existing = new Set(people.map(p => p.name.trim().toLowerCase()));
    const adds: Person[] = [];
    (data || []).forEach((c: { name: string | null; email: string | null }, i) => {
      const nm = (c.name || "").trim(); if (!nm || existing.has(nm.toLowerCase())) return;
      adds.push({ id: `new-${Date.now()}-${i}`, name: nm, category: "caller", role: "RE Telemarketing Agent",
        hourly_rate: 3, monthly_salary: 0, payment_method: "Instapay", payment_info: "", color: null,
        email: c.email, extras: {}, position: people.length + i, _dirty: true, _new: true });
    });
    if (adds.length) setPeople(ps => [...ps, ...adds]);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    setSaving(true);
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (prof?.organization_id as string) ?? null;
    await supabase.from("payroll_settings").upsert({ user_id: user.id, organization_id: orgId, config: cfg, updated_at: new Date().toISOString() });
    for (const p of people.filter(x => x._dirty)) {
      const payload = {
        user_id: user.id, organization_id: orgId, name: p.name.trim() || "Unnamed", category: p.category, role: p.role,
        hourly_rate: n(p.hourly_rate), monthly_salary: n(p.monthly_salary), payment_method: p.payment_method,
        payment_info: p.payment_info, color: p.color, email: p.email, extras: p.extras, position: p.position,
      };
      if (p._new) await supabase.from("agent_pay").insert(payload);
      else await supabase.from("agent_pay").update(payload).eq("id", p.id);
    }
    setSaving(false);
    await load();
  };

  // ── Derived pay per person ──
  const calc = (p: Person) => {
    const e = p.extras || {};
    const pr = prod[p.name.trim()] || { qualified: 0, total: 0 };
    if (p.category === "caller") {
      const worked = n(e.worked);
      const baseUsd = worked * n(p.hourly_rate);
      const tgt = n(e.tgt) || 0;
      const act = pr.qualified;
      const attain = tgt > 0 ? (act / tgt) * 100 : 0;
      const span = Math.max(1, 100 - cfg.kpiThreshold);
      const kpiUsd = attain <= cfg.kpiThreshold ? 0 : Math.min(cfg.kpiFullPayUsd, cfg.kpiFullPayUsd * (attain - cfg.kpiThreshold) / span);
      const leadBonusUsd = act * cfg.leadBonusUsd;
      const otUsd = n(e.otHrs) * n(p.hourly_rate) * cfg.otMultiplier;
      const totalUsd = baseUsd + kpiUsd + leadBonusUsd + otUsd + n(e.manualUsd);
      const spiffEgp = n(e.fridayCount) * cfg.fridaySpiffEgp + n(e.referralEgp) + n(e.manualEgp);
      const finalEgp = totalUsd * cfg.usdEgp + spiffEgp;
      return { worked, baseUsd, tgt, act, attain, kpiUsd, leadBonusUsd, otUsd, totalUsd, spiffEgp, finalEgp, totalEgp: 0 };
    } else {
      const deducted = n(e.deductedDays);
      const baseEgp = cfg.businessDays > 0 ? n(p.monthly_salary) * Math.max(0, cfg.businessDays - deducted) / cfg.businessDays : 0;
      const quality = e.qualityPct != null ? n(e.qualityPct) : (pr.total > 0 ? (pr.qualified / pr.total) * 100 : 0);
      const kpiEgp = quality >= cfg.mgrQualityTarget ? cfg.mgrKpiBonusEgp : 0;
      const mgrHourly = cfg.businessDays * cfg.sessionHrs > 0 ? n(p.monthly_salary) / (cfg.businessDays * cfg.sessionHrs) : 0;
      const otEgp = n(e.otHrs) * mgrHourly * cfg.otMultiplier;
      const totalEgp = baseEgp + kpiEgp + otEgp + n(e.manualEgp);
      return { baseEgp, deducted, quality, kpiEgp, otEgp, totalEgp, finalEgp: totalEgp, totalUsd: 0, spiffEgp: 0 };
    }
  };

  const callers = people.filter(p => p.category === "caller");
  const managers = people.filter(p => p.category === "manager");

  const totals = useMemo(() => {
    let usdT = 0, egpT = 0, spiffT = 0, mgrEgp = 0, netEgp = 0;
    for (const p of people) {
      const c = calc(p);
      if (p.category === "caller") { usdT += c.totalUsd || 0; spiffT += c.spiffEgp || 0; }
      else mgrEgp += c.totalEgp || 0;
      netEgp += c.finalEgp || 0;
    }
    egpT = usdT * cfg.usdEgp + spiffT + mgrEgp;
    return { usdT, spiffT, mgrEgp, egpT, netEgp };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, prod, cfg]);

  const exportCSV = () => {
    const rows: string[][] = [["Name", "Category", "Method", "Info", "USD", "Spiff/Referral EGP", "Final Net EGP"]];
    for (const p of people) {
      const c = calc(p);
      rows.push([p.name, p.category, p.payment_method || "", p.payment_info || "",
        String(Math.round((c.totalUsd || 0) * 100) / 100), String(Math.round(c.spiffEgp || 0)), String(Math.round(c.finalEgp || 0))]);
    }
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `payroll-${cfg.periodStart}_${cfg.periodEnd}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const dirty = people.some(p => p._dirty);
  const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border-2)", background: "#fff", color: NAVY, fontSize: 12.5, outline: "none" };
  const numCell: React.CSSProperties = { ...inp, width: 72, textAlign: "right" };
  const th: React.CSSProperties = { padding: "9px 10px", textAlign: "left", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", color: SLATE, textTransform: "uppercase", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "7px 10px", fontSize: 12.5, color: NAVY, whiteSpace: "nowrap" };

  if (loading) return <div style={{ padding: 50, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: SKY600 }} /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(5,150,105,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={18} color={MONEY} /></span>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 900, color: NAVY }}>Payroll Workbench</h2>
            <p style={{ fontSize: 12, color: SLATE }}>Every number, date &amp; payment is adjustable. Callers in USD · Managers in EGP.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowCfg(s => !s)} className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Settings2 size={13} /> {showCfg ? "Hide" : "Settings"}</button>
          <button onClick={() => loadProd()} className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><RefreshCw size={13} /> Refresh leads</button>
          <button onClick={exportCSV} className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Download size={13} /> Export</button>
          <button onClick={save} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, background: dirty ? MONEY : "#94A3B8", color: "#fff", border: "none", fontSize: 12.5, fontWeight: 800, cursor: saving ? "wait" : "pointer" }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save all
          </button>
        </div>
      </div>

      {/* CONFIG — every knob adjustable */}
      {showCfg && (
        <div style={{ background: "#F8FAFC", border: "1px solid var(--border-2)", borderRadius: 14, padding: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", color: SKY600, textTransform: "uppercase", marginBottom: 12 }}>Payroll settings (adjust freely)</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            <Field label="Period start"><input type="date" value={cfg.periodStart} onChange={e => setCfgK("periodStart", e.target.value)} style={inp} /></Field>
            <Field label="Period end"><input type="date" value={cfg.periodEnd} onChange={e => setCfgK("periodEnd", e.target.value)} style={inp} /></Field>
            <Field label="Business days"><input type="number" value={cfg.businessDays} onChange={e => setCfgK("businessDays", n(e.target.value))} style={inp} /></Field>
            <Field label="Session hrs / day"><input type="number" value={cfg.sessionHrs} onChange={e => setCfgK("sessionHrs", n(e.target.value))} style={inp} /></Field>
            <Field label="USD → EGP rate"><input type="number" value={cfg.usdEgp} onChange={e => setCfgK("usdEgp", n(e.target.value))} style={inp} /></Field>
            <Field label="KPI threshold %"><input type="number" value={cfg.kpiThreshold} onChange={e => setCfgK("kpiThreshold", n(e.target.value))} style={inp} /></Field>
            <Field label="KPI full pay (USD)"><input type="number" value={cfg.kpiFullPayUsd} onChange={e => setCfgK("kpiFullPayUsd", n(e.target.value))} style={inp} /></Field>
            <Field label="Lead bonus / qual (USD)"><input type="number" value={cfg.leadBonusUsd} onChange={e => setCfgK("leadBonusUsd", n(e.target.value))} style={inp} /></Field>
            <Field label="OT multiplier"><input type="number" step="0.1" value={cfg.otMultiplier} onChange={e => setCfgK("otMultiplier", n(e.target.value))} style={inp} /></Field>
            <Field label="Friday spiff (EGP)"><input type="number" value={cfg.fridaySpiffEgp} onChange={e => setCfgK("fridaySpiffEgp", n(e.target.value))} style={inp} /></Field>
            <Field label="Mgr quality target %"><input type="number" value={cfg.mgrQualityTarget} onChange={e => setCfgK("mgrQualityTarget", n(e.target.value))} style={inp} /></Field>
            <Field label="Mgr KPI bonus (EGP)"><input type="number" value={cfg.mgrKpiBonusEgp} onChange={e => setCfgK("mgrKpiBonusEgp", n(e.target.value))} style={inp} /></Field>
          </div>
        </div>
      )}

      {/* Totals band */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="Callers (USD)" value={usd(totals.usdT)} accent={SKY600} />
        <Stat label="Spiffs/Referral (EGP)" value={egp(totals.spiffT)} accent="#EA580C" />
        <Stat label="Managers (EGP)" value={egp(totals.mgrEgp)} accent="#7C3AED" />
        <Stat label="Grand net payout (EGP)" value={egp(totals.netEgp)} accent={MONEY} />
      </div>

      {/* CALLERS TRACK */}
      <Section title={`Callers — USD (${callers.length})`} onAdd={() => addPerson("caller")} extra={
        <button onClick={seedFromCallers} className="btn-ghost" style={{ padding: "6px 10px", fontSize: 11.5 }}>Import from agents</button>
      }>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
          <thead><tr style={{ background: "var(--surface-3)" }}>
            {["Name", "Rate/hr", "Worked hrs", "Base USD", "TGT", "ACT", "KPI %", "KPI USD", "Lead bon", "OT hrs", "OT USD", "Fri ×", "Referral EGP", "Total USD", "Method", "Info", ""].map((h, i) =>
              <th key={i} style={{ ...th, textAlign: i >= 1 && i <= 13 ? "right" : "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {callers.map(p => { const c = calc(p); return (
              <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td style={td}><input value={p.name} onChange={e => patchPerson(p.id, { name: e.target.value })} placeholder="Name" style={{ ...inp, width: 150 }} /></td>
                <td style={td}><input type="number" value={p.hourly_rate} onChange={e => patchPerson(p.id, { hourly_rate: n(e.target.value) })} style={numCell} /></td>
                <td style={td}><input type="number" value={p.extras.worked ?? ""} onChange={e => patchExtra(p.id, "worked", n(e.target.value))} style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{usd(c.baseUsd || 0)}</td>
                <td style={td}><input type="number" value={p.extras.tgt ?? ""} onChange={e => patchExtra(p.id, "tgt", n(e.target.value))} style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{c.act}</td>
                <td style={{ ...td, textAlign: "right", color: (c.attain || 0) >= cfg.kpiThreshold ? MONEY : "#DC2626" }}>{Math.round(c.attain || 0)}%</td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{usd(c.kpiUsd || 0)}</td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{usd(c.leadBonusUsd || 0)}</td>
                <td style={td}><input type="number" value={p.extras.otHrs ?? ""} onChange={e => patchExtra(p.id, "otHrs", n(e.target.value))} style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{usd(c.otUsd || 0)}</td>
                <td style={td}><input type="number" value={p.extras.fridayCount ?? ""} onChange={e => patchExtra(p.id, "fridayCount", n(e.target.value))} style={{ ...numCell, width: 52 }} /></td>
                <td style={td}><input type="number" value={p.extras.referralEgp ?? ""} onChange={e => patchExtra(p.id, "referralEgp", n(e.target.value))} style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", fontWeight: 900, color: MONEY }}>{usd(c.totalUsd || 0)}</td>
                <td style={td}><select value={p.payment_method || ""} onChange={e => patchPerson(p.id, { payment_method: e.target.value })} style={{ ...inp, width: 110 }}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select></td>
                <td style={td}><input value={p.payment_info || ""} onChange={e => patchPerson(p.id, { payment_info: e.target.value })} placeholder="handle / phone" style={{ ...inp, width: 150 }} /></td>
                <td style={td}><button onClick={() => removePerson(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}><Trash2 size={14} /></button></td>
              </tr>
            ); })}
            {callers.length === 0 && <tr><td colSpan={17} style={{ ...td, textAlign: "center", color: SLATE, padding: 18 }}>No callers yet — add one or import from your agents.</td></tr>}
          </tbody>
        </table>
      </Section>

      {/* MANAGERS TRACK */}
      <Section title={`Managers — EGP (${managers.length})`} onAdd={() => addPerson("manager")}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead><tr style={{ background: "var(--surface-3)" }}>
            {["Name", "Monthly EGP", "Deduct days", "Base EGP", "Quality %", "KPI EGP", "OT hrs", "OT EGP", "Total EGP", "Method", "Info", ""].map((h, i) =>
              <th key={i} style={{ ...th, textAlign: i >= 1 && i <= 8 ? "right" : "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {managers.map(p => { const c = calc(p); return (
              <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td style={td}><input value={p.name} onChange={e => patchPerson(p.id, { name: e.target.value })} placeholder="Name" style={{ ...inp, width: 160 }} /></td>
                <td style={td}><input type="number" value={p.monthly_salary} onChange={e => patchPerson(p.id, { monthly_salary: n(e.target.value) })} style={{ ...numCell, width: 90 }} /></td>
                <td style={td}><input type="number" value={p.extras.deductedDays ?? ""} onChange={e => patchExtra(p.id, "deductedDays", n(e.target.value))} style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{egp(c.baseEgp || 0)}</td>
                <td style={td}><input type="number" value={p.extras.qualityPct ?? ""} placeholder={String(Math.round(c.quality || 0))} onChange={e => patchExtra(p.id, "qualityPct", n(e.target.value))} style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", color: (c.quality || 0) >= cfg.mgrQualityTarget ? MONEY : SLATE }}>{egp(c.kpiEgp || 0)}</td>
                <td style={td}><input type="number" value={p.extras.otHrs ?? ""} onChange={e => patchExtra(p.id, "otHrs", n(e.target.value))} style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{egp(c.otEgp || 0)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 900, color: "#7C3AED" }}>{egp(c.totalEgp || 0)}</td>
                <td style={td}><select value={p.payment_method || ""} onChange={e => patchPerson(p.id, { payment_method: e.target.value })} style={{ ...inp, width: 110 }}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select></td>
                <td style={td}><input value={p.payment_info || ""} onChange={e => patchPerson(p.id, { payment_info: e.target.value })} placeholder="handle / phone" style={{ ...inp, width: 150 }} /></td>
                <td style={td}><button onClick={() => removePerson(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}><Trash2 size={14} /></button></td>
              </tr>
            ); })}
            {managers.length === 0 && <tr><td colSpan={12} style={{ ...td, textAlign: "center", color: SLATE, padding: 18 }}>No managers yet — add one.</td></tr>}
          </tbody>
        </table>
      </Section>

      {/* PAYMENT SUMMARY */}
      <Section title="Payment Summary — net payout (EGP)">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr style={{ background: "var(--surface-3)" }}>
            {["Name", "Category", "Method", "Info", "USD", "Spiff/Ref EGP", "Final Net EGP"].map((h, i) =>
              <th key={i} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {people.map(p => { const c = calc(p); return (
              <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td style={{ ...td, fontWeight: 700 }}>{p.name || "—"}</td>
                <td style={{ ...td, color: SLATE, textTransform: "capitalize" }}>{p.category}</td>
                <td style={{ ...td, color: SLATE }}>{p.payment_method || "—"}</td>
                <td style={{ ...td, color: SLATE }}>{p.payment_info || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{p.category === "caller" ? usd(c.totalUsd || 0) : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{c.spiffEgp ? egp(c.spiffEgp) : "—"}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 900, color: MONEY }}>{egp(c.finalEgp || 0)}</td>
              </tr>
            ); })}
          </tbody>
          <tfoot><tr style={{ borderTop: "2px solid var(--border-2)", background: "var(--surface-3)" }}>
            <td style={{ ...td, fontWeight: 900 }} colSpan={4}>Grand totals</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 900 }}>{usd(totals.usdT)}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 900 }}>{egp(totals.spiffT)}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 900, color: MONEY }}>{egp(totals.netEgp)}</td>
          </tr></tfoot>
        </table>
      </Section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: SLATE, display: "block", marginBottom: 4 }}>{label}</label>{children}</div>;
}
function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 12, padding: "12px 14px", borderTop: `3px solid ${accent}` }}>
    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", color: SLATE, textTransform: "uppercase", marginBottom: 5 }}>{label}</p>
    <p style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>{value}</p>
  </div>;
}
function Section({ title, children, onAdd, extra }: { title: string; children: React.ReactNode; onAdd?: () => void; extra?: React.ReactNode }) {
  return <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--border-1)" }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>{title}</p>
      <div style={{ display: "flex", gap: 8 }}>
        {extra}
        {onAdd && <button onClick={onAdd} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: SKY, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Plus size={13} /> Add</button>}
      </div>
    </div>
    <div style={{ overflowX: "auto" }}>{children}</div>
  </div>;
}
