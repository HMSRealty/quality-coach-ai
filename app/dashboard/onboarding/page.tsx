"use client";

export const runtime = "edge";

// Self-serve onboarding wizard — surfaces the 3 steps every new tenant needs
// to be fully operational. Each step links to the existing settings page
// section. Completes itself when all checks pass.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Circle, Loader2, ArrowRight, Sparkles, Server, Webhook, PartyPopper } from "lucide-react";

const NAVY = "#F4F4FF";
const SLATE = "#9A9AB0";
const SKY_600 = "#2563EB";
const MONEY = "#2563EB";

interface Status {
  has_api_key: boolean;
  has_gemini_key: boolean;
  has_dialer: boolean;
  has_campaign: boolean;
}

export default function OnboardingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [apiKeys, geminiKeys, dialers, campaigns] = await Promise.all([
      supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("revoked", false),
      supabase.from("gemini_api_keys").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
      supabase.from("readymode_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
    ]);
    setStatus({
      has_api_key: (apiKeys.count || 0) > 0,
      has_gemini_key: (geminiKeys.count || 0) > 0,
      has_dialer: (dialers.count || 0) > 0,
      has_campaign: (campaigns.count || 0) > 0,
    });
    setLoading(false);
  };
  useEffect(() => { check(); }, []);

  if (loading || !status) return (
    <div style={{ padding: 80, textAlign: "center" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: SKY_600 }} />
    </div>
  );

  const steps = [
    {
      done: status.has_gemini_key,
      icon: Sparkles,
      title: "Add a Gemini API key",
      desc: "Get one free from Google AI Studio. RealTrack uses it to analyze your calls and qualify leads.",
      cta: "Add Gemini Key",
      href: "/dashboard/integrations",
      external: "https://aistudio.google.com/apikey",
    },
    {
      done: status.has_dialer,
      icon: Server,
      title: "Connect your dialer (optional)",
      desc: "Add your Readymode credentials if you want recordings pulled automatically. Skip this if you'll send leads-only or upload calls manually.",
      cta: "Connect Dialer",
      href: "/dashboard/integrations",
    },
    {
      done: status.has_campaign,
      icon: Webhook,
      title: "Create a campaign",
      desc: "Campaigns hold your qualification rules. You need at least one before leads can be processed.",
      cta: "Create Campaign",
      href: "/dashboard/campaigns",
    },
  ];

  const completed = steps.filter(s => s.done).length;
  const allDone = completed === steps.length;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">

      {/* Header */}
      <div style={{ textAlign: "center" }}>
        {allDone ? <PartyPopper size={42} style={{ color: MONEY, margin: "0 auto 12px", display: "block" }} /> : null}
        <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em" }}>
          {allDone ? "You're live." : "Get the floor live in 3 steps"}
        </h1>
        <p style={{ fontSize: 14, color: SLATE, marginTop: 8 }}>
          {allDone
            ? "Everything's wired up. Calls land in the Library and get graded automatically."
            : `${completed} of ${steps.length} done. Let&apos;s finish the wiring.`}
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{
          width: `${(completed / steps.length) * 100}%`,
          height: "100%",
          background: allDone ? MONEY : "linear-gradient(90deg, #3B82F6, #2563EB)",
          transition: "width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            background: "#0A0A0E", border: `1px solid ${s.done ? "#A7F3D0" : "var(--border-2)"}`,
            borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)",
            display: "flex", alignItems: "center", gap: 14,
            opacity: s.done ? 0.85 : 1,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: s.done ? "rgba(59,130,246,0.14)" : "rgba(59,130,246,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {s.done ? <CheckCircle2 size={20} color={MONEY} /> : <s.icon size={18} color={SKY_600} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>
                Step {i + 1}: {s.title}
              </p>
              <p style={{ fontSize: 12.5, color: SLATE, marginTop: 2, lineHeight: 1.5 }}>{s.desc}</p>
              {s.external && !s.done && (
                <a href={s.external} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: SKY_600, fontWeight: 700, textDecoration: "none" }}>
                  → Get a key from aistudio.google.com/apikey
                </a>
              )}
            </div>
            {!s.done && (
              <Link href={s.href} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "9px 16px", borderRadius: 9,
                background: "linear-gradient(135deg,#3B82F6,#2563EB)", color: "#fff",
                fontSize: 12.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap",
              }}>
                {s.cta} <ArrowRight size={13} />
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {allDone ? (
        <Link href="/dashboard" style={{
          alignSelf: "center", marginTop: 12,
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "12px 24px", borderRadius: 11,
          background: MONEY, color: "#fff",
          fontSize: 13, fontWeight: 800, textDecoration: "none",
        }}>
          Go to Dashboard <ArrowRight size={14} />
        </Link>
      ) : (
        <p style={{ textAlign: "center", fontSize: 11.5, color: SLATE, marginTop: 4 }}>
          Need help? Email <a href="mailto:info@realtrack.app" style={{ color: SKY_600, fontWeight: 700 }}>info@realtrack.app</a>
        </p>
      )}
    </div>
  );
}
