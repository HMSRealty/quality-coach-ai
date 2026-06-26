"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Flag, Calendar, Phone, Clock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.text1;
const TEAL = T.teal;
const GOLD = T.teal;
const SLATE = T.text2;

interface Followup {
  id: string;
  agent_name: string;
  extracted_address: string;
  followup_date: string;
  followup_priority: string;
  followup_notes: string;
  bant_timeline: string;
  status: string;
}

export default function FollowupsPage() {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "urgent" | "today" | "week">("all");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("leads")
        .select("id, agent_name, extracted_address, followup_date, followup_priority, followup_notes, bant_timeline, status")
        .eq("user_id", user.id)
        .eq("followup_flag", true)
        .order("followup_date", { ascending: true });

      if (data) setFollowups(data as Followup[]);
      setLoading(false);
    })();
  }, []);

  const markComplete = async (id: string) => {
    await supabase
      .from("leads")
      .update({ followup_flag: false })
      .eq("id", id);
    setFollowups(prev => prev.filter(f => f.id !== id));
  };

  const today = new Date().toISOString().split("T")[0];
  const oneWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const filtered = followups.filter(f => {
    if (filter === "urgent") return f.followup_priority === "urgent" || f.followup_priority === "high";
    if (filter === "today") return f.followup_date === today;
    if (filter === "week") return f.followup_date >= today && f.followup_date <= oneWeek;
    return true;
  });

  const priorityColor = (p: string) => {
    if (p === "urgent") return "#DC2626";
    if (p === "high") return GOLD;
    if (p === "normal") return TEAL;
    return SLATE;
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: "40px 24px" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", color: NAVY }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Smart Follow-Ups</h1>
        <p style={{ fontSize: 13, color: SLATE }}>
          Leads flagged with future call-back intent. Auto-parsed from conversation context.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { id: "all", label: "All", count: followups.length },
          { id: "urgent", label: "Urgent", count: followups.filter(f => f.followup_priority === "urgent" || f.followup_priority === "high").length },
          { id: "today", label: "Today", count: followups.filter(f => f.followup_date === today).length },
          { id: "week", label: "This Week", count: followups.filter(f => f.followup_date >= today && f.followup_date <= oneWeek).length },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            style={{
              padding: "8px 14px", borderRadius: 9,
              background: filter === f.id ? NAVY : "#FFFFFF",
              color: filter === f.id ? "#fff" : NAVY,
              border: `1px solid ${filter === f.id ? NAVY : "rgba(35,43,58,0.10)"}`,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {f.label}
            <span style={{
              padding: "1px 7px", borderRadius: 999, fontSize: 10,
              background: filter === f.id ? "rgba(255,255,255,0.2)" : "#101018",
              color: filter === f.id ? "#fff" : SLATE,
            }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{
          padding: 60, textAlign: "center", borderRadius: 14,
          background: T.surface1, border: "1px solid rgba(35,43,58,0.08)",
        }}>
          <Flag size={36} color={SLATE} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>No flagged follow-ups</p>
          <p style={{ fontSize: 12, color: SLATE, marginTop: 4 }}>
            When prospects say things like "call me back in 2 months," they'll appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(f => (
            <div key={f.id} style={{
              padding: 18, background: T.surface1, borderRadius: 14,
              border: "1px solid rgba(35,43,58,0.08)",
              borderLeft: `4px solid ${priorityColor(f.followup_priority)}`,
              display: "grid", gridTemplateColumns: "1fr auto", gap: 16,
              boxShadow: "0 2px 8px rgba(35,43,58,0.04)",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 999,
                    background: `${priorityColor(f.followup_priority)}15`,
                    color: priorityColor(f.followup_priority),
                    fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {f.followup_priority}
                  </span>
                  <Calendar size={13} color={SLATE} />
                  <span style={{ fontSize: 12, color: SLATE, fontWeight: 600 }}>
                    {f.followup_date ? new Date(f.followup_date).toLocaleDateString() : "Date TBD"}
                  </span>
                  {f.bant_timeline && (
                    <>
                      <Clock size={13} color={TEAL} />
                      <span style={{ fontSize: 12, color: TEAL, fontWeight: 600 }}>
                        {f.bant_timeline}
                      </span>
                    </>
                  )}
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                  {f.extracted_address || "No address"}
                </p>
                <p style={{ fontSize: 12, color: SLATE, marginBottom: 8 }}>
                  Agent: <strong style={{ color: NAVY }}>{f.agent_name || "Unassigned"}</strong>
                </p>
                {f.followup_notes && (
                  <p style={{ fontSize: 12, color: SLATE, fontStyle: "italic", padding: "8px 10px", background: T.surface3, borderRadius: 6 }}>
                    "{f.followup_notes}"
                  </p>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <button style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 8,
                  background: T.midnight, color: "#fff", border: "none",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  <Phone size={12} /> Schedule Call
                </button>
                <button
                  onClick={() => markComplete(f.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 8,
                    background: "transparent", color: SLATE, border: "1px solid rgba(35,43,58,0.10)",
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <CheckCircle2 size={11} /> Mark Done
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
