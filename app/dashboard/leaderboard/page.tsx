"use client";

// Competitive leaderboard — avatar cards w/ sparkline trend behind each agent,
// glowing pill badges (Hot 1 · Warm 1 · Cold 0.5).
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import { Loader2, Trophy, Flame, Sun, Snowflake, TrendingUp } from "lucide-react";

const NAVY = T.navy;
const SLATE = T.slate;

function estDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}
function estShift(days: number): string {
  return estDate(new Date(Date.now() + days * 86_400_000));
}

const POINTS: Record<string, number> = { hot: 1, warm: 1, cold: 0.5 };
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");

type Row = {
  name: string;
  hot: number; warm: number; cold: number; qualified: number; total: number;
  points: number; conversion: number;
  spark: number[]; // daily points across the range
};

const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

function Sparkline({ data, color, w = 220, h = 80 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => ({ x: i * step, y: h - (v / max) * (h - 12) - 6 }));
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
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  const id = `sg${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.6 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function GlowingPill({ icon: Icon, label, count, color }: { icon: React.ComponentType<{ size?: number }>; label: string; count: number; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 11px", borderRadius: 999,
      background: `${color}1A`, color,
      border: `1px solid ${color}55`,
      fontSize: 11, fontWeight: 800,
      boxShadow: count > 0 ? `0 0 18px ${color}55` : "none",
      transition: "box-shadow 220ms ease",
    }}>
      <Icon size={11} /> {label} <span style={{ opacity: 0.85 }}>{count}</span>
    </span>
  );
}

const initials = (s: string) => (s || "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const from = estShift(-(d - 1));
    const to = estDate();
    const { data } = await supabase.from("leads")
      .select("agent_name, status, submission_date")
      .gte("submission_date", from).lte("submission_date", to);

    type LR = { agent_name: string | null; status: string; submission_date: string | null };
    const map = new Map<string, Row>();

    // pre-seed daily indexes
    const dates: string[] = Array.from({ length: d }, (_, i) => estShift(-(d - 1 - i)));
    const dateIdx = new Map(dates.map((s, i) => [s, i]));

    for (const l of (data || []) as LR[]) {
      const name = l.agent_name?.trim() || "Unassigned";
      const r = map.get(name) || {
        name, hot: 0, warm: 0, cold: 0, qualified: 0, total: 0, points: 0, conversion: 0,
        spark: Array(d).fill(0),
      };
      r.total++;
      const s = norm(l.status);
      const pts = POINTS[s] || 0;
      if (s === "hot") r.hot++;
      else if (s === "warm") r.warm++;
      else if (s === "cold") r.cold++;
      r.points += pts;
      const di = l.submission_date ? dateIdx.get(l.submission_date) : undefined;
      if (di !== undefined) r.spark[di] += pts;
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

  const medalColor = (i: number) => i === 0 ? "#FACC15" : i === 1 ? "#94A3B8" : i === 2 ? "#F97316" : null;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em" }}>
            Leaderboard
          </h1>
          <p style={{ fontSize: 13, color: SLATE, marginTop: 4 }}>
            Compete for the top spot. Last {days} days · EST.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <GlowingPill icon={Flame} label="Hot" count={1} color="#DC2626" />
            <GlowingPill icon={Sun} label="Warm" count={1} color="#EA580C" />
            <GlowingPill icon={Snowflake} label="Cold" count={0.5} color="#0284C7" />
            <span style={{ fontSize: 11, color: SLATE, alignSelf: "center", marginLeft: 4 }}>pts per qualification</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
      ) : rows.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "var(--surface-1)", borderRadius: 18, border: "1px solid var(--border-2)" }}>
          <Trophy size={36} color="#CBD5E1" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, color: SLATE }}>No qualified leads in this range yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {rows.map((r, i) => {
            const medal = medalColor(i);
            const accent = i === 0 ? T.magenta as string : i === 1 ? "#7C3AED" : "#0284C7";
            const lineColor = i === 0 ? "#F2266F" : i === 1 ? "#7C3AED" : "#0284C7";
            return (
              <div key={r.name} className="reveal" style={{
                position: "relative", overflow: "hidden",
                background: "var(--surface-1)", border: `1px solid ${medal ? medal + "55" : "var(--border-2)"}`,
                borderRadius: 18, padding: 18,
                boxShadow: medal ? `0 12px 30px ${medal}28` : "var(--shadow-md)",
              }}>
                {/* Sparkline behind everything */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  <Sparkline data={r.spark} color={lineColor} />
                </div>

                {/* Rank ribbon */}
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: "50%",
                      background: `linear-gradient(135deg, ${accent}, #7C3AED)`,
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 900, letterSpacing: "0.04em",
                      boxShadow: medal ? `0 12px 26px ${medal}55` : "0 8px 20px rgba(0,0,0,0.10)",
                    }}>{initials(r.name)}</div>
                    {medal && (
                      <span style={{
                        position: "absolute", bottom: -4, right: -4,
                        width: 22, height: 22, borderRadius: "50%", background: medal, color: "#0B0F1F",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 900, border: "2px solid var(--surface-1)",
                      }}>{i + 1}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{r.name}</p>
                    <p style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>
                      <strong style={{ color: NAVY }}>#{i + 1}</strong> · {r.conversion}% conversion · {r.total} call{r.total === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 28, fontWeight: 900, color: NAVY, lineHeight: 1, letterSpacing: "-0.02em" }}>{r.points}</p>
                    <p style={{ fontSize: 10, color: SLATE, fontWeight: 700, letterSpacing: "0.06em" }}>PTS</p>
                  </div>
                </div>

                {/* Glowing pills */}
                <div style={{ position: "relative", display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                  <GlowingPill icon={Flame} label="Hot" count={r.hot} color="#DC2626" />
                  <GlowingPill icon={Sun} label="Warm" count={r.warm} color="#EA580C" />
                  <GlowingPill icon={Snowflake} label="Cold" count={r.cold} color="#0284C7" />
                </div>

                {/* Trend marker */}
                <div style={{ position: "relative", marginTop: 10, display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: SLATE }}>
                  <TrendingUp size={11} color={lineColor} />
                  <span>Daily trend</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
