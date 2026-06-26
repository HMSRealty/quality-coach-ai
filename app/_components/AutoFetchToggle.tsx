"use client";

// Per-user toggle: "Auto-fetch recordings from Readymode" — when ON, the
// cron looks each new lead up by phone on the dialer's research page and
// pulls the call audio. When OFF, leads simply land as "Needs Call" with
// no recording-fetch attempt (and no Readymode login needed).

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Music, Loader2 } from "lucide-react";

const SKY = "#3B82F6";
const NAVY = "#F4F4FF";
const SLATE = "#9A9AB0";
const MONEY = "#2563EB";

export function AutoFetchToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from("profiles")
        .select("auto_fetch_recordings").eq("id", user.id).maybeSingle();
      setEnabled(!!data?.auto_fetch_recordings);
      setLoading(false);
    })();
  }, []);

  const toggle = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const next = !enabled;
    await supabase.from("profiles").update({ auto_fetch_recordings: next }).eq("id", user.id);
    setEnabled(next);
    setSaving(false);
  };

  return (
    <div style={{
      background: "#0A0A0E", border: "1px solid var(--border-2)", borderRadius: 14,
      padding: 18, boxShadow: "var(--shadow-sm)",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: enabled ? "rgba(10,95,82,0.12)" : "rgba(100,116,139,0.10)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Music size={18} color={enabled ? MONEY : SLATE} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>
          Auto-fetch call recordings
        </p>
        <p style={{ fontSize: 12, color: SLATE, marginTop: 2, lineHeight: 1.5 }}>
          {enabled
            ? "On — the cron looks each new lead up on Readymode and pulls the call audio automatically."
            : "Off — leads land as “Needs Call” with no recording. You can upload audio manually later or turn this on once you've connected a Readymode dialer above."}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={loading || saving}
        style={{
          position: "relative", width: 48, height: 26, borderRadius: 999, border: "none", padding: 0,
          background: enabled ? `linear-gradient(135deg, ${SKY}, #2563EB)` : "#33333f",
          cursor: loading || saving ? "wait" : "pointer",
          transition: "background 200ms ease",
        }}
      >
        {saving ? (
          <Loader2 size={14} className="animate-spin" style={{ position: "absolute", top: 6, left: enabled ? 26 : 6, color: "#fff" }} />
        ) : (
          <span style={{
            position: "absolute", top: 3, left: enabled ? 25 : 3,
            width: 20, height: 20, borderRadius: "50%", background: "#0A0A0E",
            boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
            transition: "left 240ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }} />
        )}
      </button>
    </div>
  );
}
