"use client";

// Gong-style audio player:
//   • Tall waveform with brand-gradient progress fill
//   • Big circular Play/Pause + skip ±15s
//   • Speed selector (1× / 1.25× / 1.5× / 2×)
//   • Current / duration timecodes
//   • Download button (RBAC-gated by caller)
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, RotateCw, Download, Volume2 } from "lucide-react";
import { T } from "@/app/_components/tokens";

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

export function GongPlayer({ src, downloadUrl, title }: { src: string; downloadUrl?: string; title?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [vol, setVol] = useState(1);
  const bars = fakeBars(src);

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
      <audio ref={audioRef} src={src} preload="metadata" />
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{title}</p>
          {downloadUrl && (
            <a href={downloadUrl} download className="btn-ghost" style={{ textDecoration: "none", fontSize: 12 }}>
              <Download size={12} /> Download
            </a>
          )}
        </div>
      )}

      {/* Waveform / progress */}
      <div onClick={seek}
        style={{
          height: 78, padding: "0 2px", borderRadius: 12, cursor: "pointer", position: "relative",
          background: "var(--surface-3)", display: "flex", alignItems: "center", gap: 2, overflow: "hidden",
        }}>
        {bars.map((h, i) => {
          const filled = i / bars.length <= progress;
          return (
            <span key={i} style={{
              flex: 1,
              height: `${h * 60 + 10}%`,
              borderRadius: 2,
              background: filled ? T.gradPrimary : "var(--surface-5)",
              opacity: filled ? 1 : 0.65,
              transition: "background 120ms",
            }} />
          );
        })}
        <span style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${progress * 100}%`, width: 2,
          background: "var(--magenta)", boxShadow: "0 0 12px var(--magenta-glow)",
          pointerEvents: "none",
        }} />
      </div>

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
            boxShadow: "0 12px 28px rgba(242,38,111,0.40)",
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
    </div>
  );
}

const controlBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: "50%", border: "1px solid var(--border-2)",
  background: "var(--surface-1)", color: "var(--text-1)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
