"use client";

// Highlight-reel inbox shown on the Trainers page. Lists every snippet captured
// from the Gong player via "Share to Trainers".
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { Play, Pause, Scissors, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { T } from "@/app/_components/tokens";

interface Snippet {
  id: string; lead_id: string; title: string; note: string | null;
  start_ms: number; end_ms: number; source_url: string; created_at: string;
}

const fmt = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`; };

export function TrainingSnippets() {
  const [snips, setSnips] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("training_snippets")
        .select("id, lead_id, title, note, start_ms, end_ms, source_url, created_at")
        .order("created_at", { ascending: false }).limit(50);
      if (error) { setLoading(false); return; }
      setSnips((data || []) as Snippet[]);
      setLoading(false);
    })();
  }, []);

  const play = (s: Snippet) => {
    const id = `aud-${s.id}`;
    const a = document.getElementById(id) as HTMLAudioElement | null;
    if (!a) return;
    if (a.paused) {
      a.currentTime = s.start_ms / 1000;
      a.play(); setPlayingId(s.id);
      const onTick = () => {
        if (a.currentTime * 1000 >= s.end_ms) {
          a.pause(); setPlayingId(null); a.removeEventListener("timeupdate", onTick);
        }
      };
      a.addEventListener("timeupdate", onTick);
    } else {
      a.pause(); setPlayingId(null);
    }
  };

  const remove = async (s: Snippet) => {
    if (!confirm("Delete this snippet?")) return;
    const { error } = await supabase.from("training_snippets").delete().eq("id", s.id);
    if (!error) setSnips(p => p.filter(x => x.id !== s.id));
  };

  return (
    <Card title="Highlight Reels (shared from calls)">
      {loading ? (
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-1)" }} />
      ) : snips.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-2)" }}>
          No snippets yet. Open any call, mark in/out on the waveform, then hit <strong>Share to Trainers</strong>.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {snips.map((s) => (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px", borderRadius: 12,
              background: "var(--surface-3)", border: "1px solid var(--border-1)",
            }}>
              <button onClick={() => play(s)} style={{
                width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
                background: T.gradPrimary, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 6px 16px rgba(242,38,111,0.30)",
              }}>
                {playingId === s.id ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
              </button>
              <audio id={`aud-${s.id}`} src={s.source_url} preload="metadata" style={{ display: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Scissors size={11} color={T.magenta as string} /> {s.title}
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>· {fmt(s.start_ms)} → {fmt(s.end_ms)}</span>
                </p>
                {s.note && <p style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 2 }}>{s.note}</p>}
                <p style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>{new Date(s.created_at).toLocaleString()}</p>
              </div>
              <a href={`/dashboard/leads/${s.lead_id}`} className="btn-ghost" style={{ textDecoration: "none", fontSize: 11, padding: "6px 10px" }}>
                <ExternalLink size={11} /> Open lead
              </a>
              <button onClick={() => remove(s)} title="Delete"
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-2)",
                  background: "var(--surface-1)", color: "#DC2626", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
