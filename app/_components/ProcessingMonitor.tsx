"use client";

// Global background-activity monitor. Mounted once in the dashboard layout so
// it survives navigation — shows every lead currently being analyzed (status
// "Processing") as a floating, expandable pill in the bottom-right corner.
// Polls every few seconds and also listens to Supabase Realtime for instant
// updates. Hides itself entirely when nothing is in flight.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, ChevronUp, ChevronDown, CheckCircle2, Activity, Clock } from "lucide-react";

const SKY = "#0EA5E9";
const SKY_600 = "#0284C7";
const MONEY = "#059669";

interface Job { id: string; address: string; agent: string | null; since: string | null; pending: boolean; }

export function ProcessingMonitor() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const [justDone, setJustDone] = useState(0);     // count that flipped out of Processing
  const prevIds = useRef<Set<string>>(new Set());
  const uidRef = useRef<string | null>(null);

  const load = async () => {
    let uid = uidRef.current;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      uid = user.id; uidRef.current = uid;
    }
    const { data } = await supabase
      .from("leads")
      .select("id, extracted_address, agent_name, created_at, status")
      .eq("user_id", uid)
      .in("status", ["Processing", "Queued"])
      .order("created_at", { ascending: true })
      .limit(200);

    // Active (Processing) first, then the queued ones in line order.
    const rows = (data || []) as Array<{ id: string; extracted_address: string | null; agent_name: string | null; created_at: string | null; status: string }>;
    const next: Job[] = rows
      .map((d) => ({
        id: d.id,
        address: d.extracted_address || "Address pending…",
        agent: d.agent_name || null,
        since: d.created_at || null,
        pending: String(d.status).toLowerCase() === "queued",
      }))
      .sort((a, b) => Number(a.pending) - Number(b.pending));

    // Detect completions: ids that were processing last tick but aren't now.
    const nextIds = new Set(next.map((j) => j.id));
    let completed = 0;
    prevIds.current.forEach((id) => { if (!nextIds.has(id)) completed++; });
    if (completed > 0) {
      setJustDone((c) => c + completed);
      // auto-clear the "done" flash after a few seconds
      window.setTimeout(() => setJustDone((c) => Math.max(0, c - completed)), 6000);
    }
    prevIds.current = nextIds;
    setJobs(next);

    // Heartbeat: while any lead is Queued, tick the server queue every poll. The
    // tick is idempotent — it returns "busy" if a fresh lead is processing,
    // resets any stuck lead, and otherwise starts the next. This keeps the queue
    // moving and self-heals a dropped background chain whenever the app is open.
    const anyQueued = next.some((j) => j.pending);
    if (anyQueued && uid) {
      fetch("/api/leads/process-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      }).catch(() => {});
    }
  };

  useEffect(() => {
    load();
    const poll = window.setInterval(load, 4000);
    // Realtime nudge — refetch on any change to this user's leads.
    const ch = supabase
      .channel("processing-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .subscribe();
    return () => { window.clearInterval(poll); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = jobs.length;
  const active = jobs.filter((j) => !j.pending).length;
  const queued = jobs.filter((j) => j.pending).length;
  if (count === 0 && justDone === 0) return null;

  const ageLabel = (since: string | null) => {
    if (!since) return "";
    const s = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60); return `${m}m ${s % 60}s`;
  };

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 10000, width: open ? 340 : "auto", maxWidth: "calc(100vw - 36px)" }}>
      {/* Expanded list */}
      {open && count > 0 && (
        <div style={{
          marginBottom: 8, background: "#fff", borderRadius: 14, border: "1px solid var(--border-2)",
          boxShadow: "0 20px 50px rgba(15,23,42,0.22)", overflow: "hidden",
        }}>
          <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border-1)", display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={15} color={SKY_600} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#000" }}>
              {active} analyzing{queued > 0 ? ` · ${queued} queued` : ""}
            </span>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {jobs.map((j, i) => (
              <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border-1)", opacity: j.pending ? 0.7 : 1 }}>
                {j.pending
                  ? <Clock size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                  : <Loader2 size={14} className="animate-spin" style={{ color: SKY, flexShrink: 0 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.address}</p>
                  <p style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {j.pending ? `Queued${typeof i === "number" ? ` · #${i + 1 - active}` : ""}` : `Analyzing${j.agent ? ` · ${j.agent}` : ""} · ${ageLabel(j.since)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pill */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 15px",
          borderRadius: 999, border: "none", cursor: "pointer",
          background: count > 0 ? "linear-gradient(135deg, #0EA5E9, #0284C7)" : MONEY,
          color: "#fff", fontSize: 13, fontWeight: 800,
          boxShadow: count > 0 ? "0 10px 26px rgba(14,165,233,0.45)" : "0 10px 26px rgba(5,150,105,0.40)",
          float: "right",
        }}
      >
        {count > 0 ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            {active} analyzing{queued > 0 ? ` · ${queued} queued` : ""}
            {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </>
        ) : (
          <><CheckCircle2 size={15} /> {justDone} done</>
        )}
      </button>
    </div>
  );
}
