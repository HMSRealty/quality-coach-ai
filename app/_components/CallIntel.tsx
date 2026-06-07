"use client";

// Call Intelligence Hub — premium QA surfaces for /dashboard/leads/[id].
//   • TcpaShield               — red early-warning header banner
//   • ScriptComplianceTimeline — green/yellow/red script tracker
//   • BehavioralScorecard      — talk/listen gauge + WPM meter + floor grade
//   • InteractiveTranscript    — highlight → floating "Clip & Route" panel
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  ShieldAlert, AlertTriangle, ArrowDownRight, CheckCircle2, MinusCircle, XCircle,
  Gauge, Activity, Award, Scissors, Tag, Loader2, Check, MessageSquareText, User, Headphones, Search,
} from "lucide-react";
import {
  parseSegments, computeBehavior, detectRisk, deriveCompliance,
  type Segment, type ComplianceStatus,
} from "@/app/_components/callAnalysis";

const SPRING = { type: "spring", stiffness: 480, damping: 34, mass: 0.7 } as const;

// ──────────────────────────────────────────────────────────────────────
// 1. TCPA & Hostility Early-Warning Shield
// ──────────────────────────────────────────────────────────────────────
export function TcpaShield({ transcript, onJump }: { transcript: string | null | undefined; onJump?: (sec: number) => void }) {
  const hits = useMemo(() => detectRisk(parseSegments(transcript)), [transcript]);
  if (hits.length === 0) return null;
  const top = hits[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
      style={{
        position: "relative", overflow: "hidden", borderRadius: 16, padding: "16px 20px",
        background: "linear-gradient(135deg, color-mix(in srgb, #DC2626 14%, var(--surface-1)) 0%, color-mix(in srgb, #DC2626 5%, var(--surface-1)) 100%)",
        border: "1px solid color-mix(in srgb, #DC2626 45%, transparent)",
        boxShadow: "0 14px 40px color-mix(in srgb, #DC2626 22%, transparent)",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
      <motion.span
        animate={{ scale: [1, 1.12, 1], boxShadow: ["0 0 0 0 rgba(220,38,38,0.5)", "0 0 0 10px rgba(220,38,38,0)", "0 0 0 0 rgba(220,38,38,0)"] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        style={{ width: 42, height: 42, borderRadius: 12, background: "#DC2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <ShieldAlert size={22} />
      </motion.span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#DC2626" }}>
          Compliance Risk Detected · {hits.length} flag{hits.length === 1 ? "" : "s"}
        </p>
        <p style={{ fontSize: 13.5, color: "var(--text-1)", marginTop: 3, lineHeight: 1.5 }}>
          <strong>{top.phrase}</strong> — “{top.excerpt}”
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {hits.slice(0, 6).map((h, i) => (
            <span key={i} style={{
              fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
              background: "color-mix(in srgb, #DC2626 14%, transparent)", color: "#DC2626",
              border: "1px solid color-mix(in srgb, #DC2626 35%, transparent)",
            }}>{h.phrase}{h.time ? ` · ${h.time}` : ""}</span>
          ))}
        </div>
      </div>
      <motion.button
        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
        animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
        onClick={() => onJump?.(Math.max(0, top.start))}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10,
          background: "#DC2626", color: "#fff", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800,
          boxShadow: "0 8px 22px rgba(220,38,38,0.40)", whiteSpace: "nowrap",
        }}>
        <ArrowDownRight size={15} /> Jump to {top.time || "moment"}
      </motion.button>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2. Script-Compliance Timeline
// ──────────────────────────────────────────────────────────────────────
const C_CFG: Record<ComplianceStatus, { color: string; label: string; icon: typeof CheckCircle2 }> = {
  compliant:  { color: "#10B981", label: "Compliant", icon: CheckCircle2 },
  improvised: { color: "#F59E0B", label: "Off-script (effective)", icon: MinusCircle },
  failed:     { color: "#DC2626", label: "Skipped", icon: XCircle },
};

export function ScriptComplianceTimeline({ transcript, onJump }: { transcript: string | null | undefined; onJump?: (sec: number) => void }) {
  const marks = useMemo(() => deriveCompliance(parseSegments(transcript)), [transcript]);
  if (!transcript) return null;
  const score = Math.round((marks.filter(m => m.status === "compliant").length / marks.length) * 100);

  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 18, padding: 22, boxShadow: "var(--shadow-md)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: "color-mix(in srgb, var(--brand-purple) 16%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Activity size={15} color="var(--brand-purple)" />
          </span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>Script Compliance</p>
            <p style={{ fontSize: 11, color: "var(--text-3)" }}>{marks.filter(m => m.status === "compliant").length}/{marks.length} checkpoints hit</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(["compliant", "improvised", "failed"] as ComplianceStatus[]).map(s => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "var(--text-3)" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: C_CFG[s].color }} /> {C_CFG[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* Segmented bar */}
      <div style={{ display: "flex", gap: 3, marginBottom: 18 }}>
        {marks.map((m, i) => (
          <motion.button key={i}
            initial={{ scaleY: 0.4, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ ...SPRING, delay: i * 0.05 }}
            onClick={() => m.start >= 0 && onJump?.(m.start)}
            title={`${m.stage} — ${C_CFG[m.status].label}`}
            style={{ flex: 1, height: 12, borderRadius: 4, border: "none", cursor: m.start >= 0 ? "pointer" : "default", background: C_CFG[m.status].color, opacity: m.status === "failed" ? 0.85 : 1, transformOrigin: "bottom" }} />
        ))}
      </div>

      {/* Stage list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {marks.map((m, i) => {
          const c = C_CFG[m.status]; const Icon = c.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: i * 0.04 }}
              onClick={() => m.start >= 0 && onJump?.(m.start)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10,
                background: "var(--surface-3)", border: "1px solid var(--border-1)",
                borderLeft: `3px solid ${c.color}`, cursor: m.start >= 0 ? "pointer" : "default",
              }}>
              <Icon size={16} color={c.color} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{m.stage}</p>
                <p style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.detail}</p>
              </div>
              {m.time && <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: "var(--text-3)", flexShrink: 0 }}>{m.time}</span>}
              <span style={{ fontSize: 10, fontWeight: 800, color: c.color, textTransform: "uppercase", flexShrink: 0 }}>{c.label.split(" ")[0]}</span>
            </motion.div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>Heuristic from transcript — not a substitute for QA review.</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#DC2626" }}>{score}% adherence</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3. Behavioral AI Scorecard
// ──────────────────────────────────────────────────────────────────────
export function BehavioralScorecard({ transcript, agentName }: { transcript: string | null | undefined; agentName: string | null | undefined }) {
  const b = useMemo(() => computeBehavior(parseSegments(transcript)), [transcript]);
  const [grade, setGrade] = useState<number | null>(null);
  const [gLoading, setGLoading] = useState(false);

  useEffect(() => {
    if (!agentName) return;
    let cancelled = false;
    (async () => {
      setGLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/agents/scorecard", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ agentName }),
        });
        const j = await r.json().catch(() => ({}));
        if (!cancelled && j.ok) setGrade(j.grade);
      } finally { if (!cancelled) setGLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [agentName]);

  const talkPct = Math.round(b.talkRatio * 100);
  // Ideal agent talk share for discovery calls ≈ 43%. Score the deviation.
  const ratioColor = talkPct <= 50 ? "#10B981" : talkPct <= 65 ? "#F59E0B" : "#DC2626";
  const wpm = b.agentWpm;
  const wpmColor = wpm === 0 ? "var(--text-3)" : wpm < 110 ? "#10B981" : wpm < 160 ? "#F59E0B" : "#DC2626";
  const gradeColor = grade == null ? "var(--text-3)" : grade >= 80 ? "#10B981" : grade >= 60 ? "var(--brand-purple)" : grade >= 40 ? "#F59E0B" : "#DC2626";

  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 18, padding: 22, boxShadow: "var(--shadow-md)", position: "relative", overflow: "hidden" }}>
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, var(--brand-purple), #DB2777)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, var(--brand-purple), #DB2777)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Gauge size={16} color="#fff" />
        </span>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", color: "var(--text-3)", textTransform: "uppercase" }}>Behavioral AI</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>Performance Scorecard</p>
        </div>
      </div>

      {/* Talk-to-listen gauge */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>Talk-to-Listen Ratio</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: ratioColor }}>{talkPct}% agent</span>
        </div>
        <div style={{ position: "relative", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--magenta-dim)" }}>
          <motion.span initial={{ width: 0 }} animate={{ width: `${talkPct}%` }} transition={SPRING}
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: `linear-gradient(90deg, ${ratioColor}, color-mix(in srgb, ${ratioColor} 60%, #fff))`, borderRadius: 999 }} />
          {/* Ideal marker at 43% */}
          <span style={{ position: "absolute", left: "43%", top: -2, bottom: -2, width: 2, background: "var(--text-1)", opacity: 0.55 }} title="Ideal ≈ 43%" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>Agent {b.agentWords}w</span>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>Seller {b.sellerWords}w</span>
        </div>
      </div>

      {/* WPM meter + Floor grade */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-3)", border: "1px solid var(--border-1)" }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Activity size={11} /> Pacing
          </p>
          <p style={{ fontSize: 26, fontWeight: 900, color: wpmColor, lineHeight: 1 }}>{wpm || "—"}</p>
          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>words / min</p>
          <div style={{ height: 6, borderRadius: 999, background: "var(--surface-4)", marginTop: 8, overflow: "hidden" }}>
            <motion.span initial={{ width: 0 }} animate={{ width: `${Math.min(100, (wpm / 200) * 100)}%` }} transition={SPRING}
              style={{ display: "block", height: "100%", background: wpmColor }} />
          </div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-3)", border: "1px solid var(--border-1)" }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Award size={11} /> Floor Grade
          </p>
          {gLoading ? (
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-3)" }} />
          ) : (
            <>
              <p style={{ fontSize: 26, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade ?? "—"}<span style={{ fontSize: 13, color: "var(--text-3)" }}>/100</span></p>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>across all calls (90d)</p>
              <div style={{ height: 6, borderRadius: 999, background: "var(--surface-4)", marginTop: 8, overflow: "hidden" }}>
                <motion.span initial={{ width: 0 }} animate={{ width: `${grade ?? 0}%` }} transition={SPRING}
                  style={{ display: "block", height: "100%", background: gradeColor }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 4. Interactive Transcript + One-Click Training Snippet Engine
// ──────────────────────────────────────────────────────────────────────
const OBJECTION_TAGS = [
  "Price too low", "Not selling / not motivated", "Already listed with agent",
  "Needs to think / spouse", "Bad timing", "Distrust / scam fear",
  "Wants full retail", "Condition dispute", "Hostile / DNC", "Other",
];

export function InteractiveTranscript({
  transcript, leadId, sourceUrl, title, onJump,
}: {
  transcript: string | null | undefined;
  leadId: string;
  sourceUrl: string | null;
  title?: string;
  onJump?: (sec: number) => void;
}) {
  const segs = useMemo(() => parseSegments(transcript), [transcript]);
  const [q, setQ] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ text: string; x: number; y: number; start: number; end: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tag, setTag] = useState(OBJECTION_TAGS[0]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const shown = useMemo(() => {
    if (!q.trim()) return segs;
    const t = q.toLowerCase();
    return segs.filter((s) => s.text.toLowerCase().includes(t));
  }, [segs, q]);

  // On text selection within the transcript, place the floating control panel.
  const onMouseUp = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (!text || text.length < 4 || !containerRef.current) { return; }
    const range = selection!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const host = containerRef.current.getBoundingClientRect();
    // Map selection to the nearest segment for timestamps.
    const anchorEl = (selection!.anchorNode?.parentElement as HTMLElement | null)?.closest("[data-start]") as HTMLElement | null;
    const start = anchorEl ? Number(anchorEl.dataset.start) : 0;
    const end = anchorEl ? Number(anchorEl.dataset.end) : start + 8;
    setSel({ text, x: rect.left - host.left + rect.width / 2, y: rect.top - host.top, start, end });
    setPanelOpen(true);
    setSaved(false);
  };

  const clipAndRoute = async () => {
    if (!sel) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    let orgId: string | null = null;
    if (user) {
      const { data: p } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      orgId = (p?.organization_id as string) ?? null;
    }
    const { error } = await supabase.from("training_snippets").insert({
      lead_id: leadId, organization_id: orgId,
      title: `[${tag}] ${title || "Training clip"}`,
      note: sel.text.slice(0, 500),
      start_ms: Math.round(sel.start * 1000),
      end_ms: Math.round(sel.end * 1000),
      source_url: sourceUrl || "",
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => { setPanelOpen(false); setSel(null); }, 1400); }
    else alert("Could not route clip: " + error.message);
  };

  if (!transcript || segs.length === 0) return null;

  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 18, boxShadow: "var(--shadow-md)", overflow: "hidden", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, var(--brand-purple), #DB2777)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MessageSquareText size={15} color="#fff" />
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>Interactive Transcript</p>
          <p style={{ fontSize: 11, color: "var(--text-3)" }}>Highlight any phrase to clip it to the Training Room</p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            style={{ width: 140, padding: "6px 10px 6px 28px", borderRadius: 999, background: "var(--surface-3)", border: "1px solid var(--border-2)", fontSize: 12, color: "var(--text-1)", outline: "none" }} />
        </div>
      </div>

      <div ref={containerRef} onMouseUp={onMouseUp} style={{ maxHeight: 480, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
        {shown.map((l, i) => {
          const isAgent = l.speaker === "agent";
          const isSeller = l.speaker === "seller";
          return (
            <div key={i} data-start={l.start} data-end={l.end}
              style={{ display: "flex", gap: 10, flexDirection: isAgent ? "row" : "row-reverse" }}>
              <span style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: isAgent ? "color-mix(in srgb, var(--navy) 18%, var(--surface-3))" : isSeller ? "var(--magenta-dim)" : "var(--surface-3)",
                color: isAgent ? "#fff" : isSeller ? "var(--magenta)" : "var(--text-3)",
              }}>
                {isAgent ? <Headphones size={13} /> : <User size={13} />}
              </span>
              <div style={{ maxWidth: "80%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexDirection: isAgent ? "row" : "row-reverse" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: isSeller ? "var(--magenta)" : isAgent ? "var(--brand-purple)" : "var(--text-3)" }}>
                    {isAgent ? "Agent" : isSeller ? "Seller" : "Speaker"}
                  </span>
                  {l.time && (
                    <button onClick={() => onJump?.(l.start)} style={{ fontSize: 10, color: "var(--text-4)", fontVariantNumeric: "tabular-nums", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{l.time}</button>
                  )}
                </div>
                <div style={{
                  padding: "9px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.55,
                  background: isSeller ? "var(--magenta-dim)" : "var(--surface-3)", color: "var(--text-1)",
                  borderTopLeftRadius: isAgent ? 4 : 14, borderTopRightRadius: isAgent ? 14 : 4,
                  userSelect: "text", cursor: "text",
                }}>
                  {l.text}
                </div>
              </div>
            </div>
          );
        })}

        {/* Floating "Clip & Route to Training Room" panel */}
        <AnimatePresence>
          {panelOpen && sel && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={SPRING}
              style={{
                position: "absolute",
                left: Math.max(150, Math.min(sel.x, (containerRef.current?.clientWidth ?? 600) - 150)),
                top: Math.max(8, sel.y - 8),
                transform: "translate(-50%, -100%)",
                zIndex: 20, width: 300,
                background: "var(--surface-1)", border: "1px solid var(--border-3)",
                borderRadius: 14, padding: 14, boxShadow: "0 22px 50px rgba(11,15,31,0.30)",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <Scissors size={14} color="var(--brand-purple)" />
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)" }}>Clip & Route to Training</span>
                <button onClick={() => { setPanelOpen(false); setSel(null); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 10, maxHeight: 54, overflow: "hidden", fontStyle: "italic" }}>
                “{sel.text.length > 120 ? sel.text.slice(0, 120) + "…" : sel.text}”
              </p>
              <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                <Tag size={11} /> Objection tag
              </label>
              <select value={tag} onChange={(e) => setTag(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border-2)", background: "var(--surface-3)", color: "var(--text-1)", fontSize: 12, fontWeight: 600, marginBottom: 12, outline: "none" }}>
                {OBJECTION_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={clipAndRoute} disabled={saving || saved}
                style={{
                  width: "100%", padding: "10px", borderRadius: 10, border: "none", cursor: saving ? "wait" : "pointer",
                  background: saved ? "#10B981" : "linear-gradient(135deg, var(--brand-purple), #DB2777)", color: "#fff",
                  fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                  boxShadow: "0 8px 22px color-mix(in srgb, var(--brand-purple) 40%, transparent)",
                }}>
                {saved ? <><Check size={14} /> Routed to Training Room</> : saving ? <><Loader2 size={14} className="animate-spin" /> Clipping…</> : <>✂️ Clip & Route to Training Room</>}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
