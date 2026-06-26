"use client";

// Fully customizable payroll workbench — built for real call-center payroll
// sheet, but every number/date/payment is user-editable and nothing is hardcoded.
//   • Config panel: custom period dates, business days, session hrs, USD↔EGP rate,
//     KPI threshold + pay, lead bonus, OT multiplier, Friday spiff, manager quality
//     target + KPI bonus — all adjustable, persisted to payroll_settings.
//   • Two tracks: Callers (USD, hourly) and Managers (EGP, monthly salary).
//   • Payment Summary: per-person net payout in EGP, grouped totals.
// People + their per-person numbers live in agent_pay. Production (leads) is
// auto-pulled for the selected dates but every figure can be overridden.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus, Trash2, Save, Users, Download, RefreshCw, Settings2, Upload, Clock, Lock } from "lucide-react";
import { parsePayableHours } from "@/app/_components/DialerHoursCalculator";
import { computeHourly, SHIFT_HOURS } from "@/app/_components/CompensationStructure";

// Role rates pulled live from comp_titles (the Role Salaries page). The
// workbench reads these and shows them as locked — to change hourly, edit
// Role Salaries.
type RoleRate = {
  title: string;
  base_salary: number;
  currency: "USD" | "EGP";
  shift_type: "full_time" | "part_time";
  working_days: number;
  hourly: number;
  kpi_bonus: number;
  target_leads: number;
};

const SKY = "#3B82F6", SKY600 = "#2563EB", MONEY = "#2563EB", NAVY = "#FFFFFF", SLATE = "#D7DAE6";
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
const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const toISO = (s: string): string | null => {
  const t = (s || "").trim(); if (!t) return null;
  const d = new Date(t); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// Smart parse of an uploaded sheet — a one-shot import that detects hours AND the
// full pay roster (role, category, rate/salary, email, color, payment method/info,
// from-to dates) by header keywords, in any column order. Quote-aware so payment
// links with commas survive.
type RosterRow = {
  name: string; hours: number | null; rate: number | null; salary: number | null;
  role: string | null; category: "caller" | "manager" | null;
  email: string | null; color: string | null; method: string | null; info: string | null;
};
type RosterParse = { rows: RosterRow[]; from: string | null; to: string | null };
function splitCsvLine(l: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  }
  out.push(cur); return out.map(x => x.trim());
}
function parseHoursSheet(text: string): RosterParse {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\r$/, "")).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], from: null, to: null };
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const find = (...keys: string[]) => head.findIndex(h => keys.some(k => h.includes(k)));
  const nameI = find("name", "agent", "employee");
  let hoursI = head.findIndex(h => h.includes("payable") && h.includes("hour"));
  if (hoursI < 0) hoursI = find("worked", "hours", "payable", "hrs");
  const rateI = find("hourly", "rate");
  const salaryI = find("monthly", "salary");
  const roleI = find("role", "title", "position");
  const catI = find("category", "type");
  const emailI = find("email", "e-mail");
  const colorI = find("color", "colour", "hex");
  const methodI = find("payment method", "method", "pay method");
  const infoI = find("payment info", "info", "handle", "wallet", "account");
  const fromI = find("from", "start", "period start");
  const toI = find("to", "end", "period end");
  let from: string | null = null, to: string | null = null;
  const at = (c: string[], i: number) => i >= 0 ? (c[i] || "").trim() : "";
  const rows = lines.slice(1).map(splitCsvLine).map(c => {
    if (fromI >= 0 && !from) from = toISO(at(c, fromI));
    if (toI >= 0 && !to) to = toISO(at(c, toI));
    const catRaw = at(c, catI).toLowerCase();
    const salary = salaryI >= 0 && at(c, salaryI) ? n(at(c, salaryI), 0) || null : null;
    const category: "caller" | "manager" | null =
      catRaw.includes("manager") || catRaw.includes("mgr") ? "manager"
      : catRaw.includes("caller") || catRaw.includes("agent") ? "caller"
      : salary && !at(c, rateI) ? "manager" : (catI >= 0 || salaryI >= 0 ? "caller" : null);
    return {
      name: at(c, nameI),
      hours: hoursI >= 0 && at(c, hoursI) ? parsePayableHours(at(c, hoursI)) : null,
      rate: rateI >= 0 && at(c, rateI) ? n(at(c, rateI), 0) || null : null,
      salary, role: at(c, roleI) || null, category,
      email: at(c, emailI) || null, color: at(c, colorI) || null,
      method: at(c, methodI) || null, info: at(c, infoI) || null,
    };
  }).filter(r => r.name || r.hours != null);
  return { rows, from, to };
}

