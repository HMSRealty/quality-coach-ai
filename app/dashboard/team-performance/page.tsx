"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, TrendingUp, Target, Zap, Loader2 } from "lucide-react";

const RED = "#2F6BFF";

interface TeamPerf { id: string; name: string; calls: number; qualified: number; conversion: number; trend: number; }

export default function TeamPerformancePage() {
  const [teams, setTeams] = useState<TeamPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: teamsData } = await supabase.from("teams").select("*").eq("manager_id", user.id);
      if (!teamsData) return;

      const now = Date.now();
      const day = 86_400_000;
      const cutoff7 = new Date(now - 7 * day).toISOString();
      const cutoff14 = new Date(now - 14 * day).toISOString();

      const teamPerf: TeamPerf[] = [];
      for (const team of teamsData) {
        const { data: teamMembers } = await supabase.from("team_members").select("user_id").eq("team_id", team.id);
        if (!teamMembers || teamMembers.length === 0) {
          teamPerf.push({ id: team.id, name: team.name, calls: 0, qualified: 0, conversion: 0, trend: 0 });
          continue;
        }

        const userIds = teamMembers.map(m => m.user_id);
        const { data: leads } = await supabase.from("leads").select("status, created_at").in("user_id", userIds);
        const all = leads || [];

        const QSET = ["Hot", "Warm", "Cold"];
        const total = all.length;
        const qualified = all.filter(l => QSET.includes(l.status)).length;
        // Conversion = qualified (Hot+Warm+Cold) / decided leads. Exclude Processing/Error.
        const decided = all.filter(l => l.status !== "Processing" && l.status !== "Error").length;
        const conversion = decided > 0 ? Math.round((qualified / decided) * 100) : 0;

        // Real week-over-week trend
        const last7 = all.filter(l => l.created_at >= cutoff7);
        const prev7 = all.filter(l => l.created_at >= cutoff14 && l.created_at < cutoff7);
        const conv = (rows: typeof all) => {
          const d = rows.filter(l => l.status !== "Processing" && l.status !== "Error").length;
          const q = rows.filter(l => QSET.includes(l.status)).length;
          return d > 0 ? (q / d) * 100 : 0;
        };
        const trend = +(conv(last7) - conv(prev7)).toFixed(1);

        teamPerf.push({ id: team.id, name: team.name, calls: total, qualified, conversion, trend });
      }
      setTeams(teamPerf.sort((a, b) => b.conversion - a.conversion));
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: "40px 24px" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", color: RED }} />
      <p style={{ color: "#64748B" }}>Loading team performance...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B0F19", marginBottom: 4 }}>Team Performance Tracker</h1>
        <p style={{ fontSize: 13, color: "#64748B" }}>Real-time KPI tracking and performance analytics for all teams.</p>
      </div>

      {/* KPI Summary — weighted by call volume, not naive avg of percentages */}
      {(() => null)()}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {(() => {
          const totalCalls = teams.reduce((s, t) => s + t.calls, 0);
          const totalQual = teams.reduce((s, t) => s + t.qualified, 0);
          const weightedConv = totalCalls > 0 ? Math.round((totalQual / totalCalls) * 100) : 0;
          return [
            { label: "Total Calls", value: totalCalls, icon: BarChart3, color: RED },
            { label: "Qualified Leads", value: totalQual, icon: Target, color: "#059669" },
            { label: "Conversion Rate", value: `${weightedConv}%`, icon: TrendingUp, color: "#0284C7" },
            { label: "Active Teams", value: teams.length, icon: Zap, color: "#7C3AED" },
          ];
        })().map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{
            background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon size={16} color={color} />
              <p style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{label}</p>
            </div>
            <p style={{ fontSize: 24, fontWeight: 900, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div style={{
        background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12,
        overflow: "hidden",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #E5E7EB", background: "#FAFAFA" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0B0F19" }}>Team Rankings</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F4EFE7", borderBottom: "1px solid #E5E7EB" }}>
              {["Rank", "Team", "Calls", "Qualified", "Conversion", "Trend"].map(h => (
                <th key={h} style={{
                  padding: "12px 16px", textAlign: "left", fontSize: 11,
                  fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team, idx) => (
              <tr key={team.id} style={{ borderBottom: "1px solid #F3F4F6" }}
                onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: RED }}>{idx + 1}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#0B0F19" }}>{team.name}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#4B5563" }}>{team.calls}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#059669", fontWeight: 600 }}>{team.qualified}</td>
                <td style={{
                  padding: "12px 16px", fontSize: 13, fontWeight: 700,
                  color: team.conversion > 50 ? "#059669" : team.conversion > 30 ? "#0284C7" : "#DC2626",
                }}>
                  {team.conversion}%
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13 }}>
                  <span style={{
                    padding: "2px 6px", borderRadius: 4,
                    background: team.trend > 0 ? "#ECFDF5" : "#FBEEE8",
                    color: team.trend > 0 ? "#059669" : RED,
                    fontWeight: 600, fontSize: 11,
                  }}>
                    {team.trend > 0 ? "+" : ""}{team.trend.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
