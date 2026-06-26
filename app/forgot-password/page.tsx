"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Mail, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const NAVY = "#F4F4FF";
const SLATE = "#9A9AB0";
const SKY = "#3B82F6";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setErr("Enter your email."); return; }
    setBusy(true); setErr("");
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSent(true);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #101018 0%, rgba(59,130,246,0.10) 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "#0A0A0E", borderRadius: 18, padding: "36px 32px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
        border: "1px solid #22222c",
      }}>
        <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: SLATE, textDecoration: "none", marginBottom: 22 }}>
          <ArrowLeft size={13} /> Back to sign in
        </Link>

        {sent ? (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(10,95,82,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <CheckCircle2 size={28} color="#2563EB" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, textAlign: "center", marginBottom: 8 }}>Check your inbox</h1>
            <p style={{ fontSize: 14, color: SLATE, textAlign: "center", lineHeight: 1.6 }}>
              We sent a reset link to <strong style={{ color: NAVY }}>{email}</strong>. Click it within the next hour to set a new password.
            </p>
            <p style={{ fontSize: 12, color: SLATE, textAlign: "center", marginTop: 18 }}>
              No email? Check your spam folder, or <button onClick={() => setSent(false)} style={{ background: "none", border: "none", color: SKY, fontWeight: 700, cursor: "pointer" }}>try a different address</button>.
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, marginBottom: 6 }}>Reset your password</h1>
            <p style={{ fontSize: 13, color: SLATE, marginBottom: 22, lineHeight: 1.55 }}>
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <label style={{ fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Email
            </label>
            <div style={{ position: "relative", marginBottom: 18 }}>
              <Mail size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoFocus
                style={{
                  width: "100%", padding: "11px 12px 11px 38px", borderRadius: 10,
                  border: "1px solid #22222c", background: "#101018",
                  fontSize: 14, color: NAVY, outline: "none",
                }} />
            </div>

            {err && (
              <div style={{
                padding: "10px 12px", borderRadius: 9, marginBottom: 14,
                background: "rgba(251,113,133,0.12)", border: "1px solid #FECACA", color: "#DC2626",
                fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7,
              }}>
                <AlertCircle size={14} /> {err}
              </div>
            )}

            <button type="submit" disabled={busy} style={{
              width: "100%", padding: "12px", borderRadius: 11, border: "none",
              background: "linear-gradient(135deg, #3B82F6, #2563EB)", color: "#fff",
              fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
