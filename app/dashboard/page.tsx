"use client";

// Overview:
//   • Hero with brand-gradient pill + breathable spacing
//   • KPI scorecards w/ trend chips (▲ / ▼)
//   • Smooth curved-line chart + stacked-bar weekly comparison
//   • Recent Calls table with hover lift + magenta-on-hover
//   • Security strip at the foot for enterprise trust cues
//   • Scroll-reveal via .reveal (no JS, view-timeline API)

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { LeadDetailModal } from "@/app/_components/LeadDetailModal";
import { LeadsList } from "@/app/_components/LeadsList";
import { PageHeader } from "@/app/_components/PageHeader";
import { SetupBanner } from "@/app/_components/SetupBanner";
import { T } from "@/app/_components/tokens";
import {
  TrendingUp, TrendingDown, PhoneCall, CheckCircle2, XCircle,
  Zap, ArrowRight, RotateCcw, Loader2, ChevronDown, Sparkles,
} from "lucide-react";

interface Lead {
  id: string; campaign_id: string; user_id: string; status: string;
  extracted_address: string | null; asking_price: number | null;
  qualification_reason: string | null; created_at: string;
  agent_name?: string | null;
  metadata?: Record<string, unknown> | null;
  campaigns?: { name: string } | null;
}

const QUALIFIED_SET = ["Hot", "Warm", "Cold"];

// Status palette. Hot stays urgent-red because "Hot" is
// universal floor language for "drop everything." Cold goes slate (not sky)
// so it sits quietly inside the cream canvas without competing with brand.
const S_CFG: Record<string, { bg: string; color: string }> = {
  Hot:          { bg: "#FEE2E2", color: "#DC2626" },
  Warm:         { bg: "rgba(245,158,11,0.12)", color: "#B45309" },
  Cold:         { bg: "#F1F2F8", color: "#6B6880" },
  "Call Back":  { bg: "rgba(245,158,11,0.12)", color: "#F59E0B" },
  Disqualified: { bg: T.surface3 as string, color: T.slate as string },
  Duplicate:    { bg: "#F3E8FF", color: "#6B21A8" },
  Processing:   { bg: T.surface3 as string, color: T.slate as string },
  Commercial:   { bg: "#F3E8FF", color: "#6B21A8" },
  Error:        { bg: "#FEE2E2", color: "#DC2626" },
};
const STATUS_OPTS = ["Hot", "Warm", "Cold", "Call Back", "Disqualified", "Duplicate", "Processing", "Error"];

