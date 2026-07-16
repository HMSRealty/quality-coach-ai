"use client";

// The Performance Feed — the homepage.
//
// "The homepage should NOT be charts. The homepage should be a live activity
//  feed similar to Facebook or Slack. Managers should understand company
//  status in less than 30 seconds."
//
// Every row is written by Python into feed_events. Nothing here computes a
// number; it renders what the analytics service decided was worth saying.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Activity, TrendingUp, TrendingDown, Flame, Users2,
  LifeBuoy, ShieldAlert, Megaphone, Inbox,
} from "lucide-react";

type Severity = "info" | "success" | "warning" | "critical";
type Kind = "alert" | "milestone" | "action_plan" | "hot_lead" | "campaign" | "team" | "system";

interface FeedEvent {
  id: number;
  kind: Kind;
  severity: Severity;
  title: string;
  detail: string | null;
  link_path: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
}

// The brief's colour language:
//   red = regression, green = win, amber = watch, blue = team milestone
const SEV: Record<Severity, { dot: string; tint: string; ring: string }> = {
  critical: { dot: "#EF4444", tint: "rgba(239,68,68,0.08)",  ring: "rgba(239,68,68,0.22)" },
  warning:  { dot: "#F59E0B", tint: "rgba(245,158,11,0.08)", ring: "rgba(245,158,11,0.22)" },
  success:  { dot: "#10B981", tint: "rgba(16,185,129,0.08)", ring: "rgba(16,185,129,0.22)" },
  info:     { dot: "#3B82F6", tint: "rgba(59,130,246,0.08)", ring: "rgba(59,130,246,0.22)" },
};

const KIND_ICON: Record<Kind, typeof Activity> = {
  alert: ShieldAlert,
  milestone: TrendingUp,
  action_plan: LifeBuoy,
  hot_lead: Flame,
  campaign: Megaphone,
  team: Users2,
  system: Activity,
};

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function EventRow({ e }: { e: FeedEvent }) {
  const sev = SEV[e.severity] ?? SEV.info;
  const Icon = KIND_ICON[e.kind] ?? Activity;
  const [hover, setHover] = useState(false);

  const body = (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", gap: 14, padding: "16px 18px",
        borderRadius: 14,
        background: hover ? sev.tint : "var(--surface-1)",
        border: `1px solid ${hover ? sev.ring : "var(--border-2)"}`,
        transition: "all 160ms cubic-bezier(0.16,1,0.30,1)",
        transform: hover && e.link_path ? "translateX(2px)" : "none",
        cursor: e.link_path ? "pointer" : "default",
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: sev.tint, border: `1px solid ${sev.ring}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} color={sev.dot} strokeWidth={2.1} />
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 650, color: "var(--text-1)", lineHeight: 1.4 }}>
            {e.title}
          </p>
          <span style={{ fontSize: 11, color: "var(--text-4)", flexShrink: 0, marginLeft: "auto" }}>
            {relTime(e.created_at)}
          </span>
        </div>
        {e.detail && (
          <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.5 }}>
            {e.detail}
          </p>
        )}
      </div>
    </div>
  );

  return e.link_path ? (
    <Link href={e.link_path} style={{ textDecoration: "none" }}>{body}</Link>
  ) : body;
}

// An empty feed is ambiguous: it can mean "a quiet day" or "the pipeline is
// dead". Those need opposite responses, so never render the same blank box for
// both. Say which one it is.
function EmptyFeed() {
  return (
    <div style={{
      padding: "56px 32px", textAlign: "center",
      border: "1px dashed var(--border-3)", borderRadius: 16,
      background: "var(--surface-1)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, margin: "0 auto 16px",
        background: "var(--surface-3)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <Inbox size={20} color="var(--text-3)" />
      </div>
      <p style={{ fontSize: 15, fontWeight: 650, color: "var(--text-1)" }}>
        No activity yet
      </p>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6, maxWidth: 460, margin: "6px auto 0", lineHeight: 1.6 }}>
        The feed fills in once your dialer starts posting calls. Nothing has
        arrived yet — this is an empty system, not a quiet day.
      </p>
      <Link href="/dashboard/integrations" style={{
        display: "inline-block", marginTop: 18, padding: "9px 18px",
        borderRadius: 999, fontSize: 13, fontWeight: 650,
        background: "var(--text-1)", color: "var(--canvas)", textDecoration: "none",
      }}>
        Connect your dialer
      </Link>
    </div>
  );
}

export function FeedStream() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("feed_events")
        .select("id, kind, severity, title, detail, link_path, evidence, created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (cancelled) return;
      // Surface the failure. A feed that silently renders empty on error is
      // indistinguishable from a healthy quiet system — the single most
      // expensive ambiguity in an ops tool.
      if (error) setError(error.message);
      else setEvents((data ?? []) as FeedEvent[]);
      setLoading(false);
    })();

    // Live updates — the feed is meant to be watched, not refreshed.
    const ch = supabase
      .channel("feed_events_stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feed_events" },
        (payload) => setEvents((prev) => [payload.new as FeedEvent, ...prev].slice(0, 60)),
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            height: 76, borderRadius: 14,
            background: "var(--surface-2)", opacity: 1 - i * 0.25,
          }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "20px 22px", borderRadius: 14,
        background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
      }}>
        <p style={{ fontSize: 14, fontWeight: 650, color: "#EF4444" }}>Feed unavailable</p>
        <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 5 }}>
          {error} — this is a failure to read the feed, not an absence of activity.
        </p>
      </div>
    );
  }

  if (events.length === 0) return <EmptyFeed />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {events.map((e) => <EventRow key={e.id} e={e} />)}
    </div>
  );
}
