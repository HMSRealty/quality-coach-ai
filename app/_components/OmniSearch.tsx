"use client";

// Global command-center search. Cmd+K / Ctrl+K opens; ↑↓ to navigate, ↵ to open,
// Esc to close. Searches across leads (address, owner, agent, AI feedback /
// reason / coaching points). Mounted once in the dashboard layout.
import { useCallback, useEffect, useRef, useState } from "react";
import { Portal } from "@/app/_components/Portal";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Search, X, ArrowRight, Loader2, Phone, MapPin, User, Flame, Sun, Snowflake, CornerDownLeft, Command } from "lucide-react";
import { T } from "@/app/_components/tokens";

interface Hit {
  id: string;
  extracted_address: string | null;
  agent_name: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  qualification_reason: string | null;
  ai_feedback: string | null;
}

const STATUS_DOT: Record<string, string> = {
  Hot: "#DC2626", Warm: "#EA580C", Cold: "#0a5f52",
  "Call Back": "#92400E", Disqualified: "#6B7280", Duplicate: "#0a5f52", Processing: "#6B7280",
};

const StatusIcon = (s: string) => s === "Hot" ? Flame : s === "Warm" ? Sun : s === "Cold" ? Snowflake : null;

export function OmniSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K to toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); }
      else if (e.key === "Escape" && open) { setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(""); setHits([]); setActive(0); }
  }, [open]);

  // Search across address / owner / phone / agent / AI fields. Debounced.
  const search = useCallback(async (term: string) => {
    if (!term.trim()) { setHits([]); return; }
    setLoading(true);
    // Strip characters that break PostgREST .or() parsing: comma, parens, %.
    const safe = term.replace(/[%(),]/g, " ").replace(/\s+/g, " ").trim();
    if (!safe) { setHits([]); setLoading(false); return; }
    const pat = `%${safe}%`;
    const { data } = await supabase.from("leads")
      .select("id, extracted_address, agent_name, status, metadata, qualification_reason, ai_feedback")
      .or(
        [
          `extracted_address.ilike.${pat}`,
          `agent_name.ilike.${pat}`,
          `qualification_reason.ilike.${pat}`,
          `ai_feedback.ilike.${pat}`,
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(25);
    setHits((data || []) as Hit[]);
    setActive(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), 180);
    return () => clearTimeout(t);
  }, [q, search]);

  const go = (h: Hit) => { setOpen(false); router.push(`/dashboard/leads/${h.id}`); };

  if (!open) return null;
  return (
    <Portal>
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,10,24,0.55)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh", padding: "12vh 16px 16px",
      }}
    >
      <div className="animate-scale" style={{
        width: "100%", maxWidth: 660, borderRadius: 18,
        background: "var(--surface-1)", border: "1px solid var(--border-2)",
        boxShadow: "0 24px 72px rgba(0,0,0,0.45)",
        overflow: "hidden",
      }}>
        {/* Search row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
          <Search size={16} color="var(--text-3)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(hits.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
              else if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]); }
            }}
            placeholder="Search leads · address · phone · agent · AI feedback…"
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 16, color: "var(--text-1)", fontFamily: "inherit",
            }}
          />
          {loading ? <Loader2 size={14} className="animate-spin" color="var(--text-3)" /> : (
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "3px 8px", borderRadius: 6, background: "var(--surface-3)", fontSize: 10, fontWeight: 700, color: "var(--text-3)" }}>
              <Command size={10} /> K
            </span>
          )}
          <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}>
            <X size={15} />
          </button>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "55vh", overflowY: "auto", overscrollBehavior: "contain" }}>
          {q.trim() === "" ? (
            <Empty />
          ) : hits.length === 0 && !loading ? (
            <p style={{ padding: 28, textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>No leads match <strong>{q}</strong>.</p>
          ) : (
            hits.map((h, i) => {
              const Icon = StatusIcon(h.status || "");
              const md = (h.metadata || {}) as Record<string, unknown>;
              const owner = String(md.owner_name ?? "") || "";
              const phone = String(md.phone_number ?? "") || "";
              return (
                <button key={h.id} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                  style={{
                    width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                    background: i === active ? "var(--surface-3)" : "transparent",
                    padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
                    borderTop: i === 0 ? "none" : "1px solid var(--border-1)",
                  }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: `${STATUS_DOT[h.status || ""] || "#6B7280"}1A`,
                    color: STATUS_DOT[h.status || ""] || "#6B7280",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {Icon ? <Icon size={13} /> : <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.extracted_address || owner || "Unnamed lead"}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {h.agent_name && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><User size={9} /> {h.agent_name}</span>}
                      {phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Phone size={9} /> {phone}</span>}
                      {owner && h.extracted_address && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><MapPin size={9} /> {owner}</span>}
                      {h.status && <span style={{ padding: "1px 7px", borderRadius: 999, background: `${STATUS_DOT[h.status] || "#6B7280"}22`, color: STATUS_DOT[h.status] || "#6B7280", fontWeight: 800 }}>{h.status}</span>}
                    </p>
                  </div>
                  <ArrowRight size={14} color="var(--text-3)" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div style={{ display: "flex", gap: 14, padding: "10px 20px", borderTop: "1px solid var(--border-1)", background: "var(--surface-3)", fontSize: 10.5, color: "var(--text-3)" }}>
          <Hint k="↑↓" v="Navigate" />
          <Hint k={<CornerDownLeft size={10} />} v="Open" />
          <Hint k="Esc" v="Close" />
          <div style={{ flex: 1 }} />
          <span>Tip: search transcripts via AI feedback &amp; coaching notes.</span>
        </div>
      </div>
    </div>
    </Portal>
  );
}

function Hint({ k, v }: { k: React.ReactNode; v: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ padding: "2px 7px", borderRadius: 6, background: "var(--surface-1)", border: "1px solid var(--border-2)", color: "var(--text-1)", fontWeight: 700 }}>{k}</span>
      {v}
    </span>
  );
}
function Empty() {
  return (
    <div style={{ padding: "28px 22px", color: "var(--text-2)", fontSize: 13 }}>
      <p style={{ fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>Command center</p>
      <p>Type to search leads by address, phone, owner, agent or AI notes.</p>
      <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        <li style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: T.magenta as string }}>›</span> Pro tip: try “motivated”, “probate”, “behind on payments”…</li>
        <li style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: T.magenta as string }}>›</span> Or paste a phone number or street name.</li>
      </ul>
    </div>
  );
}
