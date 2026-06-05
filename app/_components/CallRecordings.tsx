"use client";

// Secure call recordings for a lead.
//  • Upload  -> private 'call-recordings' bucket  + a row in public.calls (RLS).
//  • Play    -> short-lived signed URL (mode=play)     — any role with calls.play.
//  • Download-> attachment signed URL (mode=download)  — gated to calls.download.
// The /api/calls/[id]/url route enforces the play/download split server-side.
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { can, normalizeRole, type Role } from "@/lib/rbac";
import { Upload, Play, Download, Loader2, Mic, Lock } from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.navy;
const SLATE = T.slate;

type Call = {
  id: string;
  storage_path: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

const fmtSize = (b: number | null) => (b ? `${(b / 1_048_576).toFixed(1)} MB` : "");

export function CallRecordings({ leadId }: { leadId: string }) {
  const [role, setRole] = useState<Role>("caller");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: prof } = await supabase
      .from("profiles").select("role, organization_id").eq("id", user.id).maybeSingle();
    setRole(normalizeRole(prof?.role));
    setOrgId((prof?.organization_id as string) ?? null);

    const { data, error } = await supabase
      .from("calls")
      .select("id, storage_path, duration_seconds, file_size_bytes, mime_type, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) { setUnavailable(true); setLoading(false); return; }
    setCalls((data || []) as Call[]);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const signedUrl = async (callId: string, mode: "play" | "download") => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/calls/${callId}/url?mode=${mode}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "Could not get URL");
    return j.url as string;
  };

  const play = async (c: Call) => {
    setBusyId(c.id);
    try {
      const url = await signedUrl(c.id, "play");
      if (audioRef.current) { audioRef.current.src = url; await audioRef.current.play(); setPlayingId(c.id); }
    } catch (e) { alert(e instanceof Error ? e.message : "Playback failed"); }
    setBusyId(null);
  };

  const download = async (c: Call) => {
    setBusyId(c.id);
    try { window.location.href = await signedUrl(c.id, "download"); }
    catch (e) { alert(e instanceof Error ? e.message : "Download failed"); }
    setBusyId(null);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!orgId) { alert("No organization on your profile — run the CRM migration first."); return; }
    if (file.size > 500 * 1024 * 1024) { alert("Max 500MB"); return; }
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const ext = file.name.split(".").pop();
    const path = `${orgId}/${leadId}/${Date.now()}.${ext}`;   // org folder => storage RLS
    const { error: upErr } = await supabase.storage.from("call-recordings").upload(path, file);
    if (upErr) { alert("Upload failed: " + upErr.message); setUploading(false); return; }
    const { error: insErr } = await supabase.from("calls").insert({
      lead_id: leadId, organization_id: orgId, storage_path: path,
      uploaded_by: user?.id ?? null, file_size_bytes: file.size, mime_type: file.type,
    });
    if (insErr) alert("Stored the file but couldn't save the record: " + insErr.message);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  if (unavailable) return null; // calls table not present (pre-migration)

  const canDownload = can(role, "calls.download");
  const canUpload = can(role, "calls.upload");

  return (
    <div style={{ background: T.surface1, border: "1px solid rgba(35,43,58,0.08)", borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mic size={16} color={NAVY} />
          <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Secure Recordings</h3>
        </div>
        {canUpload && (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8,
              background: NAVY, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: uploading ? "wait" : "pointer",
            }}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input ref={fileRef} type="file" accept="audio/*,video/mp4" onChange={onUpload} style={{ display: "none" }} />
          </>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: SLATE }}>Loading…</p>
      ) : calls.length === 0 ? (
        <p style={{ fontSize: 12, color: T.text3 }}>No secure recordings yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {calls.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, background: T.surface3 }}>
              <button onClick={() => play(c)} disabled={busyId === c.id} title="Play" style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                background: playingId === c.id ? "#2F6BFF" : NAVY, color: "#fff", border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>
                  {new Date(c.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
                <p style={{ fontSize: 11, color: SLATE }}>{[c.mime_type, fmtSize(c.file_size_bytes)].filter(Boolean).join(" · ")}</p>
              </div>
              {canDownload ? (
                <button onClick={() => download(c)} disabled={busyId === c.id} title="Download" style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7, cursor: "pointer",
                  background: T.surface1, color: NAVY, border: "1px solid rgba(35,43,58,0.12)", fontSize: 11, fontWeight: 700,
                }}>
                  <Download size={12} /> Download
                </button>
              ) : (
                <span title="Your role can play but not download" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: T.text3 }}>
                  <Lock size={11} /> Play-only
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <audio ref={audioRef} controls onEnded={() => setPlayingId(null)} style={{ width: "100%", marginTop: calls.length ? 14 : 0, display: playingId ? "block" : "none" }} />
    </div>
  );
}
