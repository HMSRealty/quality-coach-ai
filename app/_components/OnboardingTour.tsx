"use client";

// Lightweight in-app onboarding tour. Shows a 5-step welcome card on first
// dashboard visit, dismissed by clicking through or hitting X. Dismissal is
// persisted to localStorage so the user only sees it once.

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ArrowRight, ArrowLeft, Sparkles, Server, Webhook, Trophy, CreditCard, PartyPopper } from "lucide-react";

const STORAGE_KEY = "realtrack_onboarding_seen_v1";

const STEPS = [
  {
    icon: PartyPopper,
    title: "Welcome to RealTrack",
    body: "Let's take a quick 30-second tour so you know where everything lives. You can skip anytime.",
    cta: null,
  },
  {
    icon: Sparkles,
    title: "Step 1 — Add a Gemini API key",
    body: "RealTrack uses Google's Gemini AI to qualify your calls. Get a free key from Google AI Studio and paste it in Settings → API.",
    cta: { label: "Open Settings", href: "/dashboard/settings/api" },
  },
  {
    icon: Server,
    title: "Step 2 — Connect your dialer (optional)",
    body: "If you use Readymode, add your dialer credentials so we can fetch call recordings automatically. Skip if you'll upload calls manually.",
    cta: { label: "Connect Dialer", href: "/dashboard/settings/api" },
  },
  {
    icon: Webhook,
    title: "Step 3 — Create a campaign",
    body: "Every lead is tied to a campaign that holds your AI qualification rules. Start with one and add more as you go.",
    cta: { label: "Create Campaign", href: "/dashboard/campaigns" },
  },
  {
    icon: Trophy,
    title: "You're all set",
    body: "Leads will land in your Call Library. Check the Leaderboard for agent pacing, and the Persona page to customize how the AI grades calls.",
    cta: { label: "Open Setup Wizard", href: "/dashboard/onboarding" },
  },
];

export function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch { /* SSR safe */ }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* */ }
    setVisible(false);
  };

  if (!visible) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const Icon = s.icon;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "fadeIn 200ms ease",
    }}>
      <div style={{
        maxWidth: 460, width: "100%", background: "#fff",
        borderRadius: 18, padding: "28px 28px 22px",
        boxShadow: "0 30px 80px rgba(15,23,42,0.30)",
        position: "relative",
      }}>
        <button onClick={dismiss}
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 5 }}
          title="Skip tour">
          <X size={16} />
        </button>

        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg, #0e7c6b, #0a5f52)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 14px",
        }}>
          <Icon size={24} color="#fff" />
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 900, color: "#15302e", textAlign: "center", marginBottom: 7 }}>
          {s.title}
        </h2>
        <p style={{ fontSize: 13.5, color: "#475569", textAlign: "center", lineHeight: 1.6, marginBottom: 20 }}>
          {s.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 18 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 18 : 6, height: 6, borderRadius: 3,
              background: i === step ? "#0e7c6b" : "#CBD5E1",
              transition: "all 220ms ease",
            }} />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 9 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => Math.max(0, s - 1))}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "10px 14px", borderRadius: 10,
                background: "#fff", border: "1px solid #E2E8F0", color: "#475569",
                fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}>
              <ArrowLeft size={13} /> Back
            </button>
          )}
          {s.cta && (
            <Link href={s.cta.href} onClick={dismiss}
              style={{
                flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 14px", borderRadius: 10,
                background: "#fff", border: "1px solid #E2E8F0", color: "#15302e",
                fontSize: 12.5, fontWeight: 800, cursor: "pointer", textDecoration: "none",
              }}>
              {s.cta.label}
            </Link>
          )}
          <button onClick={() => last ? dismiss() : setStep(s => s + 1)}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 14px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #0e7c6b, #0a5f52)", color: "#fff",
              fontSize: 12.5, fontWeight: 800, cursor: "pointer",
            }}>
            {last ? "Get started" : "Next"} <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
