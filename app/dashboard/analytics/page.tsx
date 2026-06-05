"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2, TrendingUp, Flame, Sun, Snowflake, PhoneOutgoing,
  XCircle, Copy, AlertCircle,
} from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.navy;
const SLATE = T.slate;

// EST "today" as YYYY-MM-DD (matches the submission_date the DB stamps).
function estDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}
function estShift(days: number): string {
  return estDate(new Date(Date.now() + days * 86_400_000));
}

type Lead = { status: string; stage: string | null; submission_date: string | null; created_at: string };

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
] as const;
type PresetKey = (typeof PRESETS)[number]["key"];

// Map the live text statuses into the KPI buckets.
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
const isHot  = (s: string) => norm(s) === "hot";
const isWarm = (s: string) => norm(s) === "warm";
const isCold = (s: string) => norm(s) === "cold";
const isCallback = (s: string) => norm(s) === "callback";
const isDisq = (s: string) => norm(s) === "disqualified";
const isDup  = (s: string) => norm(s) === "duplicate";

const STAGES = [
  { key: "new", label: "New", color: "#64748B" },
  { key: "contacted", label: "Contacted", color: "#2F6BFF" },
  { key: "negotiating", label: "Negotiating", color: "#7C3AED" },
  { key: "won", label: "Won", color: "#059669" },
  { key: "lost", label: "Lost", color: "#DC2626" },
];

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<PresetKey>("today");
  const [from, setFrom] = useState(estDate());
  const [to, setTo] = useState(estDate());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);

  // Resolve the active range from the preset.
  const range = (() => {
    if (preset === "today") return { from: estDate(), to: estDate() };
    if (preset === "7d") return { from: estShift(-6), to: estDate() };
    if (preset === "30d") return { from: estShift(-29), to: estDate() };
    return { from, to };
  })();

  const load = useCallback(async (r: { from: string; to: string }) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("leads")
      .select("status, stage, submission_date, created_at")
      .gte("submission_date", r.from)
      .lte("submission_date", r.to)
      .order("submission_date", { ascending: true });

    if (error) {
      if (/column .*submission_date.* does not exist/i.test(error.message)) setNeedsMigration(true);
      setLoading(false);
      return;
    }
    setLeads((data || []) as Lead[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(range); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [preset, from, to]);

  // KPI counts
  const total = leads.length;
  const hot = leads.filter((l) => isHot(l.status)).length;
  const warm = leads.filter((l) => isWarm(l.status)).length;
  const cold = leads.filter((l) => isCold(l.status)).length;
  const callback = leads.filter((l) => isCallback(l.status)).length;
  const disq = leads.filter((l) => isDisq(l.status)).length;
  const dup = leads.filter((l) => isDup(l.status)).length;
  const qualified = hot + warm + cold;
  const qualRate = total > 0 ? Math.round((qualified / total) * 100) : 0;

  const stageCounts = STAGES.map((s) => ({ ...s, n: leads.filter((l) => (l.stage || "new") === s.key).length }));
  const stageMax = Math.max(...stageCounts.map((s) => s.n), 1);

  const kpis = [
    { label: "Total Leads", value: total, icon: TrendingUp, color: NAVY, bg: "#F2F5F9" },
    { label: "Hot", value: hot, icon: Flame, color: "#DC2626", bg: "#FBEEE8" },
    { label: "Warm", value: warm, icon: Sun, color: "#EA580C", bg: "#FFF7ED" },
    { label: "Cold", value: cold, icon: Snowflake, color: "#0284C7", bg: "#F0F9FF" },
    { label: "Call Back", value: callback, icon: PhoneOutgoing, color: "#92400E", bg: "#FFFBEB" },
    { label: "Disqualified", value: disq, icon: XCircle, color: SLATE, bg: "#F1F4F9" },
    { label: "Duplicates", value: dup, icon: Copy, color: "#92400E", bg: "#EAF0FF" },
  ];

  if (needsMigration) {
    return (
      <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center", padding: 32, background: T.surface1, border: "1px solid rgba(35,43,58,0.1)", borderRadius: 14 }}>
        <AlertCircle size={28} color="#EA580C" style={{ margin: "0 auto 12px" }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Analytics not enabled yet</h2>
        <p style={{ fontSize: 13, color: SLATE, lineHeight: 1.6 }}>Run the CRM migrations to add <code>submission_date</code>.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Analytics</h1>
          <p style={{ fontSize: 13, color: SLATE }}>
            {range.from === range.to ? `${range.from} (EST)` : `${range.from} → ${range.to} (EST)`} · submission date
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)} style={{
              padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: preset === p.key ? NAVY : "#FFF",
              color: preset === p.key ? "#FFF" : NAVY,
              border: `1px solid ${preset === p.key ? NAVY : "rgba(35,43,58,0.12)"}`,
            }}>{p.label}</button>
          ))}
          {preset === "custom" && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(35,43,58,0.12)", fontSize: 12, color: NAVY }} />
              <span style={{ color: SLATE, fontSize: 12 }}>→</span>
              <input type="date" value={to} min={from} max={estDate()} onChange={(e) => setTo(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(35,43,58,0.12)", fontSize: 12, color: NAVY }} />
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: NAVY }} /></div>
      ) : (
        <>
          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} style={{ background: T.surface1, border: "1px solid rgba(35,43,58,0.08)", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(35,43,58,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: T.text3, textTransform: "uppercase" }}>{k.label}</span>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={14} color={k.color} />
                    </span>
                  </div>
                  <p style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</p>
                </div>
              );
            })}
            {/* Qual rate */}
            <div style={{ background: NAVY, borderRadius: 12, padding: 16, color: "#FFF" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.7, textTransform: "uppercase" }}>Qual. Rate</span>
              <p style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, marginTop: 10 }}>{qualRate}%</p>
              <p style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>{qualified} of {total} qualified</p>
            </div>
          </div>

          {/* Pipeline funnel */}
          <div style={{ background: T.surface1, border: "1px solid rgba(35,43,58,0.08)", borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>Pipeline by Stage</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stageCounts.map((s) => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 92, fontSize: 12, fontWeight: 700, color: NAVY }}>{s.label}</span>
                  <div style={{ flex: 1, height: 22, background: T.surface3, borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${(s.n / stageMax) * 100}%`, height: "100%", background: s.color, borderRadius: 6, transition: "width 0.5s ease", minWidth: s.n > 0 ? 4 : 0 }} />
                  </div>
                  <span style={{ width: 36, textAlign: "right", fontSize: 13, fontWeight: 800, color: s.color }}>{s.n}</span>
                </div>
              ))}
            </div>
            {total === 0 && (
              <p style={{ textAlign: "center", fontSize: 12, color: T.text3, marginTop: 14 }}>No leads in this date range.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
