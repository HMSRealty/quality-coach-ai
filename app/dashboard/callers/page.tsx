"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { TrendingUp, BarChart3, CheckCircle2, Target, Loader2 } from "lucide-react";

const RED = "#C41E3A";

interface Caller { id: string; name: string; user_id: string; }
interface CallerStats {
  total: number;
  qualified: number;
  conversion: number;
  avgPrice: number;
}

export default function CallersPage() {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [stats, setStats] = useState<Record<string, CallerStats>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: cRes } = await supabase.from("cold_callers").select("*").eq("user_id", user.id);
      if (!cRes) return;
      setCallers(cRes);
      if (cRes.length) setSelectedId(cRes[0].id);

      const newStats: Record<string, CallerStats> = {};
      for (const caller of cRes) {
        const { data: leads } = await supabase.from("leads").select("*").eq("caller_id", caller.id);
        const total = leads?.length || 0;
        const qual = leads?.filter(l => l.status === "Qualified" || l.status === "Warm").length || 0;
        const avgPrice = leads && leads.length > 0
          ? leads.reduce((s, l) => s + (l.asking_price || 0), 0) / leads.length
          : 0;
        newStats[caller.id] = {
          total,
          qualified: qual,
          conversion: total > 0 ? Math.round((qual / total) * 100) : 0,
          avgPrice: Math.round(avgPrice),
        };
      }
      setStats(newStats);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: "40px 24px" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", color: RED }} />
      <p style={{ color: "#6B7280" }}>Loading caller performance...</p>
    </div>
  );

  const selected = callers.find(c => c.id === selectedId);
  const s = stats[selectedId!] || { total: 0, qualified: 0, conversion: 0, avgPrice: 0 };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Cold Caller Performance</h1>
        <p style={{ fontSize: 13, color: "#6B7280" }}>Track KPIs and performance for each team member.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, alignItems: "start" }}>
        {/* Sidebar */}
        <div>
          {callers.map(caller => {
            const stats_data = stats[caller.id];
            return (
              <button key={caller.id}
                onClick={() => setSelectedId(caller.id)}
                style={{
                  width: "100%", display: "flex", flexDirection: "column",
                  padding: "12px 14px", marginBottom: 8, borderRadius: 10,
                  background: selectedId === caller.id ? "#FEF2F2" : "#FFFFFF",
                  border: `1.5px solid ${selectedId === caller.id ? "#FCA5A5" : "#E5E7EB"}`,
                  cursor: "pointer", textAlign: "left",
                  transition: "all 120ms ease",
                }}
                onMouseEnter={e => { if (selectedId !== caller.id) e.currentTarget.style.background = "#F9FAFB"; }}
                onMouseLeave={e => { if (selectedId !== caller.id) e.currentTarget.style.background = "#FFFFFF"; }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{caller.name}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                  {stats_data?.total || 0} calls · {stats_data?.conversion || 0}% conv.
                </p>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        {selected && (
          <div className="animate-scale" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {[
                { label: "Total Calls", value: s.total, icon: BarChart3, color: RED },
                { label: "Qualified", value: s.qualified, icon: CheckCircle2, color: "#059669" },
                { label: "Conversion", value: `${s.conversion}%`, icon: TrendingUp, color: "#0284C7" },
                { label: "Avg Price", value: `$${(s.avgPrice / 1000).toFixed(0)}k`, icon: Target, color: "#7C3AED" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{
                  background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12,
                  padding: "16px", display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8,
                    background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={18} color={color} />
                  </div>
                  <div>
                    <p style={{ fontSize: 20, fontWeight: 900, color: color, lineHeight: 1 }}>{value}</p>
                    <p style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Feedback Section */}
            <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
                Performance Feedback & Coaching
              </h3>
              <div style={{
                padding: "14px", borderRadius: 8, background: "#F9FAFB",
                border: "1px dashed #E5E7EB", color: "#6B7280", fontSize: 13, textAlign: "center",
              }}>
                <p>Feedback and coaching notes will appear here.</p>
                <p style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
                  Trainers can add detailed feedback and action plans for this caller.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
