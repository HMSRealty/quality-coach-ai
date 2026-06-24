"use client";

// Leaderboard — clean ranked table, easy to scan at a glance.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import { Loader2, Trophy, Flame, Sun, Snowflake, TrendingUp, Eye } from "lucide-react";
import { useRouter } from "next/navigation";

const NAVY = T.text1;
const SLATE = T.text2;

function estDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}
function estShift(days: number): string {
  return estDate(new Date(Date.now() + days * 86_400_000));
}

const POINTS: Record<string, number> = { hot: 1, warm: 1, cold: 0.5 };
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Row = {
  name: string;
  hot: number; warm: number; cold: number; callback: number; needscall: number;
  disqualified: number; duplicate: number; error: number;
  qualified: number; total: number;
  points: number; conversion: number;
  dailyTarget: number; dayCount: number; targetTotal: number;
  pacePct: number; bonus: number;
};

const BONUS_PER_POINT = 25;

const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

const MEDAL: Record<number, { color: string; label: string }> = {
  0: { color: "#FACC15", label: "1st" },
  1: { color: "#94A3B8", label: "2nd" },
  2: { color: "#F97316", label: "3rd" },
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [pace, setPace] = useState<"all" | "onpace" | "behind">("all");

  const load = useCallback(async (d: number) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const from = estShift(-(d - 1));
    const to = estDate();
    const { data } = await supabase.from("leads")
      .select("agent_name, status, submission_date")
      .gte("submission_date", from).lte("submission_date", to);

    const { data: ag } = await supabase.from("cold_callers")
      .select("name, daily_target, shift_type")
      .eq("user_id", user.id);
    const targetByName = new Map<string, number>();
    (ag || []).forEach((a: { name: string | null; daily_target: number | null; shift_type: string | null }) => {
      if (!a.name) return;
      const t = typeof a.daily_target === "number" ? a.daily_target : (a.shift_type === "part_time" ? 1 : 2);
      targetByName.set(a.name.trim(), t);
    });

    type LR = { agent_name: string | null; status: string; submission_date: string | null };
    const map = new Map<string, Row>();
    const activeDays = new Map<string, Set<string>>();

    for (const l of (data || []) as LR[]) {
      const name = l.agent_name?.trim() || "Unassigned";
      const r = map.get(name) || {
        name, hot: 0, warm: 0, cold: 0, callback: 0, needscall: 0,
        disqualified: 0, duplicate: 0, error: 0,
        qualified: 0, total: 0, points: 0, conversion: 0,
        dailyTarget: targetByName.get(name) ?? 2,
        dayCount: 0, targetTotal: 0, pacePct: 0, bonus: 0,
      };
      r.total++;
      const s = norm(l.status);
      const pts = POINTS[s] || 0;
      if (s === "hot") r.hot++;
      else if (s === "warm") r.warm++;
      else if (s === "cold") r.cold++;
      else if (s === "callback") r.callback++;
      else if (s === "needscall") r.needscall++;
      else if (s === "disqualified") r.disqualified++;
      else if (s === "duplicate") r.duplicate++;
      else if (s === "error") r.error++;
      r.points += pts;
      if (l.submission_date) {
        const set = activeDays.get(name) || new Set<string>();
        set.add(l.submission_date);
        activeDays.set(name, set);
      }
      map.set(name, r);
    }
    const out = [...map.values()].map((r) => {
      r.qualified = r.hot + r.warm + r.cold;
      r.conversion = r.total > 0 ? Math.round((r.qualified / r.total) * 100) : 0;
      r.dayCount = activeDays.get(r.name)?.size || d;
      r.targetTotal = r.dailyTarget * r.dayCount;
      r.pacePct = r.targetTotal > 0 ? Math.round((r.points / r.targetTotal) * 100) : 0;
      r.bonus = Math.round(r.points * BONUS_PER_POINT);
      return r;
    }).sort((a, b) => b.points - a.points || b.conversion - a.conversion);
    setRows(out);
    setLoading(false);
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const shown = rows.filter(r =>
    (!q.trim() || r.name.toLowerCase().includes(q.toLowerCase())) &&
    (pace === "all" || (pace === "onpace" ? r.pacePct >= 100 : r.pacePct < 100)),
  );

  const th: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 800,
    letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)",
    whiteSpace: "nowrap", borderBottom: "1px solid var(--border-2)",
    background: "var(--surface-3)",
  };
  const td: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: NAVY, borderBottom: "1px solid var(--border-1)", verticalAlign: "middle" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <Trophy size={24} color="#FACC15" /> Leaderboard
          </h1>
          <p style={{ fontSize: 13, color: SLATE, marginTop: 4 }}>
            Who&apos;s closing, who&apos;s coasting. Last {days} days · EST.
          </p>
          {/* Point legend */}
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Pill icon={<Flame size={11} />} label="Hot = 1 pt" color="#DC2626" />
            <Pill icon={<Sun size={11} />} label="Warm = 1 pt" color="#EA580C" />
            <Pill icon={<Snowflake size={11} />} label="Cold = 0.5 pt" color="#0a5f52" />
            <Pill icon={<TrendingUp size={11} />} label={`$${BONUS_PER_POINT} / pt`} color="#0e7c6b" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search agent…"
            style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border-2)", background: "var(--surface-1)", color: "var(--text-1)", fontSize: 13, outline: "none", minWidth: 150 }} />
          <select value={pace} onChange={e => setPace(e.target.value as typeof pace)}
            style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border-2)", background: "var(--surface-1)", color: "var(--text-1)", fontSize: 13, outline: "none" }}>
            <option value="all">All pace</option>
            <option value="onpace">On pace</option>
            <option value="behind">Behind</option>
          </select>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setDays(r.days)} className={days === r.days ? "btn-brand" : "btn-ghost"}
              style={{ padding: "8px 16px", fontSize: 12 }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: "center" }}><Loader2 size={28} className="animate-spin" style={{ color: NAVY }} /></div>
      ) : shown.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "var(--surface-1)", borderRadius: 18, border: "1px solid var(--border-2)" }}>
          <Trophy size={36} color="#CBD5E1" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, color: SLATE }}>{rows.length ? "No agents match your filter." : "No qualified leads in this range yet."}</p>
        </div>
      ) : (
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 52, textAlign: "center" }}>#</th>
                  <th style={th}>Agent</th>
                  <th style={{ ...th, textAlign: "center" }}>Hot</th>
                  <th style={{ ...th, textAlign: "center" }}>Warm</th>
                  <th style={{ ...th, textAlign: "center" }}>Cold</th>
                  <th style={{ ...th, textAlign: "center" }}>Call Back</th>
                  <th style={{ ...th, textAlign: "center" }}>Needs Call</th>
                  <th style={{ ...th, textAlign: "center" }}>DQ</th>
                  <th style={{ ...th, textAlign: "center" }}>Dup</th>
                  <th style={{ ...th, textAlign: "center" }}>Error</th>
                  <th style={{ ...th, textAlign: "center" }}>Total</th>
                  <th style={{ ...th, textAlign: "center" }}>Conv.</th>
                  <th style={{ ...th, textAlign: "center" }}>Points</th>
                  <th style={{ ...th, textAlign: "center" }}>Pace</th>
                  <th style={{ ...th, textAlign: "right" }}>Est. Bonus</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const medal = MEDAL[i];
                  const isTop3 = i < 3;
                  return (
                    <tr key={r.name} style={{ background: isTop3 ? `color-mix(in srgb, ${medal?.color ?? "#fff"} 5%, var(--surface-1))` : "var(--surface-1)" }}>
                      {/* Rank */}
                      <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                        {medal ? (
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: medal.color, color: "#000", fontSize: 11, fontWeight: 900 }}>
                            {i + 1}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: SLATE, fontWeight: 700 }}>{i + 1}</span>
                        )}
                      </td>
                      {/* Name */}
                      <td style={{ ...td, fontWeight: 700, minWidth: 140 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                            background: i === 0 ? "linear-gradient(135deg,#FACC15,#D97706)" : i === 1 ? "linear-gradient(135deg,#94A3B8,#475569)" : "linear-gradient(135deg,#F97316,#9A3412)",
                            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 900,
                          }}>
                            {r.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <span style={{ color: NAVY, fontWeight: 700 }}>{r.name}</span>
                          <button onClick={() => router.push(`/dashboard/agents/${encodeURIComponent(r.name)}`)}
                            title="View agent"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "3px 8px", borderRadius: 6,
                              background: "var(--surface-3)", border: "1px solid var(--border-2)",
                              color: SLATE, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              opacity: 0.6, transition: "opacity 150ms",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                          ><Eye size={10} /> View</button>
                        </div>
                      </td>
                      {/* Counts */}
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.hot > 0 ? <Badge count={r.hot} color="#DC2626" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.warm > 0 ? <Badge count={r.warm} color="#EA580C" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.cold > 0 ? <Badge count={r.cold} color="#0a5f52" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.callback > 0 ? <Badge count={r.callback} color="#92400E" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.needscall > 0 ? <Badge count={r.needscall} color="#0a5f52" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.disqualified > 0 ? <Badge count={r.disqualified} color="#64748B" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.duplicate > 0 ? <Badge count={r.duplicate} color="#0a5f52" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.error > 0 ? <Badge count={r.error} color="#DC2626" /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center", color: SLATE }}>{r.total}</td>
                      {/* Conversion */}
                      <td style={{ ...td, textAlign: "center" }}>
                        <span style={{ fontWeight: 700, color: r.conversion >= 50 ? "#0e7c6b" : r.conversion >= 25 ? NAVY : SLATE }}>
                          {r.conversion}%
                        </span>
                      </td>
                      {/* Points */}
                      <td style={{ ...td, textAlign: "center" }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>{Math.round(r.points * 10) / 10}</span>
                      </td>
                      {/* Pace bar */}
                      <td style={{ ...td, textAlign: "center", minWidth: 120 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${Math.min(100, r.pacePct)}%`, borderRadius: 999,
                              background: r.pacePct >= 100 ? "#0e7c6b" : r.pacePct >= 80 ? "#0a5f52" : "#EA580C",
                              transition: "width 600ms ease",
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: r.pacePct >= 100 ? "#0e7c6b" : r.pacePct >= 80 ? NAVY : "#EA580C", minWidth: 36, textAlign: "right" }}>
                            {r.pacePct}%
                          </span>
                        </div>
                      </td>
                      {/* Bonus */}
                      <td style={{ ...td, textAlign: "right", fontWeight: 900, color: "#0e7c6b", fontSize: 14 }}>
                        {money(r.bonus)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999,
      background: `color-mix(in srgb, ${color} 12%, transparent)`, color,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      fontSize: 11, fontWeight: 700,
    }}>
      {icon} {label}
    </span>
  );
}

function Badge({ count, color }: { count: number; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 26, height: 22, padding: "0 7px", borderRadius: 999,
      background: `color-mix(in srgb, ${color} 12%, transparent)`, color,
      fontSize: 12, fontWeight: 800, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    }}>
      {count}
    </span>
  );
}
