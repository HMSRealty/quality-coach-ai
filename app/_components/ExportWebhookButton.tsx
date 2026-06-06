"use client";

// "Export Lead" button — posts lead+ARV+AI+signed call URL to the org's
// configured webhook (Zapier/GHL/Make). Also accepts an ad-hoc URL.
import { useEffect, useState } from "react";
import { Send, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";

export function ExportWebhookButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      if (!prof?.organization_id) return;
      const { data: org } = await supabase.from("organizations").select("export_webhook_url").eq("id", prof.organization_id).maybeSingle();
      if (org?.export_webhook_url) setSavedUrl(org.export_webhook_url as string);
    })();
  }, []);

  const fire = async (override?: string) => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/leads/${leadId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(override ? { url: override } : {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `Webhook returned ${j.status}`);
      setToast({ ok: true, msg: "Sent to webhook." });
      setOpen(false);
    } catch (e) {
      setToast({ ok: false, msg: e instanceof Error ? e.message : "Failed" });
    }
    setBusy(false);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <>
      <button onClick={() => savedUrl ? fire() : setOpen(true)} disabled={busy} className="btn-ghost" style={{ fontSize: 12 }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        Export Lead
      </button>

      {open && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(8,10,24,0.55)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            width: "100%", maxWidth: 480, borderRadius: 18,
            background: "var(--surface-1)", border: "1px solid var(--border-2)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.40)", padding: 22,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>Export to webhook</p>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={15} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 12 }}>
              Paste a Zapier / GoHighLevel / Make webhook URL. Save it under Settings to skip this dialog next time.
            </p>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/..."
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13,
                background: "var(--surface-3)", border: "1px solid var(--border-2)", color: "var(--text-1)", outline: "none",
              }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
              <button onClick={() => fire(url)} disabled={busy || !url.trim()} className="btn-brand">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 22, right: 22, zIndex: 200,
          padding: "10px 14px", borderRadius: 10,
          background: toast.ok ? "#ECFDF5" : "#FBEEE8", color: toast.ok ? "#065F46" : "#991B1B",
          border: `1px solid ${toast.ok ? "#A7F3D0" : "#FBCFBE"}`,
          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
          boxShadow: "var(--shadow-md)",
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}
    </>
  );
}
