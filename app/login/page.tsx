"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Loader2, ArrowRight, Home } from "lucide-react";
import { T } from "@/app/_components/tokens";

const RED   = "#0e7c6b";
const RED_L = "#fdeee9";

type Tab = "signin" | "signup";

function RealTrackLogo() {
  // Resona-style equalizer brand mark: four bars (teal · coral · amber · teal)
  // above a Bricolage wordmark.
  const bars = [
    { h: 9, c: "#0e7c6b" },
    { h: 20, c: "#ef5f3b" },
    { h: 14, c: "#e3a23a" },
    { h: 24, c: "#0e7c6b" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 24 }}>
        {bars.map((b, i) => (
          <i key={i} style={{ width: 3.5, height: b.h, borderRadius: 2, background: b.c, display: "block" }} />
        ))}
      </span>
      <span style={{
        fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700,
        letterSpacing: "-0.02em", color: T.navy, lineHeight: 1,
      }}>
        RealTrack
      </span>
    </div>
  );
}

export default function AuthPage() {
  const [tab, setTab]           = useState<Tab>("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState<{ text: string; ok: boolean } | null>(null);
  // Signup-only fields (Phase 4 §1 onboarding):
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone]       = useState("");
  const [website, setWebsite]   = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    if (tab === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ text: error.message, ok: false });
      else window.location.href = "/dashboard";
    } else {
      // Required onboarding fields.
      if (!fullName.trim() || !username.trim() || !phone.trim()) {
        setMsg({ text: "Full name, username and phone are required.", ok: false });
        setLoading(false); return;
      }
      // Anyone can sign up — access is gated by billing, not email domain.
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName.trim(), username: username.trim().toLowerCase(), phone: phone.trim(), website: website.trim() } },
      });
      if (error) { setMsg({ text: error.message, ok: false }); setLoading(false); return; }
      // Persist the onboarding fields onto profiles (the auth metadata above is a
      // backup; profiles is what the app reads).
      if (data.user) {
        await supabase.from("profiles").update({
          full_name: fullName.trim(),
          username: username.trim().toLowerCase(),
          phone: phone.trim(),
          website: website.trim() || null,
        }).eq("id", data.user.id);
        // Best-effort welcome email (no-op if RESEND_API_KEY not set).
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          fetch("/api/notify/welcome", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {});
        }
      }
      setMsg({ text: "Account created! Taking you to plans...", ok: true });
      // Smooth handoff: send the new user straight to the payment page so
      // they keep momentum. They can still confirm their email later.
      setTimeout(() => { window.location.href = "/pay"; }, 800);
    }
    setLoading(false);
  };

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: T.surface3, border: "1.5px solid #E5E7EB",
    borderRadius: 10, fontSize: 14, color: T.navy,
    outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.surface3,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      {/* Card */}
      <div className="animate-scale" style={{
        width: "100%", maxWidth: 420,
        background: T.surface1, border: "1.5px solid #E5E7EB",
        borderRadius: 20, padding: "36px 32px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <RealTrackLogo />
          <p style={{ fontSize: 13, color: T.slate2, marginTop: 10, fontWeight: 500 }}>
            Performance &amp; Coaching Suite
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: "flex", background: "#F3F4F6",
          border: "1px solid #E5E7EB",
          borderRadius: 12, padding: 4, marginBottom: 26, gap: 4,
        }}>
          {(["signin", "signup"] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setMsg(null); }} style={{
              flex: 1, padding: "9px 12px",
              borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
              background: tab === t ? "#FFFFFF" : "transparent",
              color: tab === t ? T.navy : T.slate2,
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              transition: "all 140ms ease",
            }}>
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "signup" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Full name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" required style={inputBase} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Username</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="jane" required style={inputBase} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Phone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (305) 555-0199" required style={inputBase} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Website</label>
                  <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" style={inputBase} />
                </div>
              </div>
            </>
          )}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 7, letterSpacing: "0.02em" }}>
              Email address
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required style={inputBase}
            />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#334155", letterSpacing: "0.02em" }}>
                Password
              </label>
              {tab === "signin" && (
                <Link href="/forgot-password" style={{ fontSize: 11, color: "#0a5f52", fontWeight: 700, textDecoration: "none" }}>
                  Forgot password?
                </Link>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6}
                style={{ ...inputBase, paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: T.text3,
                display: "flex", padding: 0, transition: "color 120ms",
              }}
              onMouseEnter={e => e.currentTarget.style.color = T.slate}
              onMouseLeave={e => e.currentTarget.style.color = T.text3}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {msg && (
            <div style={{
              padding: "10px 14px", borderRadius: 9, fontSize: 13,
              background: msg.ok ? "#ECFDF5" : "#FBEEE8",
              border: `1px solid ${msg.ok ? "#A7F3D0" : "#E7B8A6"}`,
              color: msg.ok ? "#065F46" : RED,
            }}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px",
            background: loading ? "#F3F4F6" : RED,
            color: loading ? T.text3 : "#fff",
            border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: loading ? "none" : `0 2px 10px ${RED}35`,
            transition: "all 130ms ease",
            marginTop: 4,
          }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "#0a5f52"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = RED; e.currentTarget.style.transform = "translateY(0)"; } }}
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Please wait...</> : <>{tab === "signin" ? "Sign In" : "Create Account"} <ArrowRight size={15} /></>}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: T.text3, marginTop: 22 }}>
          <Link href="/landing" style={{ color: RED, fontWeight: 600 }}>
            View platform overview →
          </Link>
        </p>
      </div>
    </div>
  );
}
