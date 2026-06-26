"use client";

export const runtime = "edge";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import { ArrowLeft, Clock, Phone, Loader2, User, Calendar } from "lucide-react";
import Link from "next/link";

const NAVY = T.text1;
const SLATE = T.text2;

interface Lead {
  id: string;
  status: string;
  extracted_address: string | null;
  created_at: string;
  campaigns?: { name: string } | null;
}

interface HoursEntry {
  id: string;
  agent_name: string;
  date: string;
  hours: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Hot:          { bg: "rgba(10,95,82,0.12)",  fg: "#2563EB" },
  Warm:         { bg: "rgba(234,88,12,0.12)",  fg: "#EA580C" },
  Cold:         { bg: "rgba(10,95,82,0.12)",  fg: "#2563EB" },
  "Call Back":  { bg: "rgba(146,64,14,0.12)",  fg: "#F59E0B" },
  "Needs Call": { bg: "rgba(59,130,246,0.12)", fg: "#3B82F6" },
  Disqualified: { bg: "var(--surface-3)",      fg: "#9A9AB0" },
  Duplicate:    { bg: "rgba(10,95,82,0.12)", fg: "#2563EB" },
  Error:        { bg: "rgba(220,38,38,0.10)",  fg: "#DC2626" },
  Pending:      { bg: "var(--surface-3)",      fg: "#9A9AB0" },
  Queued:       { bg: "rgba(29,78,216,0.10)",  fg: "#1D4ED8" },
};

export default function AgentViewPage() {
  const params = useParams();
  const router = useRouter();
  const agentName = decodeURIComponent(params?.name as string || "");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [hours, setHours] = useState<HoursEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [leadsRes, hoursRes] = await Promise.all([
      supabase.from("leads")
        .select("id, status, extracted_address, created_at, campaigns(name)")
        .eq("user_id", user.id)
        .eq("agent_name", agentName)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("dialer_hours")
        .select("id, agent_name, date, hours, created_at")
        .eq("user_id", user.id)
        .eq("agent_name", agentName)
        .order("date", { ascending: false })
        .limit(200),
    ]);

    setLeads((leadsRes.data || []) as unknown as Lead[]);
    setHours((hoursRes.data || []) as HoursEntry[]);
    setLoading(false);
  }, [agentName]);

  useEffect(() => { load(); }, [load]);

  const statusCounts: Record<string, number> = {};
  leads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
  const totalHours = hours.reduce((s, h) => s + (h.hours || 0), 0);

  const th: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 800,
    letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)",
    borderBottom: "1px solid var(--border-2)", background: "var(--surface-3)",
  };
  const td: React.CSSProperties = {
    padding: "10px 14px", fontSize: 13, color: NAVY,
    borderBottom: "1px solid var(--border-1)",
  };

  if (loading) return (
    <div style={{ padding: 80, textAlign: "center" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: NAVY }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <Link href="/dashboard/leaderboard" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 0", color: SLATE, fontSize: 12, fontWeight: 700,
        textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.05em", alignSelf: "flex-start",
      }}>
        <ArrowLeft size={13} /> Leaderboard
      </Link>

      <div style={{
        padding: 28, borderRadius: 18, background: "var(--surface-1)",
        border: "1px solid var(--border-2)", boxShadow: "var(--shadow-md)",
        position: "relative", overflow: "hidden",
      }}>
        <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-primary)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "linear-gradient(135deg,#3B82F6,#2563EB)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900,
          }}>
            {agentName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY }}>{agentName}</h1>
            <p style={{ fontSize: 13, color: SLATE }}>{leads.length} leads · {totalHours.toFixed(1)} hours logged</p>
          </div>
        </div>

        {/* Status summary cards */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(statusCounts).sort(([,a],[,b]) => b - a).map(([status, count]) => {
            const sc = STATUS_COLORS[status] || { bg: "var(--surface-3)", fg: SLATE };
            return (
              <div key={status} style={{
                padding: "8px 16px", borderRadius: 10,
                background: sc.bg, color: sc.fg,
                fontSize: 13, fontWeight: 800,
                border: `1px solid ${sc.fg}20`,
              }}>
                {status}: {count}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours */}
      {hours.length > 0 && (
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} color={NAVY} />
            <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>Hours Log</h2>
            <span style={{ fontSize: 12, color: SLATE, marginLeft: 8 }}>{totalHours.toFixed(1)} total hours</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={{ ...th, textAlign: "center" }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {hours.map(h => (
                  <tr key={h.id}>
                    <td style={td}>{h.date}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{h.hours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leads */}
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 8 }}>
          <Phone size={16} color={NAVY} />
          <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>Leads</h2>
          <span style={{ fontSize: 12, color: SLATE, marginLeft: 8 }}>{leads.length} total</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Address</th>
                <th style={th}>Campaign</th>
                <th style={{ ...th, textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => {
                const sc = STATUS_COLORS[l.status] || { bg: "var(--surface-3)", fg: SLATE };
                return (
                  <tr key={l.id} onClick={() => router.push(`/dashboard/leads/${l.id}`)}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12 }}>
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {l.extracted_address || "Unknown"}
                    </td>
                    <td style={{ ...td, color: SLATE }}>{l.campaigns?.name || "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 10px", borderRadius: 999,
                        background: sc.bg, color: sc.fg,
                        fontSize: 11, fontWeight: 800,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.fg }} />
                        {l.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: SLATE, padding: 40 }}>No leads found for this agent.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
