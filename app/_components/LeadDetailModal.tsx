"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, Flag, Calendar, MapPin, DollarSign, Phone, User, FileText, Loader2, CheckCircle2 } from "lucide-react";

const NAVY = "#1A1A1A";
const TEAL = "#C75B39";
const GOLD = "#B0703A";
const SLATE = "#5B5249";

interface Lead {
  id: string;
  status?: string | null;
  extracted_address?: string | null;
  asking_price?: number | null;
  qualification_reason?: string | null;
  agent_name?: string | null;
  created_at?: string;
  followup_flag?: boolean | null;
  followup_date?: string | null;
  followup_priority?: string | null;
  followup_notes?: string | null;
  bant_budget?: string | null;
  bant_authority?: string | null;
  bant_need?: string | null;
  bant_timeline?: string | null;
  call_recording_url?: string | null;
}

export function LeadDetailModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Follow-up state
  const [flag, setFlag] = useState(false);
  const [date, setDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (data) {
        setLead(data);
        setFlag(!!data.followup_flag);
        setDate(data.followup_date || "");
        setPriority(data.followup_priority || "normal");
        setNotes(data.followup_notes || "");
      }
      setLoading(false);
    })();
  }, [leadId]);

  const saveFollowup = async () => {
    setSaving(true);
    await supabase.from("leads").update({
      followup_flag: flag,
      followup_date: date || null,
      followup_priority: priority,
      followup_notes: notes || null,
    }).eq("id", leadId);
    setSaving(false);
    onClose();
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(26,26,26,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      backdropFilter: "blur(4px)", padding: 20, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFF", borderRadius: 18, maxWidth: 720, width: "100%",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(26,26,26,0.30)",
      }} className="animate-scale">
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid rgba(26,26,26,0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: `linear-gradient(135deg, ${NAVY}03 0%, ${TEAL}08 100%)`,
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>Lead Details</h2>
            <p style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>ID: {leadId.slice(0, 8)}...</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: SLATE }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: NAVY }} />
          </div>
        ) : !lead ? (
          <div style={{ padding: 40, textAlign: "center", color: SLATE }}>Lead not found.</div>
        ) : (
          <div style={{ padding: 24 }}>
            {/* Status banner */}
            {(() => {
              const QSET = ["Hot", "Warm", "Cold"];
              const ok = QSET.includes(lead.status || "");
              const bad = lead.status === "Disqualified";
              return (
                <div style={{
                  padding: "10px 14px", borderRadius: 10, marginBottom: 20,
                  background: ok ? "#ECFDF5" : bad ? "#F2EDE5" : "#FFFBEB",
                  border: `1px solid ${ok ? "#A7F3D0" : bad ? "rgba(26,26,26,0.10)" : "#FCD34D"}`,
                  fontSize: 12, fontWeight: 700,
                  color: ok ? "#059669" : bad ? NAVY : "#92400E",
                }}>
                  Status: {lead.status || "Unknown"}
                </div>
              );
            })()}

            {/* Facts grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              <Fact icon={MapPin} label="Address" value={lead.extracted_address || "—"} />
              <Fact icon={DollarSign} label="Asking Price" value={lead.asking_price ? `$${lead.asking_price.toLocaleString()}` : "—"} />
              <Fact icon={User} label="Agent" value={lead.agent_name || "—"} />
              <Fact icon={Calendar} label="Created" value={lead.created_at ? new Date(lead.created_at).toLocaleString() : "—"} />
            </div>

            {/* BANT */}
            {(lead.bant_budget || lead.bant_authority || lead.bant_need || lead.bant_timeline) && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Qualifiers</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {lead.bant_budget && <BANTChip label="Budget" value={lead.bant_budget} />}
                  {lead.bant_authority && <BANTChip label="Authority" value={lead.bant_authority} />}
                  {lead.bant_need && <BANTChip label="Need" value={lead.bant_need} />}
                  {lead.bant_timeline && <BANTChip label="Timeline" value={lead.bant_timeline} />}
                </div>
              </div>
            )}

            {/* Reasoning */}
            {lead.qualification_reason && (
              <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "#FAF8F4", border: "1px solid rgba(26,26,26,0.06)" }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
                  <FileText size={13} style={{ display: "inline", marginRight: 5, marginBottom: -2 }} />
                  Reasoning
                </h3>
                <p style={{ fontSize: 12, color: SLATE, lineHeight: 1.6 }}>{lead.qualification_reason}</p>
              </div>
            )}

            {/* Call recording */}
            {lead.call_recording_url && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Call Recording</h3>
                <audio controls src={lead.call_recording_url} style={{ width: "100%" }} />
              </div>
            )}

            {/* Follow-up section */}
            <div style={{
              padding: 16, borderRadius: 12,
              background: flag ? `${GOLD}10` : "#FAF8F4",
              border: flag ? `1px solid ${GOLD}50` : "1px solid rgba(26,26,26,0.08)",
              transition: "all 240ms cubic-bezier(0.16,1,0.30,1)",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: flag ? 14 : 0 }}>
                <input type="checkbox" checked={flag} onChange={e => setFlag(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <Flag size={14} color={flag ? GOLD : SLATE} />
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Flag for follow-up</span>
              </label>

              {flag && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: SLATE, marginBottom: 4 }}>Date</label>
                      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
                        width: "100%", padding: "8px 10px", borderRadius: 8,
                        background: "#FFF", border: "1px solid rgba(26,26,26,0.10)",
                        fontSize: 12, color: NAVY, outline: "none",
                      }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: SLATE, marginBottom: 4 }}>Priority</label>
                      <select value={priority} onChange={e => setPriority(e.target.value)} style={{
                        width: "100%", padding: "8px 10px", borderRadius: 8,
                        background: "#FFF", border: "1px solid rgba(26,26,26,0.10)",
                        fontSize: 12, color: NAVY, outline: "none",
                      }}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: SLATE, marginBottom: 4 }}>Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="e.g. Wants to be called back in 2 months" style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8,
                      background: "#FFF", border: "1px solid rgba(26,26,26,0.10)",
                      fontSize: 12, color: NAVY, outline: "none", resize: "vertical",
                      fontFamily: "var(--font-sans)",
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={saveFollowup} disabled={saving} style={{
                flex: 1, padding: "11px 18px", borderRadius: 10,
                background: NAVY, color: "#fff",
                fontSize: 13, fontWeight: 700, border: "none",
                cursor: saving ? "wait" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Save Changes
              </button>
              <button onClick={onClose} style={{
                padding: "11px 18px", borderRadius: 10,
                background: "#FAF8F4", color: NAVY, border: "1px solid rgba(26,26,26,0.10)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        <Icon size={11} color={SLATE} /> {label}
      </p>
      <p style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{value}</p>
    </div>
  );
}

function BANTChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: "#F4E7E0", border: `1px solid ${TEAL}30` }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: TEAL, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 12, color: NAVY }}>{value}</p>
    </div>
  );
}
