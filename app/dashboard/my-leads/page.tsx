"use client";

export const runtime = "edge";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import { Loader2, Phone, Clock, TrendingUp, User } from "lucide-react";

const NAVY = T.text1;
const SLATE = T.text2;

interface Lead {
  id: string;
  status: string;
  extracted_address: string | null;
  qualification_reason: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface HoursEntry {
  id: string;
  date: string;
  hours: number;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Hot:          { bg: "rgba(10,95,82,0.12)",  fg: "#2563EB" },
  Warm:         { bg: "rgba(234,88,12,0.12)",  fg: "#EA580C" },
  Cold:         { bg: "rgba(10,95,82,0.12)",  fg: "#2563EB" },
  "Call Back":  { bg: "rgba(146,64,14,0.12)",  fg: "#F59E0B" },
  "Needs Call": { bg: "rgba(59,130,246,0.12)", fg: "#3B82F6" },
  Disqualified: { bg: "rgba(100,116,139,0.12)", fg: "#9A9AB0" },
  Duplicate:    { bg: "rgba(10,95,82,0.12)", fg: "#2563EB" },
  Error:        { bg: "rgba(220,38,38,0.10)",  fg: "#DC2626" },
  Pending:      { bg: "var(--surface-3)",      fg: "#9A9AB0" },
};

export default function MyLeadsPage() {
  const [agentName, setAgentName] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [hours, setHours] = useState<HoursEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profile } = await supabase.from("profiles")
      .select("full_name, parent_user_id")
      .eq("id", user.id)
      .maybeSingle();

    const name = (profile?.full_name as string) || user.email || "";
    setAgentName(name);

    if (!name || !profile?.parent_user_id) {
      setLoading(false);
      return;
    }

    const [leadsRes, hoursRes] = await Promise.all([
      supabase.from("leads")
        .select("id, status, extracted_address, qualification_reason, created_at, metadata")
        .eq("agent_name", name)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("dialer_hours")
        .select("id, date, hours")
        .eq("agent_name", name)
        .order("date", { ascending: false })
        .limit(200),
    ]);

    setLeads((leadsRes.data || []) as Lead[]);
    setHours((hoursRes.data || []) as HoursEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalHours = hours.reduce((s, h) => s + (h.hours || 0), 0);
  const statusCounts: Record<string, number> = {};
  leads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

  const th: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 800,
    letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)",
    borderBottom: "1px solid var(--border-2)", background: "var(--surface-3)",
    whiteSpace: "nowrap",
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

      {/* Header */}
      <div style={{
        padding: 28, borderRadius: 18, background: "var(--surface-1)",
        border: "1px solid var(--border-2)", boxShadow: "var(--shadow-md)",
        position: "relative", overflow: "hidden",
      }}>
        <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-primary)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "linear-gradient(135deg,#2563EB,#3B82F6)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900,
          }}>
            {(agentName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY }}>My Dashboard</h1>
            <p style={{ fontSize: 14, color: SLATE }}>{agentName}</p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <StatCard icon={Phone} label="Total Leads" value={String(leads.length)} />
          <StatCard icon={Clock} label="Total Hours" value={totalHours.toFixed(1)} />
          <StatCard icon={TrendingUp} label="Qualified" value={String((statusCounts["Hot"] || 0) + (statusCounts["Warm"] || 0) + (statusCounts["Cold"] || 0))} />
        </div>
      </div>

      {/* Status breakdown */}
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

      {/* Hours log */}
      {hours.length > 0 && (
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} color={NAVY} />
            <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>Hours Log</h2>
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

      {/* Leads table — view only: owner name, phone, address, DQ reason */}
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 8 }}>
          <Phone size={16} color={NAVY} />
          <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>My Leads</h2>
          <span style={{ fontSize: 12, color: SLATE, marginLeft: 8 }}>{leads.length} total</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Owner Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Address</th>
                <th style={{ ...th, textAlign: "center" }}>Status</th>
                <th style={th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => {
                const m = (l.metadata || {}) as Record<string, unknown>;
                const ownerName = String(m.owner_name || "—");
                const phone = String(m.phone_number || "—");
                const sc = STATUS_COLORS[l.status] || { bg: "var(--surface-3)", fg: SLATE };
                return (
                  <tr key={l.id}>
                    <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12 }}>
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{ownerName}</td>
                    <td style={{ ...td, fontSize: 12 }}>{phone}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{l.extracted_address || "—"}</td>
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
                    <td style={{ ...td, fontSize: 12, color: SLATE, maxWidth: 300 }}>
                      {l.status === "Disqualified" ? (l.qualification_reason || "—") : "—"}
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: SLATE, padding: 40 }}>No leads found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12,
      background: "var(--surface-2)", border: "1px solid var(--border-1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Icon size={13} color="var(--text-3)" />
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 900, color: "var(--text-1)" }}>{value}</p>
    </div>
  );
}
