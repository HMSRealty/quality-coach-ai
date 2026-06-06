"use client";

// Agent Scorecard — grades the caller out of 100 based on their last 90 days of
// leads (not just this one call). Cached server-side for 12h.
import { useEffect, useState } from "react";
import { Award, Loader2, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";

interface Result {
  grade: number;
  rationale: string;
  strengths: string[];
  weaknesses: string[];
  leadsCounted: number;
  cached?: boolean;
}

export function AgentScorecard({ agentName }: { agentName: string | null | undefined }) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchOne = async (force = false) => {
    if (!agentName) { setLoading(false); return; }
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/agents/scorecard", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ agentName, force }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) setData(j as Result);
    setBusy(false); setLoading(false);
  };

  useEffect(() => { fetchOne(false); }, [agentName]);

  if (!agentName) return null;
  const grade = data?.grade ?? 0;
  const gradeColor = grade >= 80 ? "#10B981" : grade >= 60 ? "#F2266F" : grade >= 40 ? "#F59E0B" : "#DC2626";

  return (
    <div style={{
      borderRadius: 18, padding: 22,
      background: "var(--surface-1)", border: "1px solid var(--border-2)",
      boxShadow: "var(--shadow-md)", position: "relative", overflow: "hidden",
    }}>
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: T.gradPrimary }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10, background: T.gradPrimary,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Award size={15} color="#fff" />
          </span>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", color: "var(--text-3)", textTransform: "uppercase" }}>Agent Performance</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>Scorecard · {agentName}</p>
          </div>
        </div>
        <button onClick={() => fetchOne(true)} disabled={busy} className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>
          {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh
        </button>
      </div>

      {loading ? (
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--text-1)" }} />
      ) : data ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 14 }}>
            {/* Big grade ring */}
            <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
              <svg viewBox="0 0 110 110" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
                <circle cx="55" cy="55" r="46" fill="none" stroke="var(--surface-3)" strokeWidth="10" />
                <circle cx="55" cy="55" r="46" fill="none" stroke={gradeColor} strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(grade / 100) * (2 * Math.PI * 46)} ${2 * Math.PI * 46}`}
                  style={{ transition: "stroke-dasharray 700ms ease" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: gradeColor, lineHeight: 1, letterSpacing: "-0.02em" }}>{grade}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>OUT OF 100</span>
              </div>
            </div>
            <p style={{ flex: 1, fontSize: 13.5, color: "var(--text-1)", lineHeight: 1.55 }}>
              {data.rationale}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <Bucket label="Strengths" items={data.strengths} accent="#10B981" icon={TrendingUp} />
            <Bucket label="To improve" items={data.weaknesses} accent="#F59E0B" icon={TrendingDown} />
          </div>

          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10 }}>
            Based on the last {data.leadsCounted} decided lead{data.leadsCounted === 1 ? "" : "s"} (90 days).
            {data.cached ? " · cached" : ""}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: "var(--text-2)" }}>Could not generate a scorecard right now.</p>
      )}
    </div>
  );
}

function Bucket({ label, items, accent, icon: Icon }: { label: string; items: string[]; accent: string; icon: React.ComponentType<{ size?: number; color?: string }> }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-3)", border: "1px solid var(--border-1)" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: accent, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
        <Icon size={11} color={accent} /> {label}
      </p>
      {items.length === 0 ? <p style={{ fontSize: 12, color: "var(--text-3)" }}>—</p> : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((t, i) => (
            <li key={i} style={{ fontSize: 12.5, color: "var(--text-1)", display: "flex", gap: 7 }}>
              <span style={{ color: accent, fontWeight: 800 }}>›</span> {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
