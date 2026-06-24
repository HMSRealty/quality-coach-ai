"use client";

// Gong-style audio player:
//   • Tall waveform with brand-gradient progress fill
//   • Big circular Play/Pause + skip ±15s
//   • Speed selector (1× / 1.25× / 1.5× / 2×)
//   • Current / duration timecodes
//   • Download button (RBAC-gated by caller)
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, RotateCw, Download, Volume2, Scissors, Share2, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import type { Segment } from "@/app/_components/callAnalysis";

// Speaker-region colors mapped onto the waveform.
const REGION = { agent: "var(--navy)", seller: "var(--brand-purple)", silence: "#DC2626" } as const;

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};

// Deterministic pseudo-waveform from the URL string. Real waveform decode is
// heavy; this gives the visual texture Gong has without bytes.
function fakeBars(url: string, count = 96): number[] {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    out.push(0.3 + (h % 1000) / 1000 * 0.7);
  }
  return out;
}

export function GongPlayer({ src: srcProp, recordingId, downloadUrl, title, leadId, segments, registerSeek }: { src?: string; recordingId?: string; downloadUrl?: string; title?: string; leadId?: string; segments?: Segment[]; registerSeek?: (fn: (sec: number) => void) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Resolve a playable URL: signed URL via recordingId (private bucket) or a
  // legacy direct src.
  const [src, setSrc] = useState<string>(srcProp || "");
  const [resolving, setResolving] = useState<boolean>(!!recordingId && !srcProp);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [vol, setVol] = useState(1);
  const [snipStart, setSnipStart] = useState<number | null>(null);
  const [snipEnd, setSnipEnd] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const bars = fakeBars(recordingId || src || "wave");

  // Resolve a signed play URL from the private bucket when given a recordingId.
  useEffect(() => {
    if (!recordingId || srcProp) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(`/api/recordings/${recordingId}/url?mode=play`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!cancelled && j.url) setSrc(j.url);
      } finally { if (!cancelled) setResolving(false); }
    })();
    return () => { cancelled = true; };
  }, [recordingId, srcProp]);

  const downloadSigned = async () => {
    if (downloadUrl) { window.location.href = downloadUrl; return; }
    if (!recordingId) return;
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`/api/recordings/${recordingId}/url?mode=download`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (j.url) window.location.href = j.url;
    else alert(j.error || "Download not permitted");
  };

  const markIn = () => setSnipStart(t);
  const markOut = () => setSnipEnd(t);
  const clearSnip = () => { setSnipStart(null); setSnipEnd(null); };
  const playSnip = async () => {
    const a = audioRef.current; if (!a || snipStart == null) return;
    a.currentTime = snipStart;
    await a.play(); setPlaying(true);
    const end = snipEnd ?? Math.min(dur, snipStart + 30);
    const onTick = () => { if (a.currentTime >= end) { a.pause(); setPlaying(false); a.removeEventListener("timeupdate", onTick); } };
    a.addEventListener("timeupdate", onTick);
  };
  const shareSnip = async () => {
    if (!leadId || snipStart == null) return;
    setSharing(true);
    const startMs = Math.round(snipStart * 1000);
    const endMs = Math.round((snipEnd ?? Math.min(dur, snipStart + 30)) * 1000);
    const { data: { user } } = await supabase.auth.getUser();
    let orgId: string | null = null;
    if (user) {
      const { data: p } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      orgId = (p?.organization_id as string) ?? null;
    }
    const { error } = await supabase.from("training_snippets").insert({
      lead_id: leadId, organization_id: orgId,
      title: title || "Highlight", note: null,
      start_ms: startMs, end_ms: endMs, source_url: src,
      created_by: user?.id ?? null,
    });
    setSharing(false);
    if (!error) { setShared(true); setTimeout(() => setShared(false), 2500); }
  };

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setT(a.currentTime);
    const onMeta = () => setDur(a.duration);
    const onEnd  = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("loadedmetadata", onMeta); a.removeEventListener("ended", onEnd); };
  }, [src]);

  // Expose an imperative seek so parents (TCPA shield / compliance / transcript)
  // can jump the player to a timestamp.
  useEffect(() => {
    if (!registerSeek) return;
    registerSeek((sec: number) => {
      const a = audioRef.current; if (!a) return;
      a.currentTime = Math.max(0, sec);
      setT(a.currentTime);
      a.play().then(() => setPlaying(true)).catch(() => {});
      a.parentElement?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    });
  }, [registerSeek]);

  const toggle = async () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { await a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const skip = (sec: number) => { const a = audioRef.current; if (a) a.currentTime = Math.max(0, Math.min(dur, a.currentTime + sec)); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(dur, p * dur));
  };
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const onHoverMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHover({ x: e.clientX - rect.left, t: p * dur });
  };
  const changeRate = (next: number) => {
    setRate(next); if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = dur > 0 ? t / dur : 0;

  return (
    <div style={{
      background: "var(--surface-1)", border: "1px solid var(--border-2)",
      borderRadius: 20, padding: 22, boxShadow: "var(--shadow-md)",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <audio ref={audioRef} src={src || undefined} preload="metadata" />
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{title}</p>
          {(recordingId || downloadUrl) && (
            <button onClick={downloadSigned} className="btn-ghost" style={{ fontSize: 12 }}>
              <Download size={12} /> Download
            </button>
          )}
        </div>
      )}
      {resolving && <p style={{ fontSize: 11, color: "var(--text-3)" }}>Preparing secure stream…</p>}

      {/* Waveform / progress */}
      <div onClick={seek} onMouseMove={onHoverMove} onMouseLeave={() => setHover(null)}
        style={{
          height: 88, padding: "0 2px", borderRadius: 14, cursor: "pointer", position: "relative",
          background: "var(--surface-3)", display: "flex", alignItems: "center", gap: 2, overflow: "hidden",
        }}>
        {/* Snippet selection band */}
        {snipStart != null && dur > 0 && (
          <span style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${(snipStart / dur) * 100}%`,
            width: `${(((snipEnd ?? Math.min(dur, snipStart + 30)) - snipStart) / dur) * 100}%`,
            background: "rgba(14,124,107,0.16)",
            borderLeft: "2px solid var(--magenta)",
            borderRight: "2px solid var(--magenta)",
            pointerEvents: "none", zIndex: 1,
          }} />
        )}
        {/* Speaker-region strip — purple = seller, navy = agent, red = silence gap */}
        {segments && segments.length > 0 && (() => {
          const total = dur > 0 ? dur : segments[segments.length - 1].end || 1;
          const strip: React.ReactNode[] = [];
          let prevEnd = 0;
          segments.forEach((s, i) => {
            // Silence gap (> 2s) → red blip
            if (s.start - prevEnd > 2) {
              strip.push(<span key={`g${i}`} style={{ position: "absolute", top: 0, height: 7, left: `${(prevEnd / total) * 100}%`, width: `${Math.max(0.4, ((s.start - prevEnd) / total) * 100)}%`, background: REGION.silence, opacity: 0.85, borderRadius: 2 }} />);
            }
            const color = s.speaker === "seller" ? REGION.seller : s.speaker === "agent" ? REGION.agent : "var(--surface-5)";
            strip.push(<span key={`s${i}`} title={`${s.speaker} · ${s.time || ""}`} style={{ position: "absolute", top: 0, height: 7, left: `${(s.start / total) * 100}%`, width: `${Math.max(0.4, ((s.end - s.start) / total) * 100)}%`, background: color, opacity: 0.92, borderRadius: 2 }} />);
            prevEnd = s.end;
          });
          return <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 7, zIndex: 2, pointerEvents: "none" }}>{strip}</div>;
        })()}
        {bars.map((h, i) => {
          const frac = i / bars.length;
          const filled = frac <= progress;
          const hovered = hover && dur > 0 && frac <= hover.t / dur && frac > progress;
          return (
            <span key={i} style={{
              flex: 1,
              height: `${h * 64 + 10}%`,
              borderRadius: 2,
              background: filled ? T.gradPrimary : hovered ? "var(--magenta-dim)" : "var(--surface-5)",
              opacity: filled ? 1 : hovered ? 0.9 : 0.6,
              transition: "background 90ms, opacity 90ms",
            }} />
          );
        })}
        {/* played playhead */}
        <span style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${progress * 100}%`, width: 2,
          background: "var(--magenta)", boxShadow: "0 0 12px var(--magenta-glow)",
          pointerEvents: "none",
        }} />
        {/* hover scrub line + time tooltip */}
        {hover && (
          <>
            <span style={{ position: "absolute", top: 0, bottom: 0, left: hover.x, width: 1, background: "var(--text-3)", opacity: 0.5, pointerEvents: "none" }} />
            <span style={{
              position: "absolute", top: 6, left: Math.min(Math.max(hover.x, 22), 9999),
              transform: "translateX(-50%)",
              padding: "2px 7px", borderRadius: 6, fontSize: 10, fontWeight: 800,
              background: "var(--text-1)", color: "var(--surface-1)",
              fontVariantNumeric: "tabular-nums", pointerEvents: "none", whiteSpace: "nowrap",
            }}>{fmt(hover.t)}</span>
          </>
        )}
      </div>

      {/* Region legend */}
      {segments && segments.length > 0 && (
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: -4 }}>
          {[["Agent", REGION.agent], ["Seller", REGION.seller], ["Silence / gap", REGION.silence]].map(([label, c]) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "var(--text-3)" }}>
              <span style={{ width: 10, height: 6, borderRadius: 2, background: c as string }} /> {label}
            </span>
          ))}
        </div>
      )}

      {/* Transport */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-2)", minWidth: 46 }}>{fmt(t)}</span>

        <button onClick={() => skip(-15)} title="Back 15s" style={controlBtn}>
          <RotateCcw size={16} />
        </button>
        <button onClick={toggle} title={playing ? "Pause" : "Play"}
          style={{
            width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
            background: T.gradPrimary, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 12px 28px rgba(14,124,107,0.40)",
            transition: "transform 220ms var(--spring-snap)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </button>
        <button onClick={() => skip(15)} title="Forward 15s" style={controlBtn}>
          <RotateCw size={16} />
        </button>

        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-2)", minWidth: 46, textAlign: "right" }}>{fmt(dur)}</span>

        <div style={{ flex: 1 }} />

        {/* Speed */}
        <div style={{ display: "inline-flex", background: "var(--surface-3)", borderRadius: 999, padding: 3 }}>
          {[1, 1.25, 1.5, 2].map((r) => (
            <button key={r} onClick={() => changeRate(r)} style={{
              padding: "5px 11px", borderRadius: 999, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 800,
              background: rate === r ? "var(--surface-1)" : "transparent",
              color: rate === r ? "var(--text-1)" : "var(--text-2)",
              boxShadow: rate === r ? "var(--shadow-sm)" : "none",
            }}>{r}×</button>
          ))}
        </div>

        {/* Volume */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
          <Volume2 size={14} color="var(--text-2)" />
          <input type="range" min={0} max={1} step={0.05} value={vol}
            onChange={(e) => { setVol(+e.target.value); if (audioRef.current) audioRef.current.volume = +e.target.value; }}
            style={{ width: 70 }} />
        </div>
      </div>

      {/* Snippet toolbar (highlight reel) */}
      {leadId && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "10px 12px", borderRadius: 12,
          background: "var(--surface-3)", border: "1px solid var(--border-1)",
        }}>
          <Scissors size={14} color="var(--magenta)" />
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-2)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Snippet</span>

          <button onClick={markIn} className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>
            Mark In · {snipStart != null ? fmt(snipStart) : "—"}
          </button>
          <button onClick={markOut} disabled={snipStart == null} className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px", opacity: snipStart == null ? 0.5 : 1 }}>
            Mark Out · {snipEnd != null ? fmt(snipEnd) : "—"}
          </button>
          <button onClick={playSnip} disabled={snipStart == null} className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px", opacity: snipStart == null ? 0.5 : 1 }}>
            <Play size={11} /> Preview
          </button>
          {(snipStart != null || snipEnd != null) && (
            <button onClick={clearSnip} className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>Clear</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={shareSnip} disabled={sharing || snipStart == null} className="btn-brand" style={{ fontSize: 12, padding: "7px 14px" }}>
            {shared ? <><CheckCircle2 size={12} /> Sent</> : sharing ? <><Loader2 size={12} className="animate-spin" /> Sharing…</> : <><Share2 size={12} /> Share to Trainers</>}
          </button>
        </div>
      )}
    </div>
  );
}

const controlBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: "50%", border: "1px solid var(--border-2)",
  background: "var(--surface-1)", color: "var(--text-1)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
