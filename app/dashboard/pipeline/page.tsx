"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { can, normalizeRole, type Role } from "@/lib/rbac";
import { Loader2, GripVertical, MapPin, User, DollarSign, AlertCircle, Send } from "lucide-react";

const NAVY = "#232B3A";
const SLATE = "#4B5563";

// Pipeline stages (mirror of the lead_stage enum).
type Stage = "new" | "contacted" | "negotiating" | "won" | "lost";
const STAGES: { key: Stage; label: string; accent: string }[] = [
  { key: "new",         label: "New",         accent: "#64748B" },
  { key: "contacted",   label: "Contacted",   accent: "#2F6BFF" },
  { key: "negotiating", label: "Negotiating", accent: "#7C3AED" },
  { key: "won",         label: "Won",         accent: "#059669" },
  { key: "lost",        label: "Lost",        accent: "#DC2626" },
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Hot: { bg: "#FBEEE8", color: "#DC2626" }, Warm: { bg: "#FFF7ED", color: "#EA580C" },
  Cold: { bg: "#F0F9FF", color: "#0284C7" }, "Call Back": { bg: "#FFFBEB", color: "#92400E" },
  Disqualified: { bg: "#F1F4F9", color: SLATE }, Duplicate: { bg: "#EAF0FF", color: "#92400E" },
  Commercial: { bg: "#F5F3FF", color: "#7C3AED" },
};

interface Lead {
  id: string;
  property_address: string | null;
  owner_name: string | null;
  agent_name: string | null;
  status: string;
  stage: Stage;
  asking_price: number | null;
  arv: number | null;
  metadata: Record<string, unknown> | null;
}

// Leads the AI has finished as dead-ends (or hasn't evaluated) don't belong on
// the working board. Only actionable, not-yet-exported leads show here.
const EXCLUDED_STATUS = new Set(["processing", "disqualified", "duplicate", "error"]);
const isPushedToCrm = (l: { metadata: Record<string, unknown> | null }) =>
  l.metadata?.pushed_to_crm === true || l.metadata?.pushed_to_crm === "true";

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>("caller");
  const [needsMigration, setNeedsMigration] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  const editable = can(role, "leads.edit");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    setRole(normalizeRole(profile?.role));

    // `stage` exists only after the CRM migration. If the column is missing the
    // query errors — surface a friendly hint instead of a crash.
    const { data, error } = await supabase
      .from("leads")
      .select("id, property_address, owner_name, agent_name, status, stage, asking_price, arv, metadata")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      if (/column .*stage.* does not exist/i.test(error.message)) setNeedsMigration(true);
      setLoading(false);
      return;
    }
    const rows = (data || [])
      .map((l) => ({ ...l, stage: (l.stage || "new") as Stage })) as Lead[];
    // Only actionable leads: AI-finished dead-ends excluded, and anything already
    // pushed to the client CRM is removed from the working board.
    setLeads(rows.filter((l) => !EXCLUDED_STATUS.has((l.status || "").toLowerCase()) && !isPushedToCrm(l)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const moveLead = async (id: string, stage: Stage) => {
    const prev = leads;
    const target = leads.find((l) => l.id === id);
    if (!target || target.stage === stage) return;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l))); // optimistic
    const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
    if (error) { setLeads(prev); /* rollback */ }
  };

  // Hand a lead off to the client CRM — flags it and drops it from the board.
  const pushToCrm = async (id: string) => {
    const target = leads.find((l) => l.id === id);
    if (!target) return;
    setLeads((ls) => ls.filter((l) => l.id !== id)); // optimistic remove
    const { error } = await supabase
      .from("leads")
      .update({ metadata: { ...(target.metadata || {}), pushed_to_crm: true } })
      .eq("id", id);
    if (error) load(); // restore on failure
  };

  const fmt = (n: number | null) => (n ? `$${n.toLocaleString()}` : "—");

  if (loading) {
    return <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: NAVY }} /></div>;
  }

  if (needsMigration) {
    return (
      <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center", padding: 32, background: "#FFF", border: "1px solid rgba(35,43,58,0.1)", borderRadius: 14 }}>
        <AlertCircle size={28} color="#EA580C" style={{ margin: "0 auto 12px" }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Pipeline not enabled yet</h2>
        <p style={{ fontSize: 13, color: SLATE, lineHeight: 1.6 }}>
          Run the CRM migrations (<code>0001 → 0004 → 0002 → 0003</code>) in Supabase to add the
          pipeline <code>stage</code> column. The board lights up automatically once they're applied.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Pipeline</h1>
        <p style={{ fontSize: 13, color: SLATE }}>
          Active leads only — AI dead-ends (disqualified / duplicate / error / processing) and
          leads already pushed to the client CRM are hidden.
          {editable ? " Drag cards to change stage." : " Read-only for your role."}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))`, gap: 14, alignItems: "start", overflowX: "auto", paddingBottom: 8 }}>
        {STAGES.map((col) => {
          const items = leads.filter((l) => l.stage === col.key);
          const isOver = overStage === col.key && editable;
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (editable) { e.preventDefault(); setOverStage(col.key); } }}
              onDragLeave={() => setOverStage((s) => (s === col.key ? null : s))}
              onDrop={(e) => { e.preventDefault(); setOverStage(null); if (dragId) moveLead(dragId, col.key); setDragId(null); }}
              style={{
                background: isOver ? "#EEF3FF" : "#F2F5F9",
                border: `1px solid ${isOver ? col.accent : "rgba(35,43,58,0.08)"}`,
                borderRadius: 12, padding: 10, minHeight: 200, transition: "background 120ms",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 10px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, color: NAVY }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.accent }} />
                  {col.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: SLATE, background: "#FFF", borderRadius: 999, padding: "1px 8px" }}>{items.length}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((l) => {
                  const sc = STATUS_COLORS[l.status] || { bg: "#F1F4F9", color: SLATE };
                  return (
                    <div
                      key={l.id}
                      draggable={editable}
                      onDragStart={() => setDragId(l.id)}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      onClick={() => { window.location.href = `/dashboard/leads/${l.id}`; }}
                      style={{
                        background: "#FFF", border: "1px solid rgba(35,43,58,0.1)", borderRadius: 10,
                        padding: 12, cursor: editable ? "grab" : "pointer", boxShadow: "0 1px 3px rgba(35,43,58,0.05)",
                        opacity: dragId === l.id ? 0.4 : 1,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 8 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>
                          <MapPin size={12} color={SLATE} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {l.property_address || "No address"}
                          </span>
                        </span>
                        {editable && <GripVertical size={14} color="#CBD5E1" style={{ flexShrink: 0 }} />}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 800 }}>{l.status}</span>
                        {l.arv ? <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>ARV {fmt(l.arv)}</span> : null}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: SLATE }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><User size={11} />{l.owner_name || l.agent_name || "—"}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><DollarSign size={11} />{fmt(l.asking_price)}</span>
                      </div>
                      {editable && (
                        <button
                          onClick={(e) => { e.stopPropagation(); pushToCrm(l.id); }}
                          title="Mark as pushed to the client CRM (removes it from the board)"
                          style={{
                            marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            padding: "6px 8px", borderRadius: 7, cursor: "pointer",
                            background: "#EEF3FF", color: "#2F6BFF", border: "1px solid rgba(47,107,255,0.25)",
                            fontSize: 11, fontWeight: 700,
                          }}
                        >
                          <Send size={11} /> Push to CRM
                        </button>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div style={{ padding: "18px 8px", textAlign: "center", fontSize: 11, color: "#94A3B8" }}>Drop leads here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
