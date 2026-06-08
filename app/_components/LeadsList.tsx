"use client";

// Tactile, fluid leads list (Framer Motion).
//   • <motion.div layout> on each card → existing rows spring out of the way
//     when a new lead is inserted at the top.
//   • New rows fade+slide in with a temporary glowing border that fades after 2s.
//   • Hover lifts the card (-2px) with a brand shadow + border highlight.
//   • Token-driven so it works in light + dark mode.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { MapPin, User, DollarSign, Trash2 } from "lucide-react";

export interface LeadItem {
  id: string;
  address: string | null;
  status: string;
  arv?: number | null;
  asking?: number | null;
  agent?: string | null;
}

const STATUS: Record<string, { bg: string; fg: string; glow: string }> = {
  Hot:          { bg: "rgba(5,150,105,0.12)",   fg: "#059669", glow: "rgba(5,150,105,0.55)" },
  Warm:         { bg: "rgba(234,88,12,0.12)",   fg: "#EA580C", glow: "rgba(234,88,12,0.5)" },
  Cold:         { bg: "rgba(2,132,199,0.12)",   fg: "#0284C7", glow: "rgba(2,132,199,0.5)" },
  "Call Back":  { bg: "rgba(146,64,14,0.12)",   fg: "#92400E", glow: "rgba(146,64,14,0.45)" },
  Disqualified: { bg: "var(--surface-3)",       fg: "var(--text-3)", glow: "rgba(124,58,237,0.0)" },
  Duplicate:    { bg: "rgba(124,58,237,0.12)",  fg: "#7C3AED", glow: "rgba(124,58,237,0.5)" },
  Processing:   { bg: "var(--surface-3)",       fg: "var(--text-3)", glow: "rgba(124,58,237,0.0)" },
};
const fmt = (n: number | null | undefined) => (n ? `$${Math.round(n).toLocaleString()}` : "—");

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] || { bg: "var(--surface-3)", fg: "var(--text-2)", glow: "transparent" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 11px", borderRadius: 999,
      background: s.bg, color: s.fg,
      fontSize: 11, fontWeight: 800, letterSpacing: "0.02em",
      boxShadow: ["Hot", "Warm", "Cold"].includes(status) ? `0 0 14px ${s.glow}` : "none",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.fg }} />
      {status}
    </span>
  );
}

function LeadCard({ lead, isNew, onOpen, onDelete }: { lead: LeadItem; isNew: boolean; onOpen?: (id: string) => void; onDelete?: (id: string) => void }) {
  const [glow, setGlow] = useState(isNew);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => setGlow(false), 2000);
    return () => clearTimeout(t);
  }, [isNew]);

  const accent = STATUS[lead.status]?.fg || "var(--brand-purple)";
  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, y: -14, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.7 }}
      onClick={() => onOpen?.(lead.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        alignItems: "center", gap: 14,
        padding: "14px 16px", borderRadius: 14, cursor: "pointer",
        background: "var(--surface-1)",
        border: `1px solid ${glow ? "var(--brand-purple)" : hover ? "var(--border-3)" : "var(--border-2)"}`,
        boxShadow: glow
          ? "0 0 0 3px var(--brand-purple-soft), 0 14px 30px rgba(124,58,237,0.18)"
          : hover ? "0 10px 26px rgba(11,15,31,0.12)" : "var(--shadow-sm)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "border-color 220ms ease, box-shadow 260ms ease, transform 200ms cubic-bezier(0.16,1,0.30,1)",
      }}
    >
      {/* Left: address + agent */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent, display: "flex", alignItems: "center", justifyContent: "center",
          }}><MapPin size={14} /></span>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lead.address || "Unknown address"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6, paddingLeft: 38, fontSize: 12, color: "var(--text-2)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><User size={11} /> {lead.agent || "Unassigned"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><DollarSign size={11} /> Ask {fmt(lead.asking)}</span>
        </div>
      </div>

      {/* Right: ARV + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>ARV</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>{fmt(lead.arv)}</p>
        </div>
        <StatusPill status={lead.status} />
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
            title="Delete lead"
            style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: hover ? "#FEF2F2" : "transparent", border: "1px solid var(--border-2)",
              color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              opacity: hover ? 1 : 0.45, transition: "opacity 160ms ease, background 160ms ease",
            }}><Trash2 size={14} /></button>
        )}
      </div>
    </motion.div>
  );
}

export function LeadsList({ leads, newIds, onOpen, onDelete }: { leads: LeadItem[]; newIds?: Set<string>; onOpen?: (id: string) => void; onDelete?: (id: string) => void }) {
  // Track which ids have appeared so only genuinely-new ones get the glow.
  const seen = useRef<Set<string>>(new Set());
  const [, force] = useState(0);
  useEffect(() => {
    let added = false;
    for (const l of leads) if (!seen.current.has(l.id)) { seen.current.add(l.id); added = true; }
    if (added) force((n) => n + 1);
  }, [leads]);

  return (
    <motion.div layout style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <AnimatePresence initial={false} mode="popLayout">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            isNew={!!newIds?.has(lead.id)}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
