"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { LeadDetailModal } from "@/app/_components/LeadDetailModal";
import {
  TrendingUp, TrendingDown, PhoneCall, CheckCircle2, XCircle,
  Zap, ArrowRight, RotateCcw, Loader2, ChevronDown,
} from "lucide-react";

const RED = "#C41E3A";

interface Lead {
  id: string;
  campaign_id: string;
  user_id: string;
  status: string;
  extracted_address: string | null;
  asking_price: number | null;
  qualification_reason: string | null;
  created_at: string;
  campaigns?: { name: string } | null;
}

// ── SVG Charts ────────────────────────────────────────────────

function Sparkline({ data, color, width = 80, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...data, 1), min = Math.min(...data, 0), range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `M ${data.map((v, i) => `${((i / (data.length - 1)) * width).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`).join(" L ")} L ${width},${height} L 0,${height} Z`;
  const id = `sg${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MiniBars({ data, color, width = 160, height = 44 }: { data: number[]; color: string; width?: number; height?: number }) {
  const max = Math.max(...data, 1);
  const bw = (width / data.length) * 0.6, gap = (width / data.length) * 0.4;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {data.map((v, i) => {
        const bh = Math.max(2, (v / max) * (height - 2));
        return <rect key={i} x={i * (width / data.length) + gap / 2} y={height - bh} width={bw} height={bh} rx={2} fill={color} opacity={i === data.length - 1 ? 1 : 0.25 + (i / data.length) * 0.55} />;
      })}
    </svg>
  );
}

function DonutRing({ value, max = 100, color, size = 60, sw = 6 }: { value: number; max?: number; color: string; size?: number; sw?: number }) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, d = c * Math.min(value / max, 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${d} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.7s ease" }} />
    </svg>
  );
}

// ── Status ────────────────────────────────────────────────────
const S_CFG: Record<string, { bg: string; color: string; dot: string }> = {
  Hot:          { bg: "#FEF2F2",  color: "#DC2626", dot: "#EF4444" },
  Warm:         { bg: "#FFF7ED",  color: "#EA580C", dot: "#F97316" },
  Cold:         { bg: "#EFF6FF",  color: "#2563EB", dot: "#3B82F6" },
  Disqualified: { bg: "#F1F4F9",  color: "#475569", dot: "#94A3B8" },
  Duplicate:    { bg: "#FFFBEB",  color: "#D97706", dot: "#F59E0B" },
  Processing:   { bg: "#F5F3FF",  color: "#7C3AED", dot: "#8B5CF6" },
  Commercial:   { bg: "#F5F3FF",  color: "#7C3AED", dot: "#8B5CF6" },
  Error:        { bg: "#FEF2F2",  color: "#DC2626", dot: "#EF4444" },
};
const STATUS_OPTS = ["Hot", "Warm", "Cold", "Call Back", "Disqualified", "Duplicate", "Processing", "Error"];

// ── Component ────────────────────────────────────────────────
export default function DashboardPage() {
  const [email, setEmail]           = useState("");
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updatingId, setUpdating]   = useState<string | null>(null);
  const [rerunningId, setRerunning] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setEmail(user?.email ?? "");
    if (user) {
      // Only show leads that have finished AI analysis (exclude "Processing")
      const { data } = await supabase
        .from("leads")
        .select("*, campaigns(name)")
        .eq("user_id", user.id)
        .neq("status", "Processing")
        .order("created_at", { ascending: false })
        .limit(200);
      if (data) setLeads(data as Lead[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live updates — subscribe to lead changes, push them into the table
  // without a page refresh
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Unique channel name per mount to avoid "already subscribed" errors in React strict mode
      const ch = supabase.channel(`leads-overview-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      ch
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
          async (payload) => {
            const row = payload.new as Lead | null;
            const oldRow = payload.old as Lead | null;

            if (payload.eventType === "DELETE") {
              setLeads(prev => prev.filter(l => l.id !== oldRow?.id));
              return;
            }
            if (!row) return;

            // Skip leads still in Processing — only surface once AI has decided
            if (row.status === "Processing") return;

            // Need to enrich with campaign name (realtime payload doesn't include joins)
            const { data: enriched } = await supabase
              .from("leads")
              .select("*, campaigns(name)")
              .eq("id", row.id)
              .maybeSingle();
            if (!enriched) return;

            setLeads(prev => {
              const exists = prev.some(l => l.id === enriched.id);
              if (exists) {
                return prev.map(l => l.id === enriched.id ? (enriched as Lead) : l);
              }
              // Newly-decided lead → prepend
              return [enriched as Lead, ...prev].slice(0, 200);
            });
          }
        )
        .subscribe();
      channel = ch;
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
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
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ leadId: lead.id, campaignId: lead.campaign_id, userId: lead.user_id }),
      });
      if (res.ok) fetchData();
    } catch { /* silent */ }
    setRerunning(null);
  };

  const total = leads.length;
  const QUALIFIED_SET = ["Hot", "Warm", "Cold"];
  const qualified = leads.filter(l => QUALIFIED_SET.includes(l.status)).length;
  const disq = leads.filter(l => l.status === "Disqualified" || l.status === "Duplicate").length;
  const qualRate = total > 0 ? Math.round((qualified / total) * 100) : 0;
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return leads.filter(l => l.created_at.startsWith(d.toLocaleDateString("en-CA"))).length;
  });
  const qualRateSpark = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const day = leads.filter(l => l.created_at.startsWith(d.toLocaleDateString("en-CA")));
    return day.length > 0 ? Math.round((day.filter(l => QUALIFIED_SET.includes(l.status)).length / day.length) * 100) : 0;
  });
  const recent = leads.slice(0, 10);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const firstName = email.split("@")[0].split(".")[0];
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  if (loading) return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ height: 48, borderRadius: 14 }} className="skeleton" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {[...Array(4)].map((_, i) => <div key={i} style={{ height: 120, borderRadius: 14 }} className="skeleton" />)}
      </div>
      <div style={{ height: 260, borderRadius: 14 }} className="skeleton" />
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 3 }}>
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            <span style={{ color: RED }}>{displayName || "there"}</span>
          </h1>
          <p style={{ fontSize: 13, color: "#6B7280" }}>Here's your call performance snapshot for today.</p>
        </div>
        <Link href="/dashboard/analyze" style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "9px 18px", borderRadius: 10,
          background: RED, color: "#fff",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
          boxShadow: `0 2px 8px ${RED}35`,
          transition: "all 130ms ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#A3192F"; e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = RED; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <Zap size={14} /> New Analysis
        </Link>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="stagger">
        {/* Total */}
        <Card style={{ padding: "20px 20px" }} className="animate-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 10 }}>Total Calls</p>
              <p style={{ fontSize: 34, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{total}</p>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F6F8", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PhoneCall size={16} color="#4B5563" />
            </div>
          </div>
          <MiniBars data={last7} color={RED} />
          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Last 7 days</p>
        </Card>

        {/* Qual Rate */}
        <Card style={{ padding: "20px 20px" }} className="animate-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 10 }}>Qual. Rate</p>
              <p style={{ fontSize: 34, fontWeight: 900, color: "#059669", lineHeight: 1 }}>{qualRate}%</p>
            </div>
            <DonutRing value={qualRate} color="#059669" />
          </div>
          <Sparkline data={qualRateSpark} color="#059669" width={176} height={26} />
          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{qualified} qualified of {total}</p>
        </Card>

        {/* Qualified */}
        <Card style={{ padding: "20px 20px" }} className="animate-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 10 }}>Qualified</p>
              <p style={{ fontSize: 34, fontWeight: 900, color: "#059669", lineHeight: 1 }}>{qualified}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>Hot leads identified</p>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={16} color="#059669" />
            </div>
          </div>
          <div style={{ marginTop: 16, padding: "5px 10px", borderRadius: 6, background: "#ECFDF5", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <TrendingUp size={11} color="#059669" />
            <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>
              {total > 0 ? `${qualRate}% conversion rate` : "No data yet"}
            </span>
          </div>
        </Card>

        {/* Disqualified */}
        <Card style={{ padding: "20px 20px" }} className="animate-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: 10 }}>Disqualified</p>
              <p style={{ fontSize: 34, fontWeight: 900, color: RED, lineHeight: 1 }}>{disq}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>Filtered automatically</p>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <XCircle size={16} color={RED} />
            </div>
          </div>
          <div style={{ marginTop: 16, padding: "5px 10px", borderRadius: 6, background: "#FEF2F2", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <TrendingDown size={11} color={RED} />
            <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>
              {total > 0 ? `${Math.round((disq / total) * 100)}% disq. rate` : "No data yet"}
            </span>
          </div>
        </Card>
      </div>

      {/* Volume chart */}
      <Card>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Call Volume</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>Analyses over the last 7 days</p>
          </div>
          <span style={{ padding: "3px 10px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280", fontSize: 11, fontWeight: 600 }}>
            Last 7 days
          </span>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 100 }}>
            {last7.map((count, i) => {
              const d = new Date(); d.setDate(d.getDate() - (6 - i));
              const label = d.toLocaleDateString("en-US", { weekday: "short" });
              const max = Math.max(...last7, 1);
              const bh = Math.max(4, (count / max) * 80);
              const isToday = i === 6;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, height: 100, justifyContent: "flex-end" }}>
                  {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? RED : "#9CA3AF" }}>{count}</span>}
                  <div style={{
                    width: "100%", height: bh,
                    background: isToday ? RED : "#E5E7EB",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.4s ease",
                  }} />
                  <span style={{ fontSize: 10, color: isToday ? RED : "#9CA3AF", fontWeight: isToday ? 700 : 400 }}>{label}</span>
                </div>
              );
            })}
          </div>
          {total === 0 && (
            <p style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
              No calls yet. <Link href="/dashboard/analyze" style={{ color: RED, fontWeight: 600 }}>Analyze your first call →</Link>
            </p>
          )}
        </div>
      </Card>

      {/* Recent table */}
      <Card>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Recent Calls</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>Latest results with inline status control</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchData} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              borderRadius: 9, background: "#F9FAFB", border: "1px solid #E5E7EB",
              color: "#6B7280", fontSize: 12, cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
            onMouseLeave={e => e.currentTarget.style.background = "#F9FAFB"}
            >
              <RotateCcw size={12} /> Refresh
            </button>
            <Link href="/dashboard/calls" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              borderRadius: 9, background: "#FEF2F2", border: `1px solid #FCA5A5`,
              color: RED, fontSize: 12, fontWeight: 700, textDecoration: "none",
              transition: "all 120ms ease",
            }}>
              View all <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {recent.length === 0 ? (
          <div style={{ padding: "56px 24px", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#F3F4F6", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PhoneCall size={22} color="#9CA3AF" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>No calls analyzed yet</p>
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 18 }}>Upload your first call recording to get instant quality scores.</p>
            <Link href="/dashboard/analyze" style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
              borderRadius: 9, background: RED, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none",
            }}>
              <Zap size={14} /> Analyze First Call
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                  {["Date", "Campaign", "Status", "Address", "Price", "Reason", ""].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((lead, idx) => {
                  const sc = S_CFG[lead.status] ?? { bg: "#F3F4F6", color: "#4B5563", dot: "#9CA3AF" };
                  return (
                    <tr key={lead.id}
                      style={{ borderBottom: idx < recent.length - 1 ? "1px solid #F9FAFB" : "none", transition: "background 100ms", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      onClick={() => setOpenLeadId(lead.id)}
                    >
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
                        {new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#F3F4F6", color: "#4B5563", fontSize: 11, fontWeight: 500 }}>
                          {lead.campaigns?.name ?? "—"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <div style={{ position: "relative", display: "inline-block" }}>
                          <select value={lead.status} onClick={e => e.stopPropagation()} onChange={e => updateStatus(lead.id, e.target.value)}
                            disabled={updatingId === lead.id}
                            style={{
                              appearance: "none", padding: "3px 20px 3px 8px",
                              borderRadius: 999, fontSize: 11, fontWeight: 700,
                              border: "none", cursor: "pointer",
                              background: sc.bg, color: sc.color,
                            }}>
                            {STATUS_OPTS.map(s => <option key={s} value={s} style={{ background: "#fff", color: "#111827" }}>{s}</option>)}
                          </select>
                          {updatingId === lead.id
                            ? <Loader2 size={9} className="animate-spin" style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", color: sc.color, pointerEvents: "none" }} />
                            : <ChevronDown size={9} style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", color: sc.color, pointerEvents: "none" }} />
                          }
                        </div>
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "#4B5563", maxWidth: 160 }} className="truncate">{lead.extracted_address ?? "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "#4B5563", whiteSpace: "nowrap" }}>
                        {lead.asking_price ? `$${lead.asking_price.toLocaleString()}` : "—"}
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "#6B7280", maxWidth: 220 }} className="truncate" title={lead.qualification_reason ?? ""}>
                        {lead.qualification_reason ?? "—"}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <button onClick={(e) => { e.stopPropagation(); rerun(lead); }} disabled={rerunningId === lead.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "5px 10px", borderRadius: 7,
                            background: "none", border: "1px solid #E5E7EB",
                            color: "#6B7280", fontSize: 11, cursor: "pointer",
                            opacity: rerunningId === lead.id ? 0.5 : 1,
                            transition: "all 120ms ease",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "#FCA5A5"; e.currentTarget.style.color = RED; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#6B7280"; }}
                        >
                          {rerunningId === lead.id ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                          Re-run
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openLeadId && <LeadDetailModal leadId={openLeadId} onClose={() => setOpenLeadId(null)} />}
    </div>
  );
}
