"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp, BarChart3, CheckCircle2, Target, Loader2, Search,
  Users2, Phone, XCircle, MessageSquare, Award, ChevronRight,
} from "lucide-react";

const NAVY = "#1A1A1A";
const TEAL = "#C75B39";
const SLATE = "#5B5249";

interface Caller {
  id: string;
  name: string;
  user_id: string;
  team_id: string | null;
  aggregate_stats: Record<string, unknown> | null;
}
interface CallerStats {
  total: number;
  qualified: number;
  callback: number;
  disqualified: number;
  conversion: number;
  avgPrice: number;
}

export default function CallersPage() {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [stats, setStats] = useState<Record<string, CallerStats>>({});
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: cRes } = await supabase
        .from("cold_callers")
        .select("id, name, user_id, team_id, aggregate_stats")
        .eq("user_id", user.id)
        .order("name");
      const list = (cRes || []) as Caller[];
      setCallers(list);
      if (list.length) setSelectedId(list[0].id);

      const { data: teams } = await supabase.from("teams").select("id, name").eq("manager_id", user.id);
      const tmap: Record<string, string> = {};
      (teams || []).forEach(t => { tmap[t.id] = t.name; });
      setTeamNames(tmap);

      // One query for all leads of this user, grouped client-side (avoids N queries)
      const { data: leads } = await supabase
        .from("leads")
        .select("caller_id, status, asking_price")
        .eq("user_id", user.id);

      const byId: Record<string, CallerStats> = {};
      list.forEach(c => { byId[c.id] = { total: 0, qualified: 0, callback: 0, disqualified: 0, conversion: 0, avgPrice: 0 }; });
      const priceSum: Record<string, number> = {};
      const priceCount: Record<string, number> = {};

      (leads || []).forEach(l => {
        if (!l.caller_id || !byId[l.caller_id]) return;
        const s = byId[l.caller_id];
        s.total++;
        if (l.status === "Hot" || l.status === "Warm" || l.status === "Cold") s.qualified++;
        else if (l.status === "Call Back") s.callback++;
        else if (l.status === "Disqualified") s.disqualified++;
        if (l.asking_price) {
          priceSum[l.caller_id] = (priceSum[l.caller_id] || 0) + l.asking_price;
          priceCount[l.caller_id] = (priceCount[l.caller_id] || 0) + 1;
        }
      });
      Object.keys(byId).forEach(id => {
        const s = byId[id];
        s.conversion = s.total > 0 ? Math.round((s.qualified / s.total) * 100) : 0;
        s.avgPrice = priceCount[id] ? Math.round(priceSum[id] / priceCount[id]) : 0;
      });

      setStats(byId);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: "60px 24px" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", color: NAVY }} />
      <p style={{ color: SLATE }}>Loading caller performance...</p>
    </div>
  );

  if (callers.length === 0) return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }} className="animate-in">
      <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Cold Caller Performance</h1>
      <p style={{ fontSize: 13, color: SLATE, marginBottom: 24 }}>Track KPIs and coaching for each team member.</p>
      <div style={{
        padding: 60, textAlign: "center", borderRadius: 16,
        background: "#FFF", border: "1px solid rgba(26,26,26,0.08)",
      }}>
        <Users2 size={36} color={SLATE} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
        <p style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>No callers yet</p>
        <p style={{ fontSize: 13, color: SLATE, marginTop: 6 }}>
          Upload a team CSV in Settings to add your cold callers.
        </p>
      </div>
    </div>
  );

  const selected = callers.find(c => c.id === selectedId);
  const s = stats[selectedId!] || { total: 0, qualified: 0, callback: 0, disqualified: 0, conversion: 0, avgPrice: 0 };
  const agg = (selected?.aggregate_stats || {}) as Record<string, unknown>;
  const lastFeedback = agg.last_feedback as string | undefined;
  const coachingPoints = (agg.coaching_points as string[] | undefined) || [];
  // Most-frequent coaching points
  const counts: Record<string, number> = {};
  coachingPoints.forEach(p => { const k = p.trim(); counts[k] = (counts[k] || 0) + 1; });
  const topCoaching = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const filtered = callers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const convColor = (v: number) => v >= 50 ? "#059669" : v >= 30 ? "#0284C7" : "#DC2626";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Cold Caller Performance</h1>
        <p style={{ fontSize: 13, color: SLATE }}>Track KPIs and AI coaching for each team member.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* ── Roster (sticky, scrollable) ── */}
        <div style={{
          position: "sticky", top: 76,
          background: "#FFF", border: "1px solid rgba(26,26,26,0.08)", borderRadius: 14,
          overflow: "hidden", boxShadow: "0 2px 8px rgba(26,26,26,0.04)",
        }}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(26,26,26,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Users2 size={15} color={NAVY} />
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Callers</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: SLATE, fontWeight: 600 }}>{callers.length}</span>
            </div>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search callers..."
                style={{
                  width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8,
                  background: "#FAF8F4", border: "1px solid rgba(26,26,26,0.06)",
                  fontSize: 12, color: NAVY, outline: "none",
                }}
              />
            </div>
          </div>
          <div style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto", padding: 8 }}>
            {filtered.map(caller => {
              const cs = stats[caller.id];
              const active = selectedId === caller.id;
              return (
                <button key={caller.id}
                  onClick={() => setSelectedId(caller.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 10px", marginBottom: 4, borderRadius: 10,
                    background: active ? "#EFE9E0" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#FAF8F4"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: NAVY, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {caller.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {caller.name}
                    </p>
                    <p style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>
                      {cs?.total || 0} calls · <span style={{ color: convColor(cs?.conversion || 0), fontWeight: 700 }}>{cs?.conversion || 0}%</span>
                    </p>
                  </div>
                  {active && <ChevronRight size={14} color={NAVY} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p style={{ padding: 20, textAlign: "center", fontSize: 12, color: SLATE }}>No match.</p>
            )}
          </div>
        </div>

        {/* ── Detail ── */}
        {selected && (
          <div className="animate-scale" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Caller header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "18px 20px",
              borderRadius: 14, background: `linear-gradient(135deg, ${NAVY} 0%, #2B2520 100%)`,
              color: "#fff",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 800,
              }}>
                {selected.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 800 }}>{selected.name}</h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                  {selected.team_id && teamNames[selected.team_id] ? teamNames[selected.team_id] : "No team"}
                </p>
              </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {[
                { label: "Total Calls", value: s.total, icon: Phone, color: NAVY },
                { label: "Qualified", value: s.qualified, icon: CheckCircle2, color: "#059669" },
                { label: "Conversion", value: `${s.conversion}%`, icon: TrendingUp, color: convColor(s.conversion) },
                { label: "Avg Price", value: s.avgPrice ? `$${(s.avgPrice / 1000).toFixed(0)}k` : "—", icon: Target, color: "#7C3AED" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{
                  background: "#FFFFFF", border: "1px solid rgba(26,26,26,0.08)", borderRadius: 12, padding: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Icon size={14} color={color} />
                    <p style={{ fontSize: 11, color: SLATE, fontWeight: 600 }}>{label}</p>
                  </div>
                  <p style={{ fontSize: 24, fontWeight: 900, color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Outcome breakdown bar */}
            <div style={{ background: "#FFF", border: "1px solid rgba(26,26,26,0.08)", borderRadius: 12, padding: 18 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Outcome Breakdown</h3>
              {s.total === 0 ? (
                <p style={{ fontSize: 12, color: SLATE }}>No leads processed for this caller yet.</p>
              ) : (
                <>
                  <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                    <div style={{ width: `${(s.qualified / s.total) * 100}%`, background: "#059669" }} />
                    <div style={{ width: `${(s.callback / s.total) * 100}%`, background: "#F59E0B" }} />
                    <div style={{ width: `${(s.disqualified / s.total) * 100}%`, background: "#DC2626" }} />
                  </div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                    {[
                      { label: "Qualified", value: s.qualified, color: "#059669", icon: CheckCircle2 },
                      { label: "Call Back", value: s.callback, color: "#F59E0B", icon: Phone },
                      { label: "Disqualified", value: s.disqualified, color: "#DC2626", icon: XCircle },
                    ].map(o => (
                      <div key={o.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <o.icon size={13} color={o.color} />
                        <span style={{ fontSize: 12, color: SLATE }}>{o.label}: <strong style={{ color: NAVY }}>{o.value}</strong></span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Latest AI feedback */}
            <div style={{ background: "#FFF", border: "1px solid rgba(26,26,26,0.08)", borderRadius: 12, padding: 18 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <MessageSquare size={15} color={TEAL} /> Latest Feedback
              </h3>
              {lastFeedback ? (
                <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.7, padding: "12px 14px", background: "#FAF8F4", borderRadius: 8 }}>
                  {lastFeedback}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: SLATE, fontStyle: "italic" }}>
                  No AI feedback yet — it appears automatically after this caller&apos;s calls are analyzed.
                </p>
              )}
            </div>

            {/* Top coaching points */}
            <div style={{ background: "#FFF", border: "1px solid rgba(26,26,26,0.08)", borderRadius: 12, padding: 18 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <Award size={15} color="#7C3AED" /> Recurring Coaching Points
              </h3>
              {topCoaching.length === 0 ? (
                <p style={{ fontSize: 12, color: SLATE, fontStyle: "italic" }}>
                  Coaching points accumulate here as more calls are reviewed.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {topCoaching.map(([text, count], i) => (
                    <li key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 12px", borderRadius: 8, background: "#FAF8F4",
                    }}>
                      <span style={{
                        minWidth: 30, height: 24, padding: "0 8px", borderRadius: 6,
                        background: "#EDE9FE", color: "#7C3AED",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800,
                      }}>{count}×</span>
                      <span style={{ fontSize: 12.5, color: NAVY, lineHeight: 1.5 }}>{text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
