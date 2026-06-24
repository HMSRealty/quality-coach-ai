"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { KeyRound, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";

const NAVY = "#15302e";
const SLATE = "#475569";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Supabase puts the recovery token in the URL fragment; the client SDK
  // picks it up automatically and emits a PASSWORD_RECOVERY auth event.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also handle the case where the page is loaded with an already-valid session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => { data.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = "/dashboard"; }, 2000);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "#fff", borderRadius: 18, padding: "36px 32px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
        border: "1px solid #E2E8F0",
      }}>
        {done ? (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(10,95,82,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <CheckCircle2 size={28} color="#0a5f52" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, textAlign: "center", marginBottom: 8 }}>Password updated</h1>
            <p style={{ fontSize: 14, color: SLATE, textAlign: "center", lineHeight: 1.6 }}>Redirecting you to the dashboard...</p>
          </>
        ) : !ready ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, marginBottom: 6 }}>Reset link expired or invalid</h1>
            <p style={{ fontSize: 13, color: SLATE, lineHeight: 1.55, marginBottom: 20 }}>
              The recovery link couldn&apos;t be validated. Reset links expire after 1 hour. Request a fresh one.
            </p>
            <Link href="/forgot-password" style={{
              display: "block", textAlign: "center",
              padding: "12px", borderRadius: 11,
              background: "linear-gradient(135deg, #0e7c6b, #0a5f52)", color: "#fff",
              fontSize: 14, fontWeight: 800, textDecoration: "none",
            }}>
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, marginBottom: 6 }}>Set a new password</h1>
            <p style={{ fontSize: 13, color: SLATE, marginBottom: 20, lineHeight: 1.55 }}>
              Choose something at least 8 characters long.
            </p>

            <label style={{ fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              New password
            </label>
            <div style={{ position: "relative", marginBottom: 14 }}>
              <KeyRound size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
              <input type={showPw ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)}
                autoFocus
                style={{
                  width: "100%", padding: "11px 38px", borderRadius: 10,
                  border: "1px solid #E2E8F0", background: "#F8FAFC",
                  fontSize: 14, color: NAVY, outline: "none",
                }} />
              <button type="button" onClick={() => setShowPw(s => !s)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: SLATE, padding: 4 }}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Confirm password
            </label>
            <div style={{ position: "relative", marginBottom: 18 }}>
              <KeyRound size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
              <input type={showPw ? "text" : "password"} value={pw2} onChange={e => setPw2(e.target.value)}
                style={{
                  width: "100%", padding: "11px 12px 11px 38px", borderRadius: 10,
                  border: "1px solid #E2E8F0", background: "#F8FAFC",
                  fontSize: 14, color: NAVY, outline: "none",
                }} />
            </div>

            {err && (
              <div style={{
                padding: "10px 12px", borderRadius: 9, marginBottom: 14,
                background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626",
                fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7,
              }}>
                <AlertCircle size={14} /> {err}
              </div>
            )}

            <button type="submit" disabled={busy} style={{
              width: "100%", padding: "12px", borderRadius: 11, border: "none",
              background: "linear-gradient(135deg, #0e7c6b, #0a5f52)", color: "#fff",
              fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
