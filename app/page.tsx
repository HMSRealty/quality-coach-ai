"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Loader2, ArrowRight, Home } from "lucide-react";

const RED   = "#C41E3A";
const RED_L = "#FEF2F2";

type Tab = "signin" | "signup";

function HSMLogo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="52" height="32" viewBox="0 0 40 24" fill="none">
        <path d="M2 22 L20 4 L38 22" stroke="#0A1E3F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M8 22 L20 11 L32 22" stroke="#0DAFAF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9"/>
      </svg>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "#0A1E3F", lineHeight: 1 }}>
        HMSREALTY.CRM
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    if (tab === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ text: error.message, ok: false });
      else window.location.href = "/dashboard";
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg({ text: error.message, ok: false });
      else setMsg({ text: "Check your inbox to confirm your account.", ok: true });
    }
    setLoading(false);
  };

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "#F9FAFB", border: "1.5px solid #E5E7EB",
    borderRadius: 10, fontSize: 14, color: "#111827",
    outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F8F9FA",
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
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 10, fontWeight: 500 }}>
            Outbound Intelligence Platform
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
              color: tab === t ? "#111827" : "#6B7280",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              transition: "all 140ms ease",
            }}>
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 7, letterSpacing: "0.02em" }}>
              Email address
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com" required style={inputBase}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 7, letterSpacing: "0.02em" }}>
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
                background: "none", border: "none", cursor: "pointer", color: "#9CA3AF",
                display: "flex", padding: 0, transition: "color 120ms",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#4B5563"}
              onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {msg && (
            <div style={{
              padding: "10px 14px", borderRadius: 9, fontSize: 13,
              background: msg.ok ? "#ECFDF5" : "#FEF2F2",
              border: `1px solid ${msg.ok ? "#A7F3D0" : "#FCA5A5"}`,
              color: msg.ok ? "#065F46" : RED,
            }}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px",
            background: loading ? "#F3F4F6" : RED,
            color: loading ? "#9CA3AF" : "#fff",
            border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: loading ? "none" : `0 2px 10px ${RED}35`,
            transition: "all 130ms ease",
            marginTop: 4,
          }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "#A3192F"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = RED; e.currentTarget.style.transform = "translateY(0)"; } }}
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Please wait...</> : <>{tab === "signin" ? "Sign In" : "Create Account"} <ArrowRight size={15} /></>}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 22 }}>
          <Link href="/landing" style={{ color: RED, fontWeight: 600 }}>
            View platform overview →
          </Link>
        </p>
      </div>
    </div>
  );
}
