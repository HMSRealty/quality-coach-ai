"use client";

// Global background-activity monitor. Mounted once in the dashboard layout so
// it survives navigation — shows every lead currently being analyzed (status
// "Processing") as a floating, expandable pill in the bottom-right corner.
// Polls every few seconds and also listens to Supabase Realtime for instant
// updates. Hides itself entirely when nothing is in flight.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, ChevronUp, ChevronDown, CheckCircle2, Activity, Clock, X, StopCircle } from "lucide-react";

const SKY = "#3B82F6";
const SKY_600 = "#2563EB";
const MONEY = "#2563EB";

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

    // Heartbeat: while ANY lead is Queued OR Processing, tick the server queue
    // every poll. The tick is idempotent — it returns "busy" if a lead is fresh,
    // resets a stuck one, and otherwise starts the next. Firing on active leads
    // too means even a single stuck Processing lead (nothing queued behind it)
    // gets watchdog-reset and re-driven instead of spinning forever.
    const anyJob = next.length > 0;
    if (anyJob && uid) {
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

  // Cancel an individual job: flip the lead's status to "Error" with a
  // cancellation note so it drops out of the queue.
  const cancelJob = async (leadId: string) => {
    const uid = uidRef.current;
    if (!uid) return;
    // Optimistically remove from local state for snappier UI.
    setJobs((p) => p.filter((j) => j.id !== leadId));
    const { data: row } = await supabase.from("leads").select("metadata").eq("id", leadId).maybeSingle();
    const meta = { ...(row?.metadata as Record<string, unknown> || {}), cancelled_at: new Date().toISOString() };
    await supabase.from("leads").update({ status: "Error", metadata: meta }).eq("id", leadId).eq("user_id", uid);
  };

  // Cancel everything currently in the monitor.
  const cancelAll = async () => {
    if (!confirm(`Cancel all ${count} ${count === 1 ? "job" : "jobs"}? They'll be marked as Error and can be re-analyzed later from the Call Library.`)) return;
    const uid = uidRef.current;
    if (!uid) return;
    const ids = jobs.map((j) => j.id);
    setJobs([]);
    await supabase.from("leads").update({ status: "Error" }).in("id", ids).eq("user_id", uid);
  };

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
          marginBottom: 8, background: "#0A0A0E", borderRadius: 14, border: "1px solid var(--border-2)",
          boxShadow: "0 20px 50px rgba(15,23,42,0.22)", overflow: "hidden",
        }}>
          <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border-1)", display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={15} color={SKY_600} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#F4F4FF", flex: 1 }}>
              {active} analyzing{queued > 0 ? ` · ${queued} queued` : ""}
            </span>
            {count > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); cancelAll(); }}
                title="Cancel all jobs"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 9px", borderRadius: 7,
                  background: "rgba(251,113,133,0.12)", border: "1px solid #FECACA",
                  color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                <StopCircle size={12} /> Cancel all
              </button>
            )}
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {jobs.map((j, i) => (
              <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border-1)", opacity: j.pending ? 0.7 : 1 }}>
                {j.pending
                  ? <Clock size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                  : <Loader2 size={14} className="animate-spin" style={{ color: SKY, flexShrink: 0 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: "#F4F4FF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.address}</p>
                  <p style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {j.pending ? `Queued${typeof i === "number" ? ` · #${i + 1 - active}` : ""}` : `Analyzing${j.agent ? ` · ${j.agent}` : ""} · ${ageLabel(j.since)}`}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); cancelJob(j.id); }}
                  title="Cancel this job"
                  style={{
                    flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 26, height: 26, borderRadius: 6,
                    background: "transparent", border: "1px solid var(--border-2)",
                    color: "var(--text-3)", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,113,133,0.12)"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.color = "#DC2626"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-3)"; }}
                >
                  <X size={13} />
                </button>
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
          background: count > 0 ? "linear-gradient(135deg, #3B82F6, #2563EB)" : MONEY,
          color: "#fff", fontSize: 13, fontWeight: 800,
          boxShadow: count > 0 ? "0 10px 26px rgba(59,130,246,0.45)" : "0 10px 26px rgba(10,95,82,0.40)",
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
