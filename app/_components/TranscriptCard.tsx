"use client";

// Gong-style transcript viewer. Parses the diarized "Agent:/Seller: [MM:SS] …"
// transcript the analyzer stores on the lead, renders it as a clean two-sided
// conversation with timestamps, a live search filter, and copy-to-clipboard.
import { useMemo, useState } from "react";
import { MessageSquareText, Search, Copy, Check, User, Headphones } from "lucide-react";
import { T } from "@/app/_components/tokens";

interface Line { speaker: "agent" | "seller" | "other"; time: string | null; text: string }

function parse(raw: string): Line[] {
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const timeM = l.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
    const time = timeM ? timeM[1] : null;
    let body = l.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/, "").trim();
    let speaker: Line["speaker"] = "other";
    const m = body.match(/^(agent|caller|rep|seller|owner|prospect|homeowner)\s*[:\-–]\s*/i);
    if (m) {
      const who = m[1].toLowerCase();
      speaker = /agent|caller|rep/.test(who) ? "agent" : "seller";
      body = body.slice(m[0].length).trim();
    }
    return { speaker, time, text: body };
  }).filter((l) => l.text);
}

export function TranscriptCard({ transcript }: { transcript: string | null | undefined }) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => (transcript ? parse(transcript) : []), [transcript]);
  const shown = useMemo(() => {
    if (!q.trim()) return lines;
    const t = q.toLowerCase();
    return lines.filter((l) => l.text.toLowerCase().includes(t));
  }, [lines, q]);

  if (!transcript || lines.length === 0) return null;

  const copy = () => { navigator.clipboard?.writeText(transcript); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const hl = (text: string) => {
    if (!q.trim()) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return (<>{text.slice(0, i)}<mark style={{ background: "var(--magenta-dim)", color: "var(--magenta)", borderRadius: 3, padding: "0 2px" }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>);
  };

  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 18, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: T.gradPrimary, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MessageSquareText size={15} color="#fff" />
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>Transcript</p>
          <p style={{ fontSize: 11, color: "var(--text-3)" }}>{lines.length} lines · auto-diarized</p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            style={{ width: 150, padding: "6px 10px 6px 28px", borderRadius: 999, background: "var(--surface-3)", border: "1px solid var(--border-2)", fontSize: 12, color: "var(--text-1)", outline: "none" }} />
        </div>
        <button onClick={copy} className="btn-ghost" style={{ fontSize: 11, padding: "6px 10px" }}>
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>

      <div style={{ maxHeight: 460, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: 16 }}>No lines match “{q}”.</p>
        ) : shown.map((l, i) => {
          const isAgent = l.speaker === "agent";
          const isSeller = l.speaker === "seller";
          return (
            <div key={i} style={{ display: "flex", gap: 10, flexDirection: isAgent ? "row" : "row-reverse" }}>
              <span style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isAgent ? "var(--surface-4)" : isSeller ? "var(--magenta-dim)" : "var(--surface-3)",
                color: isAgent ? "var(--text-2)" : isSeller ? "var(--magenta)" : "var(--text-3)",
              }}>
                {isAgent ? <Headphones size={13} /> : <User size={13} />}
              </span>
              <div style={{ maxWidth: "78%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexDirection: isAgent ? "row" : "row-reverse" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: isSeller ? "var(--magenta)" : "var(--text-3)" }}>
                    {isAgent ? "Agent" : isSeller ? "Seller" : "Speaker"}
                  </span>
                  {l.time && <span style={{ fontSize: 10, color: "var(--text-4)", fontVariantNumeric: "tabular-nums" }}>{l.time}</span>}
                </div>
                <div style={{
                  padding: "9px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.55,
                  background: isSeller ? "var(--magenta-dim)" : "var(--surface-3)",
                  color: "var(--text-1)",
                  borderTopLeftRadius: isAgent ? 4 : 14,
                  borderTopRightRadius: isAgent ? 14 : 4,
                }}>
                  {hl(l.text)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
