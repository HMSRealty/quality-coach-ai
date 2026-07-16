"use client";

// Performance Feed — the homepage.
//
// This replaced a chart-and-KPI overview. Per the brief: "The homepage should
// NOT be charts ... Managers should understand company status in less than 30
// seconds." Charts answer questions you already knew to ask; a feed tells you
// which question to ask. Numbers live one click away in Executive/Analytics.
//
// Everything rendered here is written by the Python analytics service into
// feed_events. This page performs no calculation of its own.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { FeedStream } from "@/app/_components/FeedStream";
import { Activity, ArrowRight } from "lucide-react";

export default function PerformanceFeedPage() {
  const [orgName, setOrgName] = useState<string>("");
  const [hookLive, setHookLive] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      if (!prof?.organization_id) return;
      const { data: org } = await supabase
        .from("organizations").select("name").eq("id", prof.organization_id).maybeSingle();
      if (org?.name) setOrgName(org.name);

      // Has the dialer ever actually posted? "Configured" and "receiving" are
      // different states, and confusing them is how a dead feed goes unnoticed.
      const { count } = await supabase
        .from("ingest_events")
        .select("id", { count: "exact", head: true });
      setHookLive((count ?? 0) > 0);
    })();
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <header style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <Activity size={15} color="#3B82F6" />
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--text-3)",
          }}>
            Performance Feed
          </span>
        </div>
        <h1 style={{
          fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em",
          color: "var(--text-1)", fontFamily: "var(--font-display)",
        }}>
          {orgName ? `What's happening at ${orgName}` : "What's happening"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 7, lineHeight: 1.6 }}>
          Everything worth knowing, newest first. Drill into any item for the
          numbers behind it.
        </p>
      </header>

      {/* When the feed is empty, this is the difference between "quiet day" and
          "nothing is wired up" — opposite problems, opposite responses. */}
      {hookLive === false && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "13px 16px", borderRadius: 12, marginBottom: 18,
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.24)",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", flexShrink: 0,
          }} />
          <p style={{ fontSize: 12.5, color: "var(--text-2)", flex: 1 }}>
            No calls have reached RealTrack yet. Your webhook is live and waiting
            — point your dialer at it to start the feed.
          </p>
          <Link href="/dashboard/integrations" style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: 700, color: "#B45309", textDecoration: "none",
            flexShrink: 0,
          }}>
            Set up <ArrowRight size={12} />
          </Link>
        </div>
      )}

      <FeedStream />
    </div>
  );
}