// ── Charts ──────────────────────────────────────────────────────────────
function CurvedArea({ data, height = 200, color = "#3B82F6", color2 = "#2563EB" }: {
  data: number[]; height?: number; color?: string; color2?: string;
}) {
  if (data.length < 2) return null;
  const W = 800; // viewBox width (scales fluidly via 100%)
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = W / (data.length - 1);

  const pts = data.map((v, i) => ({
    x: i * step,
    y: height - ((v - min) / range) * (height - 28) - 10,
  }));

  // Catmull-Rom → cubic Bezier for buttery curves.
  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  const area = `${path} L ${W} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="area-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color2} />
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d={area} fill="url(#area-fill)" />
      <path d={path} fill="none" stroke="url(#area-stroke)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
      {pts.map((p, i) => i === pts.length - 1 ? (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={9} fill={color} opacity={0.18} />
          <circle cx={p.x} cy={p.y} r={5} fill="#fff" stroke={color} strokeWidth={3} />
        </g>
      ) : null)}
    </svg>
  );
}

function StackedBars({ rows, height = 220 }: {
  rows: Array<{ label: string; hot: number; warm: number; cold: number }>;
  height?: number;
}) {
  const W = 800;
  const max = Math.max(...rows.map((r) => r.hot + r.warm + r.cold), 1);
  const barW = (W / rows.length) * 0.55;
  const gap = (W / rows.length) * 0.45;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {rows.map((r, i) => {
        const x = i * (W / rows.length) + gap / 2;
        const total = r.hot + r.warm + r.cold;
        const h = (total / max) * (height - 30);
        const hHot = (r.hot / max) * (height - 30);
        const hWarm = (r.warm / max) * (height - 30);
        const hCold = (r.cold / max) * (height - 30);
        let y = height - 14 - h;
        return (
          <g key={i}>
            {hHot > 0 && <rect x={x} y={y} width={barW} height={hHot} rx={6} fill="#DC2626" />}
            {hWarm > 0 && <rect x={x} y={y + hHot} width={barW} height={hWarm} rx={6} fill="#F59E0B" />}
            {hCold > 0 && <rect x={x} y={y + hHot + hWarm} width={barW} height={hCold} rx={6} fill="#6B6880" />}
            <text x={x + barW / 2} y={height - 2} textAnchor="middle" fontSize={11} fill="var(--text-2)" fontWeight={600}>{r.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TrendChip({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className={up ? "trend-up" : "trend-down"} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800,
    }}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}{value}{suffix}
    </span>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [email, setEmail]     = useState("");
  const [fullName, setFullName] = useState("");
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdating]   = useState<string | null>(null);
  const [rerunningId, setRerunning] = useState<string | null>(null);
  const [newIds, setNewIds]         = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setEmail(user?.email ?? "");
    if (user) {
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (prof?.full_name) setFullName(prof.full_name as string);
      const { data } = await supabase.from("leads").select("*, campaigns(name)")
        .eq("user_id", user.id).neq("status", "Processing")
        .order("created_at", { ascending: false }).limit(200);
      if (data) setLeads(data as Lead[]);
    }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const ch = supabase.channel(`leads-overview-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      ch.on("postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const row = payload.new as Lead | null;
          const oldRow = payload.old as Lead | null;
          if (payload.eventType === "DELETE") { setLeads(prev => prev.filter(l => l.id !== oldRow?.id)); return; }
          if (!row || row.status === "Processing") return;
          const { data: enriched } = await supabase.from("leads").select("*, campaigns(name)").eq("id", row.id).maybeSingle();
          if (!enriched) return;
          setLeads(prev => {
            const exists = prev.some(l => l.id === enriched.id);
            if (exists) return prev.map(l => l.id === enriched.id ? (enriched as Lead) : l);
            // Flag as NEW so the list glows it, then clear after the animation.
            setNewIds(s => { const n = new Set(s); n.add(enriched.id); return n; });
            setTimeout(() => setNewIds(s => { const n = new Set(s); n.delete(enriched.id); return n; }), 2200);
            return [enriched as Lead, ...prev].slice(0, 200);
          });
        }).subscribe();
      channel = ch;
    })();
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    await supabase.from("leads").update({ status }).eq("id", id);
    setLeads(p => p.map(l => l.id === id ? { ...l, status } : l));
    setUpdating(null);
  };
  const rerun = async (lead: Lead) => {
    setRerunning(lead.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/analyze/rerun", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ leadId: lead.id, campaignId: lead.campaign_id, userId: lead.user_id }),
      });
      if (res.ok) fetchData();
    } catch {}
    setRerunning(null);
  };

  // Metrics
  const total = leads.length;
  const qualified = leads.filter(l => QUALIFIED_SET.includes(l.status)).length;
  const disq = leads.filter(l => l.status === "Disqualified" || l.status === "Duplicate").length;
  const qualRate = total > 0 ? Math.round((qualified / total) * 100) : 0;

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return leads.filter(l => l.created_at.startsWith(d.toLocaleDateString("en-CA"))).length;
  });
  const last7 = last14.slice(7);
  const prev7 = last14.slice(0, 7);
  const last7Sum = last7.reduce((a, b) => a + b, 0);
  const prev7Sum = prev7.reduce((a, b) => a + b, 0) || 1;
  const trendPct = Math.round(((last7Sum - prev7Sum) / prev7Sum) * 100);

  // Last 7 days breakdown for stacked bars
  const stacked = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const day = d.toLocaleDateString("en-CA");
    const dl = leads.filter(l => l.created_at.startsWith(day));
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      hot: dl.filter(l => l.status === "Hot").length,
      warm: dl.filter(l => l.status === "Warm").length,
      cold: dl.filter(l => l.status === "Cold").length,
    };
  });

  const recent = leads.slice(0, 8);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const firstName = (fullName.trim().split(/\s+/)[0]) || email.split("@")[0].split(".")[0] || "";
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "there";

  if (loading) return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ height: 80, borderRadius: 18 }} className="skeleton" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {[...Array(4)].map((_, i) => <div key={i} style={{ height: 130, borderRadius: 18 }} className="skeleton" />)}
      </div>
      <div style={{ height: 280, borderRadius: 18 }} className="skeleton" />
    </div>
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }} className="animate-in">

      <SetupBanner />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800,
            background: T.magentaDim, color: T.magenta, letterSpacing: "0.03em",
          }}>
            <Sparkles size={11} /> THE FLOOR · LIVE
          </span>
          <h1 style={{ fontSize: 34, marginTop: 10 }}>
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            <span style={{ background: T.gradPrimary, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{displayName}</span>.
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 4 }}>
            Here&apos;s your floor — calls graded, leads ranked, deals waiting.
          </p>
        </div>
        <Link href="/dashboard/analyze" className="btn-brand">
          <Zap size={14} /> Grade a call
        </Link>
      </section>

      {/* ── KPI SCORECARDS ──────────────────────────────────────────── */}
      <section className="reveal stagger"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {[
          { label: "Total Calls", value: total, sub: "Last 7 days", trend: trendPct, accent: T.magenta },
          { label: "Qual Rate",   value: `${qualRate}%`, sub: `${qualified} of ${total}`, trend: 0, accent: "#3B82F6" },
          { label: "Qualified",   value: qualified, sub: "Hot · Warm · Cold", trend: qualified > 0 ? 8 : 0, accent: "#3B82F6" },
          { label: "Disqualified", value: disq, sub: total > 0 ? `${Math.round((disq/total)*100)}% rate` : "—", trend: total > 0 ? -Math.round((disq/total)*100) : 0, accent: "#E11D48" },
        ].map((k) => (
          <div key={k.label} style={{
            position: "relative", background: "var(--surface-1)", border: "1px solid var(--border-2)",
            borderRadius: 18, padding: 20, boxShadow: "var(--shadow-md)", overflow: "hidden",
          }}>
            <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: T.gradPrimary, opacity: 0.85 }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", color: "var(--text-3)", textTransform: "uppercase" }}>{k.label}</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 8 }}>
              <p style={{ fontSize: 36, fontWeight: 900, color: "var(--text-1)", lineHeight: 1, letterSpacing: "-0.02em" }}>{k.value}</p>
              {k.trend !== 0 && <TrendChip value={k.trend} />}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>{k.sub}</p>
          </div>
        ))}
      </section>

      {/* ── CHARTS ───────────────────────────────────────────────── */}
      <section className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        <div style={{
          background: "var(--surface-1)", border: "1px solid var(--border-2)",
          borderRadius: 20, padding: 22, boxShadow: "var(--shadow-md)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Call Volume</p>
              <p style={{ fontSize: 12, color: "var(--text-2)" }}>14-day trend · {last7Sum} calls this week</p>
            </div>
            <TrendChip value={trendPct} />
          </div>
          <CurvedArea data={last14} />
        </div>

        <div style={{
          background: "var(--surface-1)", border: "1px solid var(--border-2)",
          borderRadius: 20, padding: 22, boxShadow: "var(--shadow-md)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Verdict Mix</p>
              <p style={{ fontSize: 12, color: "var(--text-2)" }}>Last 7 days · Hot · Warm · Cold</p>
            </div>
          </div>
          <StackedBars rows={stacked} />
          <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11 }}>
            {[{ c: "#DC2626", l: "Hot" }, { c: "#F59E0B", l: "Warm" }, { c: "#D7DAE6", l: "Cold" }].map((s) => (
              <span key={s.l} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.c }} /> {s.l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── RECENT TABLE ─────────────────────────────────────────── */}
      <section className="reveal" style={{
        background: "var(--surface-1)", border: "1px solid var(--border-2)",
        borderRadius: 20, boxShadow: "var(--shadow-md)", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Recent Calls</p>
            <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>Latest results with inline status control</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchData} className="btn-ghost"><RotateCcw size={12} /> Refresh</button>
            <Link href="/dashboard/calls" className="btn-ghost" style={{ textDecoration: "none" }}>View all <ArrowRight size={12} /></Link>
          </div>
        </div>

        {recent.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--surface-3)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PhoneCall size={22} color="var(--text-3)" />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>Nothing on the board yet</p>
            <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>Drop your first recording — Hot, Warm, or Cold in seconds.</p>
            <Link href="/dashboard/analyze" className="btn-brand">
              <Zap size={14} /> Grade your first call
            </Link>
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <LeadsList
              leads={recent.map(l => ({
                id: l.id,
                address: l.extracted_address,
                status: l.status,
                asking: l.asking_price,
                arv: Number((l.metadata as { arv?: number } | null)?.arv) || Number((l.metadata as { zillow_data?: { zestimate?: number } } | null)?.zillow_data?.zestimate) || null,
                agent: (l.metadata as { agent_name?: string } | null)?.agent_name || null,
              }))}
              newIds={newIds}
              onOpen={(id) => setOpenLeadId(id)}
            />
          </div>
        )}
      </section>

      {openLeadId && <LeadDetailModal leadId={openLeadId} onClose={() => setOpenLeadId(null)} />}
    </div>
  );
}
