"use client";

// Caller leaderboard (gamification). Ranks callers by points earned from
// AI-qualified leads in a date range. Points: Hot 3 · Warm 2 · Cold 1.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Trophy, Medal, Flame, Sun, Snowflake } from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.navy;
const SLATE = T.slate;

function estDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}
function estShift(days: number): string {
  return estDate(new Date(Date.now() + days * 86_400_000));
}

const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
const POINTS: Record<string, number> = { hot: 3, warm: 2, cold: 1 };

type Row = { name: string; total: number; hot: number; warm: number; cold: number; qualified: number; points: number; conversion: number };

const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("leads")
      .select("agent_name, status, submission_date")
      .gte("submission_date", estShift(-(d - 1)))
      .lte("submission_date", estDate());

    const map = new Map<string, Row>();
    for (const l of (data || []) as { agent_name: string | null; status: string }[]) {
      const name = l.agent_name?.trim() || "Unassigned";
      const r = map.get(name) || { name, total: 0, hot: 0, warm: 0, cold: 0, qualified: 0, points: 0, conversion: 0 };
      r.total++;
      const s = norm(l.status);
      if (s === "hot") r.hot++;
      else if (s === "warm") r.warm++;
      else if (s === "cold") r.cold++;
      r.points += POINTS[s] || 0;
      map.set(name, r);
    }
    const out = [...map.values()].map((r) => {
      r.qualified = r.hot + r.warm + r.cold;
      r.conversion = r.total > 0 ? Math.round((r.qualified / r.total) * 100) : 0;
      return r;
    }).sort((a, b) => b.points - a.points || b.conversion - a.conversion);
    setRows(out);
    setLoading(false);
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const medal = (i: number) => (i === 0 ? "#D4AF37" : i === 1 ? "#9CA3AF" : i === 2 ? "#B45309" : null);
  const top = rows.slice(0, 3);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Leaderboard</h1>
          <p style={{ fontSize: 13, color: SLATE }}>Callers ranked by points · Hot 3 · Warm 2 · Cold 1 · last {days} days (EST)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setDays(r.days)} style={{
              padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: days === r.days ? NAVY : "#FFF", color: days === r.days ? "#FFF" : NAVY,
              border: `1px solid ${days === r.days ? NAVY : "rgba(35,43,58,0.12)"}`,
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: NAVY }} /></div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", background: T.surface1, borderRadius: 14, border: "1px solid rgba(35,43,58,0.08)" }}>
          <Trophy size={32} color="#CBD5E1" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 13, color: SLATE }}>No qualified leads in this range yet.</p>
        </div>
      ) : (
        <>
          {/* Podium */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(top.length, 3)}, 1fr)`, gap: 14 }}>
            {top.map((r, i) => (
              <div key={r.name} style={{
                background: T.surface1, borderRadius: 14, padding: 18, textAlign: "center",
                border: `1px solid ${medal(i)}55`, boxShadow: "0 2px 10px rgba(35,43,58,0.05)",
                order: i === 0 ? 2 : i === 1 ? 1 : 3,
              }}>
                <Medal size={22} color={medal(i) || SLATE} style={{ marginBottom: 6 }} />
                <p style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{r.name}</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: medal(i) || NAVY, lineHeight: 1.2 }}>{r.points}</p>
                <p style={{ fontSize: 11, color: SLATE }}>points · {r.conversion}% conv.</p>
              </div>
            ))}
          </div>

          {/* Full table */}
          <div style={{ background: T.surface1, border: "1px solid rgba(35,43,58,0.08)", borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.surface3 }}>
                  {["#", "Caller", "Hot", "Warm", "Cold", "Total", "Conv.", "Points"].map((h) => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: h === "Caller" ? "left" : "center", fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name} style={{ borderTop: "1px solid rgba(35,43,58,0.05)" }}>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, fontWeight: 800, color: medal(i) || SLATE }}>{i + 1}</td>
                    <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: NAVY }}>{r.name}</td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#DC2626", fontWeight: 700 }}>{r.hot || "—"}</td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#EA580C", fontWeight: 700 }}>{r.warm || "—"}</td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#0284C7", fontWeight: 700 }}>{r.cold || "—"}</td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: SLATE }}>{r.total}</td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: NAVY, fontWeight: 700 }}>{r.conversion}%</td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 13, fontWeight: 900, color: NAVY }}>{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
