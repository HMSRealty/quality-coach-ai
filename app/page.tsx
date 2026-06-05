"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Loader2, ArrowRight, Home } from "lucide-react";

const RED   = "#2F6BFF";
const RED_L = "#FBEEE8";

type Tab = "signin" | "signup";

function HSMLogo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="52" height="32" viewBox="0 0 40 24" fill="none">
        <path d="M2 22 L20 4 L38 22" stroke="#232B3A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M8 22 L20 11 L32 22" stroke="#2F6BFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9"/>
      </svg>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "#232B3A", lineHeight: 1 }}>
        REALTRACK
      </span>
    </div>
  );
}

// Reject obvious free-mail providers when "Business email" is required.
const FREE_MAIL = new Set([
  "gmail.com","googlemail.com","outlook.com","hotmail.com","live.com","msn.com",
  "yahoo.com","yahoo.co.uk","yahoo.co.in","ymail.com","icloud.com","me.com",
  "aol.com","proton.me","protonmail.com","mail.com","gmx.com","yandex.com","zoho.com",
]);
const isBusinessEmail = (e: string) => {
  const d = (e.split("@")[1] || "").toLowerCase();
  return !!d && !FREE_MAIL.has(d);
};

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
      // Business email required for new TOP-LEVEL signups (sub-users created by an
      // owner use a separate flow, so they're not blocked here).
      if (!isBusinessEmail(email)) {
        setMsg({ text: "Please use a business email (no Gmail / Yahoo / Outlook).", ok: false });
        setLoading(false); return;
      }
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
      }
      setMsg({ text: "Account created! Check your inbox to confirm.", ok: true });
    }
    setLoading(false);
  };

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "#F4EFE7", border: "1.5px solid #E5E7EB",
    borderRadius: 10, fontSize: 14, color: "#232B3A",
    outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F2F5F9",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      {/* Card */}
      <div className="animate-scale" style={{
        width: "100%", maxWidth: 420,
        background: "#FFFFFF", border: "1.5px solid #E5E7EB",
        borderRadius: 20, padding: "36px 32px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <HSMLogo />
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 10, fontWeight: 500 }}>
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
              color: tab === t ? "#232B3A" : "#64748B",
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
              {tab === "signup" ? "Business email" : "Email address"}
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder={tab === "signup" ? "you@yourcompany.com" : "you@company.com"} required style={inputBase}
            />
            {tab === "signup" && (
              <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
                Use your company email. Sub-users you create later can use any address.
              </p>
            )}
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 7, letterSpacing: "0.02em" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6}
                style={{ ...inputBase, paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "#94A3B8",
                display: "flex", padding: 0, transition: "color 120ms",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#4B5563"}
              onMouseLeave={e => e.currentTarget.style.color = "#94A3B8"}
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
            color: loading ? "#94A3B8" : "#fff",
            border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: loading ? "none" : `0 2px 10px ${RED}35`,
            transition: "all 130ms ease",
            marginTop: 4,
          }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "#1E50D8"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = RED; e.currentTarget.style.transform = "translateY(0)"; } }}
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Please wait...</> : <>{tab === "signin" ? "Sign In" : "Create Account"} <ArrowRight size={15} /></>}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", marginTop: 22 }}>
          <Link href="/landing" style={{ color: RED, fontWeight: 600 }}>
            View platform overview →
          </Link>
        </p>
      </div>
    </div>
  );
}
