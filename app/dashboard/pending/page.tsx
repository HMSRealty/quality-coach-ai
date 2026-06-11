"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Clock, Mail, LogOut, RefreshCw } from "lucide-react";

const NAVY = "#0F172A";
const SLATE = "#475569";

export default function PendingApproval() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/"; return; }
      setEmail(user.email || "");
      const { data } = await supabase.from("profiles").select("full_name, is_approved").eq("id", user.id).maybeSingle();
      if (data?.full_name) setName(data.full_name as string);
      if (data?.is_approved) window.location.href = "/dashboard";
    })();
  }, []);

  const recheck = async () => {
    setChecking(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/"; return; }
    const { data } = await supabase.from("profiles").select("is_approved").eq("id", user.id).maybeSingle();
    setChecking(false);
    if (data?.is_approved) window.location.href = "/dashboard";
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        maxWidth: 480, width: "100%", background: "#fff",
        borderRadius: 18, padding: 36,
        boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
        border: "1px solid #E2E8F0",
        textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
          margin: "0 auto 18px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Clock size={28} color="#fff" />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, marginBottom: 8 }}>
          Awaiting Approval
        </h1>
        <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.6, marginBottom: 22 }}>
          {name ? `Hi ${name.split(" ")[0]} — ` : ""}your account <strong style={{ color: NAVY }}>{email}</strong> has been created.
          Our team is reviewing it and will activate your access shortly.
        </p>

        <div style={{
          background: "#F8FAFC", border: "1px solid #E2E8F0",
          borderRadius: 12, padding: 16, marginBottom: 20,
          textAlign: "left",
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Mail size={13} color="#0284C7" /> Want to expedite?
          </p>
          <p style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.55 }}>
            Email <a href="mailto:moe@winnerhouses.com" style={{ color: "#0284C7", fontWeight: 700, textDecoration: "none" }}>moe@winnerhouses.com</a> with your company name and use case. We typically activate accounts within one business day.
          </p>
        </div>

        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={recheck} disabled={checking} style={{
            flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "11px 18px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #0EA5E9, #0284C7)", color: "#fff",
            fontSize: 13, fontWeight: 800, cursor: checking ? "wait" : "pointer",
          }}>
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking..." : "Check Status"}
          </button>
          <button onClick={logout} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "11px 16px", borderRadius: 10,
            border: "1px solid #E2E8F0", background: "#fff", color: SLATE,
            fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
