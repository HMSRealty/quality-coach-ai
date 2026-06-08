"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { Users, Loader2, TrendingUp, Target, Phone, AlertCircle } from "lucide-react";

// Clean Enterprise light palette (was a dark theme — unreadable on the white app).
const BG = "#F8FAFC";       // page canvas
const PANEL = "#FFFFFF";    // card
const PANEL_2 = "#F1F5F9";  // subtle row
const TEAL = "#0EA5E9";     // sky accent
const TEAL_DIM = "rgba(14,165,233,0.12)";
const TXT = "#0F172A";      // slate-900 text
const MUTED = "#64748B";    // slate-500 secondary
const GOLD = "#059669";     // money green (was pale yellow — invisible on white)
const ROSE = "#DC2626";     // red

interface Caller { id: string; name: string; team_id: string | null; aggregate_stats: Record<string, unknown> | null; }
interface Lead { id: string; status: string; caller_id: string | null; created_at: string; ai_coaching_points: string[] | null; }
interface Team { id: string; name: string; }

export default function TeamLeaderPage() {
  const [loading, setLoading] = useState(true);
  const [callers, setCallers] = useState<Caller[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [rangeDays, setRangeDays] = useState<number>(30); // 0 = all time

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: teamData } = await supabase
        .from("teams").select("id, name").eq("manager_id", user.id).order("name");

      const { data: callerData } = await supabase
        .from("cold_callers")
        .select("id, name, team_id, aggregate_stats")
        .eq("user_id", user.id);

      const { data: leadData } = await supabase
        .from("leads")
        .select("id, status, caller_id, created_at, ai_coaching_points")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2000);

      setTeams((teamData || []) as Team[]);
      setCallers((callerData || []) as Caller[]);
      setLeads((leadData || []) as Lead[]);
      setLoading(false);
    })();
  }, []);

  // Filter callers + leads by team selection
  const visibleCallers = selectedTeam === "all"
    ? callers
    : callers.filter(c => c.team_id === selectedTeam);
  const visibleCallerIds = new Set(visibleCallers.map(c => c.id));
  const rangeCutoff = rangeDays > 0 ? Date.now() - rangeDays * 86_400_000 : 0;
  const visibleLeads = (selectedTeam === "all"
    ? leads
    : leads.filter(l => l.caller_id && visibleCallerIds.has(l.caller_id)))
    .filter(l => !rangeCutoff || (l.created_at && new Date(l.created_at).getTime() >= rangeCutoff));

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
      <Loader2 size={28} className="animate-spin" style={{ color: TEAL }} />
    </div>
  );

  const totalLeads = visibleLeads.length;
  const QSET = ["Hot", "Warm", "Cold"];
  const qualifiedCount = visibleLeads.filter(l => QSET.includes(l.status)).length;
  const callBackCount = visibleLeads.filter(l => l.status === "Call Back").length;
  const disqualifiedCount = visibleLeads.filter(l => l.status === "Disqualified").length;
  const passRate = totalLeads > 0 ? Math.round((qualifiedCount / totalLeads) * 100) : 0;

  const perCallerData = visibleCallers.map(c => {
    const cLeads = visibleLeads.filter(l => l.caller_id === c.id);
    return {
      name: c.name.split(" ")[0],
      Qualified: cLeads.filter(l => QSET.includes(l.status)).length,
      "Call Back": cLeads.filter(l => l.status === "Call Back").length,
      Disqualified: cLeads.filter(l => l.status === "Disqualified").length,
    };
  });

  const pieData = [
    { name: "Qualified", value: qualifiedCount, color: TEAL },
    { name: "Call Back", value: callBackCount, color: GOLD },
    { name: "Disqualified", value: disqualifiedCount, color: ROSE },
  ].filter(d => d.value > 0);

  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const dayLeads = visibleLeads.filter(l => l.created_at.startsWith(key));
    return {
      day: label,
      Qualified: dayLeads.filter(l => QSET.includes(l.status)).length,
      Total: dayLeads.length,
    };
  });

  const allCoachingPoints: string[] = [];
  visibleLeads.forEach(l => { if (Array.isArray(l.ai_coaching_points)) allCoachingPoints.push(...l.ai_coaching_points); });
  const counts: Record<string, number> = {};
  allCoachingPoints.forEach(p => {
    const k = p.toLowerCase().slice(0, 80);
    counts[k] = (counts[k] || 0) + 1;
  });
  const topPoints = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([text, count]) => ({ text, count }));

  return (
    <div style={{
      minHeight: "100vh", background: BG, color: TXT,
      margin: "-28px", padding: 28,
    }} className="animate-in">
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: TXT, letterSpacing: "-0.02em" }}>Team Leader Dashboard</h1>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
              {selectedTeam === "all" ? "All teams aggregated" : `Team: ${teams.find(t => t.id === selectedTeam)?.name || ""}`} · {visibleCallers.length} callers · {totalLeads} leads processed
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Date range</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ d: 7, l: "7d" }, { d: 30, l: "30d" }, { d: 90, l: "90d" }, { d: 0, l: "All" }].map(r => (
                  <button key={r.l} onClick={() => setRangeDays(r.d)}
                    style={{ padding: "8px 14px", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer",
                      background: rangeDays === r.d ? TEAL : PANEL, color: rangeDays === r.d ? "#fff" : TXT,
                      border: `1px solid ${rangeDays === r.d ? TEAL : "var(--border-2)"}` }}>{r.l}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                View team
              </label>
              <select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                style={{
                  padding: "9px 14px", borderRadius: 10,
                  background: PANEL, color: TXT,
                  border: `1px solid var(--border-2)`,
                  fontSize: 13, fontWeight: 600, outline: "none",
                  minWidth: 220,
                }}
              >
                <option value="all">All Teams (Aggregate)</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {[
            { label: "Callers", value: visibleCallers.length, icon: Users, color: TEAL },
            { label: "Total Leads", value: totalLeads, icon: Phone, color: "#7DD3FC" },
            { label: "Qualified", value: qualifiedCount, icon: Target, color: TEAL },
            { label: "Pass Rate", value: `${passRate}%`, icon: TrendingUp, color: GOLD },
          ].map(s => (
            <div key={s.label} style={{
              padding: 18, borderRadius: 14,
              background: PANEL,
              border: `1px solid var(--border-2)`,
              boxShadow: `var(--shadow-sm)`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `${s.color}15`, border: `1px solid ${s.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <s.icon size={15} color={s.color} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: "0.05em" }}>{s.label}</span>
              </div>
              <p style={{ fontSize: 28, fontWeight: 900, color: TXT, letterSpacing: "-0.02em" }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          <DarkPanel title="Per-Caller Outcomes">
            {perCallerData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={perCallerData}>
                  <CartesianGrid stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke={MUTED} style={{ fontSize: 11 }} />
                  <YAxis stroke={MUTED} style={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: PANEL_2, border: `1px solid ${TEAL_DIM}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Qualified" stackId="a" fill={TEAL} />
                  <Bar dataKey="Call Back" stackId="a" fill={GOLD} />
                  <Bar dataKey="Disqualified" stackId="a" fill={ROSE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DarkPanel>

          <DarkPanel title="Outcome Mix">
            {pieData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: PANEL_2, border: `1px solid ${TEAL_DIM}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </DarkPanel>
        </div>

        <DarkPanel title="7-Day Trend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={days}>
              <CartesianGrid stroke="#E2E8F0" />
              <XAxis dataKey="day" stroke={MUTED} style={{ fontSize: 11 }} />
              <YAxis stroke={MUTED} style={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: PANEL_2, border: `1px solid ${TEAL_DIM}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Total" stroke="#7DD3FC" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Qualified" stroke={TEAL} strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </DarkPanel>

        <DarkPanel title="Most Frequent Coaching Points">
          {topPoints.length === 0 ? <Empty /> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {topPoints.map((p, i) => (
                <li key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 10,
                  background: PANEL_2, border: "1px solid var(--border-2)",
                }}>
                  <div style={{
                    minWidth: 36, height: 28, borderRadius: 6, padding: "0 10px",
                    background: TEAL_DIM, color: TEAL,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800,
                  }}>{p.count}×</div>
                  <p style={{ fontSize: 13, color: TXT, lineHeight: 1.5, flex: 1 }}>{p.text}</p>
                </li>
              ))}
            </ul>
          )}
        </DarkPanel>
      </div>
    </div>
  );
}

function DarkPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 20, borderRadius: 14,
      background: PANEL, border: `1px solid var(--border-2)`,
      boxShadow: `var(--shadow-sm)`,
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 14, letterSpacing: "0.02em" }}>{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <AlertCircle size={20} color={MUTED} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
      <p style={{ fontSize: 12, color: MUTED }}>Not enough data yet.</p>
    </div>
  );
}
