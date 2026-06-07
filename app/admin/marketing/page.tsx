"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Mail, Send, Users, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";

const TEMPLATES = {
  welcome: {
    subject: "Welcome to Quality Coach AI — Your Account is Active",
    body: `Hi there,

Welcome to Quality Coach AI! Your account is now active and ready.

Here's how to get started:

1. Sign in at your dashboard
2. Go to My Profile and add your Gemini API key
3. Create your first Campaign with custom qualification rules
4. Upload a call recording under Analyze Lead
5. Review AI-scored results on your Dashboard

Questions? Reply directly to this email.

— The Quality Coach AI Team`,
  },
  newsletter: {
    subject: "Quality Coach AI — What's New This Month",
    body: `Hi there,

Here's what's new on Quality Coach AI:

🚀 Re-analyze calls when your campaign rules change
📊 Compliance tracking with pass/fail flags per lead
🔧 Faster Gemini 2.5 Pro processing
👤 New profile management dashboard

Tip of the month: Write specific, measurable qualification criteria in your campaign rules for highest AI scoring accuracy.

Example: "Mark as Hot Lead if seller mentions must sell within 30 days AND asking price is below market value."

— The Quality Coach AI Team`,
  },
  custom: { subject: "", body: "" },
};

const C: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14 };

export default function MarketingPage() {
  const [tpl, setTpl]         = useState<keyof typeof TEMPLATES>("welcome");
  const [subject, setSubject] = useState(TEMPLATES.welcome.subject);
  const [body, setBody]       = useState(TEMPLATES.welcome.body);
  const [filter, setFilter]   = useState<"all"|"paid"|"pending">("all");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [allEmails, setAllEmails]   = useState<{ email: string; payment_status: string }[]>([]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("email, payment_status").then(({ data }) => {
      if (data) setAllEmails(data as { email: string; payment_status: string }[]);
    });
  }, []);

  useEffect(() => {
    let r = allEmails;
    if (filter === "paid")    r = allEmails.filter(u => u.payment_status === "paid");
    if (filter === "pending") r = allEmails.filter(u => u.payment_status !== "paid");
    setRecipients(r.map(u => u.email));
  }, [allEmails, filter]);

  const applyTpl = (t: keyof typeof TEMPLATES) => {
    setTpl(t);
    setSubject(TEMPLATES[t].subject);
    setBody(TEMPLATES[t].body);
  };

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) { showToast("Subject and body required.", false); return; }
    if (recipients.length === 0) { showToast("No recipients match filter.", false); return; }
    if (!confirm(`Send to ${recipients.length} recipient(s)?`)) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, recipients }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      showToast(`Sent to ${json.sent} recipients.`, true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Send failed", false);
    }
    setSending(false);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>

      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 50,
          padding: "10px 16px", borderRadius: 10,
          display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600,
          background: toast.ok ? "var(--accent)" : "var(--red)",
          color: toast.ok ? "#000" : "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ ...C, padding: "20px 24px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 }}>Admin</p>
        <p style={{ fontSize: 22, fontWeight: 900 }}>Marketing & Broadcast</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Send onboarding emails and newsletters to your platform users.</p>
      </div>

      <form onSubmit={send} style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 18, alignItems: "start" }}>

        {/* Composer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Template selector */}
          <div style={{ ...C, padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 12 }}>Email Template</p>
            <div style={{ display: "flex", gap: 8 }}>
              {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map(t => (
                <button key={t} type="button" onClick={() => applyTpl(t)}
                  style={{
                    flex: 1, padding: "9px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                    textTransform: "capitalize", cursor: "pointer", border: "1px solid",
                    background: tpl === t ? "var(--accent-dim)" : "var(--surface)",
                    color: tpl === t ? "var(--accent)" : "var(--text-muted)",
                    borderColor: tpl === t ? "var(--accent-glow)" : "var(--border)",
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Subject + body */}
          <div style={{ ...C, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 7 }}>Subject Line</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject..."
                required
                style={{
                  width: "100%", background: "var(--surface)", border: "1px solid var(--border-light)",
                  borderRadius: 9, padding: "9px 13px", fontSize: 13, color: "var(--text)", outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 7 }}>Email Body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={16}
                placeholder="Write your email content..."
                required
                style={{
                  width: "100%", background: "var(--surface)", border: "1px solid var(--border-light)",
                  borderRadius: 9, padding: "9px 13px", fontSize: 13, color: "var(--text)",
                  outline: "none", resize: "none", fontFamily: "var(--font-geist-mono)",
                  lineHeight: 1.7,
                }}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Audience */}
          <div style={{ ...C, padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 12 }}>
              <Mail size={12} style={{ display: "inline", marginRight: 6 }} />Target Audience
            </p>
            <div style={{ position: "relative", marginBottom: 14 }}>
              <select
                value={filter}
                onChange={e => setFilter(e.target.value as "all"|"paid"|"pending")}
                style={{
                  width: "100%", background: "var(--surface)", border: "1px solid var(--border-light)",
                  borderRadius: 9, padding: "9px 32px 9px 12px", fontSize: 13, color: "var(--text)",
                  outline: "none", cursor: "pointer", appearance: "none",
                }}
              >
                <option value="all">All Users</option>
                <option value="paid">Paid Subscribers</option>
                <option value="pending">Pending / Unactivated</option>
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
            </div>
            <div style={{
              background: "var(--surface)", borderRadius: 9, padding: "14px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <p style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Recipients</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: "var(--accent)" }}>{recipients.length}</p>
              </div>
              <Users size={20} style={{ color: "var(--text-dim)" }} />
            </div>
          </div>

          {/* Preview toggle */}
          <button type="button" onClick={() => setPreview(!preview)} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "10px", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--card)", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {preview ? <EyeOff size={14} /> : <Eye size={14} />}
            {preview ? "Hide Preview" : "Preview Email"}
          </button>

          {preview && (
            <div style={{ ...C, padding: 16, overflow: "hidden" }}>
              <p style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Preview</p>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{subject || "(no subject)"}</p>
              <pre style={{
                fontSize: 11, color: "var(--text-muted)", whiteSpace: "pre-wrap",
                fontFamily: "var(--font-geist-sans)", lineHeight: 1.65,
                maxHeight: 240, overflowY: "auto", overscrollBehavior: "contain",
              }}>{body || "(no body)"}</pre>
            </div>
          )}

          {/* Send */}
          <button
            type="submit"
            disabled={sending || recipients.length === 0}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "13px", borderRadius: 11, border: "none",
              background: "var(--accent)", color: "#000",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              opacity: sending || recipients.length === 0 ? 0.5 : 1,
            }}
          >
            {sending ? <><Loader2 size={15} className="animate-spin" /> Sending...</> : <><Send size={15} /> Send Broadcast</>}
          </button>

          <p style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", lineHeight: 1.5 }}>
            Configure SMTP env vars in <code style={{ fontFamily: "var(--font-geist-mono)", background: "var(--surface)", padding: "1px 4px", borderRadius: 4 }}>api/email/broadcast</code> to activate sending.
          </p>
        </div>
      </form>
    </div>
  );
}
