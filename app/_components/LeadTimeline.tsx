"use client";

// Chronological activity log for a lead, backed by public.lead_events
// (written by the 0003 audit triggers + future app events).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Clock, Plus, ArrowRightLeft, Columns3, Upload, RefreshCw,
  Home, StickyNote, UserCog, CalendarClock,
} from "lucide-react";

const NAVY = "#232B3A";
const SLATE = "#4B5563";

type Evt = {
  id: string;
  type: string;
  actor_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const META: Record<string, { icon: typeof Clock; color: string; label: (p: Record<string, unknown>) => string }> = {
  created:            { icon: Plus, color: "#059669", label: () => "Lead created" },
  status_changed:     { icon: ArrowRightLeft, color: "#2F6BFF", label: (p) => `Status: ${p.from ?? "—"} → ${p.to ?? "—"}` },
  stage_changed:      { icon: Columns3, color: "#7C3AED", label: (p) => `Stage: ${p.from ?? "—"} → ${p.to ?? "—"}` },
  assignment_changed: { icon: UserCog, color: "#EA580C", label: () => "Reassigned" },
  call_uploaded:      { icon: Upload, color: "#0284C7", label: () => "Call recording uploaded" },
  call_reprocessed:   { icon: RefreshCw, color: "#0284C7", label: () => "Call re-analyzed" },
  property_enriched:  { icon: Home, color: "#059669", label: () => "Property data enriched" },
  followup_set:       { icon: CalendarClock, color: "#92400E", label: () => "Follow-up scheduled" },
  note:               { icon: StickyNote, color: SLATE, label: (p) => String(p.text ?? "Note added") },
};

export function LeadTimeline({ leadId }: { leadId: string }) {
  const [events, setEvents] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("id, type, actor_id, payload, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) { setUnavailable(true); setLoading(false); return; }
      setEvents((data || []) as Evt[]);
      setLoading(false);
    })();
  }, [leadId]);

  if (unavailable) return null; // table not present yet (pre-migration) — hide quietly

  return (
    <div style={{ background: "#FFF", border: "1px solid rgba(35,43,58,0.08)", borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Clock size={16} color={NAVY} />
        <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Activity Timeline</h3>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: SLATE }}>Loading…</p>
      ) : events.length === 0 ? (
        <p style={{ fontSize: 12, color: "#94A3B8" }}>No activity recorded yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {events.map((e, i) => {
            const m = META[e.type] || { icon: Clock, color: SLATE, label: () => e.type };
            const Icon = m.icon;
            const last = i === events.length - 1;
            return (
              <div key={e.id} style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: `${m.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} color={m.color} />
                  </span>
                  {!last && <span style={{ flex: 1, width: 2, background: "rgba(35,43,58,0.08)", margin: "2px 0" }} />}
                </div>
                <div style={{ paddingBottom: last ? 0 : 16, flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, lineHeight: 1.4 }}>{m.label(e.payload || {})}</p>
                  <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    {new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