export function PayrollWorkbench() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [people, setPeople] = useState<Person[]>([]);
  const [prod, setProd] = useState<Record<string, Prod>>({});
  const [roleRates, setRoleRates] = useState<Record<string, RoleRate>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCfg, setShowCfg] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [{ data: ps }, { data: ap }, { data: rt }] = await Promise.all([
      supabase.from("payroll_settings").select("config").eq("user_id", user.id).maybeSingle(),
      supabase.from("agent_pay").select("*").eq("user_id", user.id).order("position", { ascending: true }),
      supabase.from("comp_titles").select("title, base_salary, basis").eq("user_id", user.id),
    ]);
    if (ps?.config) setCfg({ ...DEFAULT_CFG, ...(ps.config as Partial<Cfg>) });
    setPeople(((ap || []) as Person[]).map(p => ({ ...p, extras: (p.extras || {}) as Extras })));

    // Build the role rate map keyed by lowercased title.
    const map: Record<string, RoleRate> = {};
    (rt || []).forEach((r: { title: string | null; base_salary: number | null; basis: string | null }) => {
      const title = (r.title || "").trim(); if (!title) return;
      const basisObj = (() => { try { return JSON.parse(r.basis || ""); } catch { return null; } })() || {};
      const basic = Number(r.base_salary) || 0;
      const shift_type: "full_time" | "part_time" = basisObj.shift_type === "part_time" ? "part_time" : "full_time";
      const working_days = Number(basisObj.working_days) || 22;
      const currency: "USD" | "EGP" = basisObj.currency === "EGP" ? "EGP" : "USD";
      map[title.toLowerCase()] = {
        title, base_salary: basic, currency, shift_type, working_days,
        hourly: computeHourly(basic, working_days, shift_type),
        kpi_bonus: Number(basisObj.kpi_bonus) || 0,
        target_leads: Number(basisObj.target_leads) || 0,
      };
    });
    setRoleRates(map);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Look up role rate by person's role field (case-insensitive). Falls back to
  // 0 if the role doesn't exist in the Role Salaries page.
  const rateFor = useCallback((person: Person): RoleRate | null => {
    const role = (person.role || "").trim().toLowerCase();
    if (!role) return null;
    return roleRates[role] || null;
  }, [roleRates]);

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

  // Spread the roster (hours + every provided field) into the people rows. Matches
  // existing people by name; creates a row for anyone new. Only overwrites a field
  // when the sheet actually provides it, so manual edits aren't clobbered.
  const mergeHours = (parsed: Partial<RosterRow>[]) => {
    setPeople(prev => {
      const out = [...prev];
      const idxByName = new Map(out.map((p, i) => [norm(p.name), i]));
      let pos = out.length;
      for (const r of parsed) {
        const key = norm(r.name || "");
        const cat: "caller" | "manager" = (r.category as "caller" | "manager") || "caller";
        if (key && idxByName.has(key)) {
          const i = idxByName.get(key)!; const p = out[i];
          out[i] = {
            ...p,
            category: r.category || p.category,
            role: r.role ?? p.role,
            hourly_rate: r.rate ?? p.hourly_rate,
            monthly_salary: r.salary ?? p.monthly_salary,
            payment_method: r.method ?? p.payment_method,
            payment_info: r.info ?? p.payment_info,
            email: r.email ?? p.email,
            color: r.color ?? p.color,
            extras: r.hours != null ? { ...p.extras, worked: Math.round(r.hours * 100) / 100 } : p.extras,
            _dirty: true,
          };
        } else {
          out.push({
            id: `new-${Date.now()}-${pos}-${Math.random().toString(36).slice(2, 5)}`,
            name: (r.name || "").trim(), category: cat, role: r.role ?? (cat === "manager" ? "Manager" : "RE Telemarketing Agent"),
            hourly_rate: r.rate ?? (cat === "caller" ? 3 : 0), monthly_salary: r.salary ?? (cat === "manager" ? 12000 : 0),
            payment_method: r.method ?? "Instapay", payment_info: r.info ?? "", color: r.color ?? null, email: r.email ?? null,
            extras: r.hours != null ? { worked: Math.round(r.hours * 100) / 100 } : {}, position: pos++, _dirty: true, _new: true,
          });
          if (key) idxByName.set(key, out.length - 1);
        }
      }
      return out;
    });
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const onHoursFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const { rows: parsed, from, to } = parseHoursSheet(await f.text());
    if (!parsed.length) { alert('Could not read the sheet. It needs a Name column and a "Payable Hours" (or Worked/Hours) column.'); }
    else {
      mergeHours(parsed);
      if (from || to) setCfg(c => ({ ...c, periodStart: from || c.periodStart, periodEnd: to || c.periodEnd }));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  // Pull worked hours from the saved Dialer Hours (uploaded in the calculator below).
  const syncDialer = async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data } = await supabase.from("dialer_hours").select("employee_name, payable_hours_raw, rate").eq("user_id", user.id);
    const parsed = (data || []).map((d: { employee_name: string | null; payable_hours_raw: string | null; rate: number | null }) => ({
      name: d.employee_name || "", hours: parsePayableHours(d.payable_hours_raw || ""), rate: d.rate != null ? Number(d.rate) : null,
    })).filter(r => r.name || r.hours);
    if (!parsed.length) { alert("No saved dialer hours found. Upload an hours sheet first."); return; }
    mergeHours(parsed);
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

  // ── Derived pay per person — all rates pulled from Role Salaries ──
  const calc = (p: Person) => {
    const e = p.extras || {};
    const rate = rateFor(p);
    const role = rate; // alias for clarity
    const pr = prod[p.name.trim()] || { qualified: 0, total: 0 };
    const worked = n(e.worked);
    const otHrs = n(e.otHrs);
    const act = pr.qualified;
    const manualKpi = n(e.manualUsd); // reused as the manual KPI bonus field

    // No role found → just show zeros so user knows to set up Role Salaries.
    if (!role) {
      return {
        worked, baseUsd: 0, baseEgp: 0, hourly: 0, currency: "USD" as const,
        act, kpiBonus: manualKpi, otPay: 0, totalNative: 0, totalEgp: 0,
        finalEgp: 0, totalUsd: 0, spiffEgp: 0, missingRole: true,
      };
    }

    const hourly = role.hourly;
    const basePay = worked * hourly;
    const otPay = otHrs * hourly * cfg.otMultiplier;
    const kpiBonus = manualKpi || role.kpi_bonus;
    const totalNative = basePay + otPay + kpiBonus;

    // Convert to EGP for the unified totals view.
    const totalEgp = role.currency === "USD" ? totalNative * cfg.usdEgp : totalNative;
    const spiffEgp = n(e.fridayCount) * cfg.fridaySpiffEgp + n(e.referralEgp) + n(e.manualEgp);
    const finalEgp = totalEgp + spiffEgp;

    return {
      worked, hourly, currency: role.currency, act, basePay, otPay, kpiBonus,
      totalNative, totalEgp, finalEgp, spiffEgp, missingRole: false,
      // Compatibility shims for existing tfoot/export references:
      baseUsd: role.currency === "USD" ? basePay : 0,
      baseEgp: role.currency === "EGP" ? basePay : 0,
      totalUsd: role.currency === "USD" ? totalNative : 0,
    };
  };

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
  const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border-2)", background: "#FFFFFF", color: NAVY, fontSize: 12.5, outline: "none" };
  const numCell: React.CSSProperties = { ...inp, width: 72, textAlign: "right" };
  const th: React.CSSProperties = { padding: "9px 10px", textAlign: "left", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", color: SLATE, textTransform: "uppercase", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "7px 10px", fontSize: 12.5, color: NAVY, whiteSpace: "nowrap" };

  if (loading) return <div style={{ padding: 50, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: SKY600 }} /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(10,95,82,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={18} color={MONEY} /></span>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 900, color: NAVY }}>Payroll Workbench</h2>
            <p style={{ fontSize: 12, color: SLATE }}>Upload one sheet — agents, hours, roles, rates/salaries, payment method &amp; info, and the pay period all auto-fill. Every field stays adjustable.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={onHoursFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: SKY, color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}><Upload size={13} /> Upload sheet</button>
          <button onClick={syncDialer} className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Clock size={13} /> Sync dialer hours</button>
          <button onClick={() => {
            const csv = "Name,Role,Category,Monthly Salary,Hourly Rate,Payable Hours,Email,Color,Payment Method,Payment Info,From,To\n"
              + '"Jane Doe","RE Telemarketing Agent","Caller","","3","177 Hours 50 Mins.","jane@x.com","#3B82F6","Instapay","jane@instapay","2026-06-01","2026-06-22"\n'
              + '"John Manager","Team Leader","Manager","18000","","","john@x.com","#2563EB","Payoneer","john@payoneer","2026-06-01","2026-06-22"';
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "payroll-roster-template.csv"; a.click(); URL.revokeObjectURL(url);
          }} className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Download size={13} /> Template</button>
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
        <div style={{ background: "#F1F2F8", border: "1px solid var(--border-2)", borderRadius: 14, padding: 16 }}>
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
        <Stat label="Managers (EGP)" value={egp(totals.mgrEgp)} accent="#2563EB" />
        <Stat label="Grand net payout (EGP)" value={egp(totals.netEgp)} accent={MONEY} />
      </div>

      {/* UNIFIED TEAM TABLE — only Name, Role, Hours, KPI, Payment fields editable.
          Hourly rate is pulled from Role Salaries and shown locked. */}
      <Section title={`Team (${people.length})`} onAdd={() => addPerson("caller")} extra={
        <button onClick={seedFromCallers} className="btn-ghost" style={{ padding: "6px 10px", fontSize: 11.5 }}>Import agents</button>
      }>
        {Object.keys(roleRates).length === 0 && (
          <div style={{ padding: "12px 14px", margin: "10px 14px", borderRadius: 8, background: "rgba(245,158,11,0.12)", border: "1px solid #FCD34D", color: "#F59E0B", fontSize: 12.5, fontWeight: 600 }}>
            No roles defined yet. Go to <strong>Role Salaries</strong> and set up at least one role (e.g. Caller, Team Leader) so hourly rates can be computed.
          </div>
        )}
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead><tr style={{ background: "var(--surface-3)" }}>
            {["Name", "Role", "Hourly", "Worked hrs", "OT hrs", "Base", "KPI bonus", "OT pay", "Total", "Net EGP", "Method", "Info", ""].map((h, i) =>
              <th key={i} style={{ ...th, textAlign: i >= 2 && i <= 9 ? "right" : "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {people.map(p => { const c = calc(p); const rate = rateFor(p); const cur = rate?.currency || "USD"; const fmt = (v: number) => cur === "USD" ? usd(v) : egp(v); return (
              <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td style={td}><input value={p.name} onChange={e => patchPerson(p.id, { name: e.target.value })} placeholder="Name" style={{ ...inp, width: 160 }} /></td>
                <td style={td}>
                  <select value={p.role || ""}
                    onChange={e => {
                      const newRole = e.target.value;
                      const r = roleRates[newRole.toLowerCase()];
                      // Auto-classify: managers based on monthly EGP salary, callers on hourly.
                      patchPerson(p.id, {
                        role: newRole || null,
                        category: r && r.currency === "EGP" ? "manager" : "caller",
                      });
                    }}
                    style={{ ...inp, width: 160 }}>
                    <option value="">— select role —</option>
                    {Object.values(roleRates).map(r => <option key={r.title} value={r.title}>{r.title}</option>)}
                  </select>
                </td>
                <td style={{ ...td, textAlign: "right", color: rate ? NAVY : "#DC2626" }} title={rate ? `Locked — edit in Role Salaries (Basic ${rate.base_salary} / ${rate.working_days}d / ${SHIFT_HOURS[rate.shift_type]}h)` : "Set a role to compute hourly"}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Lock size={10} color={SLATE} /> {rate ? fmt(rate.hourly) : "—"}
                  </span>
                </td>
                <td style={td}><input type="number" value={p.extras.worked ?? ""} onChange={e => patchExtra(p.id, "worked", n(e.target.value))} placeholder="hrs" style={numCell} /></td>
                <td style={td}><input type="number" value={p.extras.otHrs ?? ""} onChange={e => patchExtra(p.id, "otHrs", n(e.target.value))} placeholder="hrs" style={numCell} /></td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{fmt(c.basePay || 0)}</td>
                <td style={td}>
                  <input type="number" value={p.extras.manualUsd ?? ""}
                    onChange={e => patchExtra(p.id, "manualUsd", n(e.target.value))}
                    placeholder={rate ? String(Math.round(rate.kpi_bonus)) : "—"}
                    title="Manual KPI bonus override (leave blank to use role default)"
                    style={numCell} />
                </td>
                <td style={{ ...td, textAlign: "right", color: SLATE }}>{fmt(c.otPay || 0)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, color: NAVY }}>{fmt(c.totalNative || 0)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 900, color: MONEY }}>{egp(c.finalEgp || 0)}</td>
                <td style={td}><select value={p.payment_method || ""} onChange={e => patchPerson(p.id, { payment_method: e.target.value })} style={{ ...inp, width: 110 }}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select></td>
                <td style={td}><input value={p.payment_info || ""} onChange={e => patchPerson(p.id, { payment_info: e.target.value })} placeholder="handle / phone" style={{ ...inp, width: 140 }} /></td>
                <td style={td}><button onClick={() => removePerson(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}><Trash2 size={14} /></button></td>
              </tr>
            ); })}
            {people.length === 0 && <tr><td colSpan={13} style={{ ...td, textAlign: "center", color: SLATE, padding: 18 }}>No team members yet — add a user or import from your agents.</td></tr>}
          </tbody>
          <tfoot><tr style={{ borderTop: "2px solid var(--border-2)", background: "var(--surface-3)" }}>
            <td style={{ ...td, fontWeight: 900 }} colSpan={9}>Grand total</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 900, color: MONEY }}>{egp(totals.netEgp)}</td>
            <td colSpan={3} />
          </tr></tfoot>
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
