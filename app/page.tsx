"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  ArrowRight, Check, Sparkles, ShieldCheck, Cookie, Lock,
  Flame, Sun, Snowflake, Headphones, Bot, Calculator, Search, Trophy,
  Columns3, Star, Phone, Webhook, BarChart3, Users2, Zap,
  CheckCircle2, Clock, FileText, Mail, Code,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const SKY = "#0EA5E9";
const SKY_600 = "#0284C7";
const NAVY = "#0B0F1F";
const SLATE = "#475569";
const MUTED = "#64748B";

function RealTrackLogo({ light = false, size = 1 }: { light?: boolean; size?: number }) {
  const stroke = light ? "#fff" : NAVY;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={34 * size} height={22 * size} viewBox="0 0 40 24" fill="none">
        <path d="M2 22 L20 4 L38 22" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 22 L20 11 L32 22" stroke={light ? "rgba(255,255,255,0.55)" : SKY_600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 18 * size, fontWeight: 800, letterSpacing: "0.04em", color: light ? "#fff" : NAVY }}>RealTrack</span>
    </div>
  );
}

const navLink: React.CSSProperties = {
  fontSize: 13.5, fontWeight: 600, color: "#334155", textDecoration: "none",
  padding: "8px 12px", borderRadius: 8,
};

// ── HERO MOCKUP — looks like a screenshot of the Call Library, drawn in SVG ──
function HeroMockup() {
  return (
    <div style={{
      borderRadius: 18, background: "#fff",
      boxShadow: "0 30px 80px rgba(11,15,31,0.18), 0 8px 24px rgba(11,15,31,0.08)",
      border: "1px solid #E2E8F0", overflow: "hidden",
      maxWidth: 560, margin: "0 auto",
    }}>
      <div style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "10px 14px", display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FECACA" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FDE68A" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#A7F3D0" }} />
        <span style={{ marginLeft: 10, fontSize: 11, color: MUTED, fontFamily: "var(--font-mono)" }}>realtrack.app/dashboard/calls</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>Call Library</h3>
          <span style={{ padding: "3px 10px", borderRadius: 999, background: "#ECFDF5", color: "#059669", fontSize: 11, fontWeight: 800 }}>3 analyzing</span>
        </div>
        {[
          { addr: "2762 Downing St, Jacksonville FL", agent: "Sarah Smith", arv: "$148k", status: "Hot", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
          { addr: "931 Grant Blvd, Lehigh Acres FL", agent: "Mike Chen", arv: "$215k", status: "Warm", color: "#EA580C", bg: "rgba(234,88,12,0.12)" },
          { addr: "300 Pelican Ave, Sebring FL", agent: "Jess Lopez", arv: "$92k", status: "Cold", color: "#0284C7", bg: "rgba(2,132,199,0.12)" },
          { addr: "7 Estill Dr, Charleston WV", agent: "Sarah Smith", arv: "—", status: "Analyzing", color: "#7C3AED", bg: "rgba(124,58,237,0.10)" },
        ].map((row, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 9,
            border: "1px solid #E2E8F0", background: "#fff", marginBottom: 8,
          }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(2,132,199,0.10)", color: SKY_600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Phone size={13} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.addr}</p>
              <p style={{ fontSize: 10, color: MUTED }}>{row.agent} · ARV {row.arv}</p>
            </div>
            <span style={{ padding: "3px 9px", borderRadius: 999, background: row.bg, color: row.color, fontSize: 10, fontWeight: 800 }}>
              {row.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Bot, color: "#0EA5E9", title: "AI call qualification", body: "Gemini grades every recording against your custom rubric. Hot, Warm, Cold, or Disqualified — with the exact reason and timestamps." },
  { icon: Calculator, color: "#10B981", title: "Instant MAO & ARV", body: "Live Zillow value plus AI-estimated repairs auto-calculate your Maximum Allowable Offer." },
  { icon: Headphones, color: "#F59E0B", title: "Built-in call player", body: "Waveform scrubbing, speed control, highlight clips, secure signed-URL playback. No more downloads." },
  { icon: Columns3, color: "#8B5CF6", title: "Handoff brief", body: "A 3-bullet dossier on every Hot lead — personality, pain point, bottom-line price — so closers skip the listen." },
  { icon: Trophy, color: "#EC4899", title: "Live leaderboard", body: "Per-agent target pacing, Hot/Warm/Cold counts, and live bonus estimates keep the floor pushing." },
  { icon: Search, color: "#06B6D4", title: "Omni-search (⌘K)", body: "Find any lead by address, phone, agent, campaign — or words spoken inside the transcript." },
  { icon: Webhook, color: "#3B82F6", title: "Webhook-first ingestion", body: "Connect any dialer or CRM with a single POST. Readymode, BatchDialer, custom — anything works." },
  { icon: BarChart3, color: "#14B8A6", title: "Manager analytics", body: "Daily targets, attainment %, qualified-rate trends. Spot the floor's bottleneck before stand-up." },
  { icon: Users2, color: "#F97316", title: "Team-aware permissions", body: "Owners, managers, QA, trainers, and callers — each role sees only what they need to see." },
];

const WORKFLOW = [
  { step: "01", icon: Phone, title: "Lead arrives", body: "Your dialer posts to RealTrack's webhook with owner, phone, address, and call recording.", color: "#0EA5E9" },
  { step: "02", icon: Sparkles, title: "AI grades it", body: "Gemini listens, qualifies against your rules, calculates ARV/MAO, writes coaching feedback.", color: "#7C3AED" },
  { step: "03", icon: Trophy, title: "Team closes it", body: "Hot leads land in acquisitions with handoff briefs. Managers see floor pace in real time.", color: "#10B981" },
];

const USE_CASES = [
  { role: "Wholesalers", icon: Flame, body: "Stop missing motivated sellers buried under 200 daily calls. Hot leads surface in seconds." },
  { role: "Acquisitions managers", icon: BarChart3, body: "See exactly which agents are pacing for target — and which scripts are converting." },
  { role: "Call center owners", icon: Users2, body: "Multi-tenant, RBAC, audit logs. Run multiple campaigns, multiple dialers, one platform." },
];

const PLANS = [
  { name: "Starter", price: "$350", tag: "Solo wholesalers", feats: ["500 analyses/mo", "1 workspace", "Call player + ARV", "CSV import + export", "Email support"], accent: "#34D399" },
  { name: "Professional", price: "$750", tag: "Growing teams", feats: ["2,000 analyses/mo", "Unlimited campaigns", "Teams & roles", "Leaderboard + pacing", "Webhook export", "Priority support"], accent: "#0EA5E9", featured: true },
  { name: "Enterprise", price: "Custom", tag: "Call floors", feats: ["Unlimited analyses", "Multi-tenant + RBAC", "Custom AI persona", "White-label", "Dedicated manager", "SOC2 / audit logs"], accent: "#A78BFA" },
];

const FAQS = [
  { q: "How long does activation take?", a: "Sign up → upload your payment receipt → we activate within 1–4 business hours. From there, you're sending leads in under 15 minutes." },
  { q: "Do I need a Readymode dialer?", a: "No. RealTrack works with any source that can POST to our webhook — Readymode, BatchDialer, Aircall, Five9, even Zapier. Recordings can be uploaded manually if you prefer." },
  { q: "How is the AI qualifying calls?", a: "Every call is graded against The Four Pillars — Asking Price, Condition, Closing timeline, and Reason — plus four non-negotiable rules (not listed, not under contract, asking below Zillow, residential or vacant lot). Everything beyond that is fully editable per client and per campaign." },
  { q: "Can I cancel anytime?", a: "Yes. Email us anytime to cancel. You keep full access until the end of your current billing period, and you won't be charged on your renewal date." },
];

const INTEGRATIONS = [
  { name: "Readymode", color: "#00E0C6" },
  { name: "BatchDialer", color: "#FF6B35" },
  { name: "Zillow", color: "#006AFF" },
  { name: "Google Drive", color: "#FBBC04" },
  { name: "Gemini AI", color: "#4285F4" },
  { name: "Zapier", color: "#FF4A00" },
  { name: "Webhooks", color: "#10B981" },
  { name: "CSV", color: "#475569" },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  // Logged-in users skip the marketing page and go straight to their dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/dashboard";
    });
  }, []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ background: "#fff", minHeight: "100vh", color: NAVY, overflowX: "clip" }}>

      {/* ── NAV ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? "rgba(255,255,255,0.9)" : "transparent",
        backdropFilter: scrolled ? "saturate(180%) blur(18px)" : "none",
        borderBottom: scrolled ? "1px solid #E2E8F0" : "1px solid transparent",
        transition: "all 380ms cubic-bezier(0.16,1,0.30,1)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none" }}><RealTrackLogo /></Link>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a href="#features" style={navLink}>Features</a>
            <a href="#how" style={navLink}>How it works</a>
            <a href="#pricing" style={navLink}>Pricing</a>
            <Link href="/tutorial" style={navLink}>Tutorial</Link>
            <Link href="/login" style={navLink}>Sign in</Link>
            <Link href="/login" style={{
              marginLeft: 6, padding: "9px 18px", borderRadius: 9,
              background: `linear-gradient(135deg, ${SKY}, ${SKY_600})`, color: "#fff",
              fontSize: 13, fontWeight: 800, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              Get started <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        padding: "140px 28px 80px",
        background: "linear-gradient(180deg, #F0F9FF 0%, #fff 100%)",
        position: "relative", overflow: "hidden",
      }}>
        {/* Decorative blobs */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.15), transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.10), transparent 70%)" }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr", gap: 50, alignItems: "center", position: "relative" }}>
          <div style={{ textAlign: "center", maxWidth: 760, margin: "0 auto" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 999,
              background: "rgba(2,132,199,0.08)", color: SKY_600,
              fontSize: 12, fontWeight: 800, marginBottom: 22,
              border: "1px solid rgba(2,132,199,0.20)",
            }}>
              <Sparkles size={12} /> NEW · Multi-tenant, white-label ready
            </div>
            <h1 style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 22 }}>
              Turn every cold call into a <span style={{ background: `linear-gradient(135deg, ${SKY}, #7C3AED)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>closeable deal.</span>
            </h1>
            <p style={{ fontSize: 19, color: SLATE, lineHeight: 1.55, marginBottom: 34, maxWidth: 620, margin: "0 auto 34px" }}>
              RealTrack listens to every recording, qualifies leads against your rules, calculates ARV/MAO,
              and routes Hot leads to acquisitions — automatically. Built for real estate call centers.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/login" style={{
                padding: "14px 24px", borderRadius: 11,
                background: `linear-gradient(135deg, ${SKY}, ${SKY_600})`, color: "#fff",
                fontSize: 15, fontWeight: 800, textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 7,
                boxShadow: "0 10px 30px rgba(2,132,199,0.35)",
              }}>
                Start with 14-day guarantee <ArrowRight size={15} />
              </Link>
              <Link href="/tutorial" style={{
                padding: "14px 24px", borderRadius: 11,
                background: "#fff", color: NAVY,
                border: "1.5px solid #E2E8F0",
                fontSize: 15, fontWeight: 700, textDecoration: "none",
              }}>
                See how it works
              </Link>
            </div>
            <p style={{ fontSize: 12, color: MUTED, marginTop: 14 }}>
              14-day money-back guarantee · Cancel anytime · No credit card required for signup
            </p>
          </div>

          <div style={{ marginTop: 20 }}>
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ── */}
      <section style={{ padding: "30px 28px", background: "#fff", borderTop: "1px solid #F1F5F9", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 18 }}>
            Trusted by real estate teams like <strong style={{ color: NAVY }}>HMS Realty</strong>
          </p>
          <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 30 }}>
            {[
              { v: "$182k", l: "average deal value" },
              { v: "61%", l: "lead qualification rate" },
              { v: "3.2x", l: "more deals surfaced" },
              { v: "<60s", l: "from call to qualified" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <p style={{ fontSize: 28, fontWeight: 900, background: `linear-gradient(135deg, ${SKY}, ${SKY_600})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.v}</p>
                <p style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding: "100px 28px", background: "#F8FAFC" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: SKY_600, letterSpacing: "0.10em", marginBottom: 10 }}>HOW IT WORKS</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.025em", marginBottom: 14 }}>From call to deal in three steps.</h2>
            <p style={{ fontSize: 16, color: SLATE, maxWidth: 580, margin: "0 auto" }}>
              No manual review. No spreadsheets. Every call is graded, every lead is scored, every agent is coached — automatically.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
            {WORKFLOW.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} style={{
                  background: "#fff", borderRadius: 16, padding: "30px 26px",
                  border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
                  position: "relative",
                }}>
                  <div style={{
                    position: "absolute", top: -16, left: 26,
                    width: 42, height: 42, borderRadius: 11,
                    background: s.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 8px 16px ${s.color}40`,
                  }}>
                    <Icon size={20} />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 900, color: MUTED, letterSpacing: "0.08em", marginTop: 22, marginBottom: 10 }}>STEP {s.step}</p>
                  <h3 style={{ fontSize: 19, fontWeight: 900, marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.65 }}>{s.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FEATURE GRID ── */}
      <section id="features" style={{ padding: "100px 28px", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: SKY_600, letterSpacing: "0.10em", marginBottom: 10 }}>FEATURES</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.025em", marginBottom: 14 }}>Everything an acquisitions floor needs.</h2>
            <p style={{ fontSize: 16, color: SLATE, maxWidth: 580, margin: "0 auto" }}>
              Designed by acquisitions managers. Tested against thousands of real cold calls. Built for high-volume teams.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} style={{
                  padding: "26px 24px", borderRadius: 16,
                  background: "#fff", border: "1px solid #E2E8F0",
                  transition: "all 200ms ease", cursor: "default",
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 11,
                    background: `${f.color}15`, color: f.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 16,
                  }}>
                    <Icon size={20} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 7 }}>{f.title}</h3>
                  <p style={{ fontSize: 13.5, color: SLATE, lineHeight: 1.6 }}>{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS GRID ── */}
      <section style={{ padding: "80px 28px", background: "#F8FAFC", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: SKY_600, letterSpacing: "0.10em", marginBottom: 10 }}>INTEGRATIONS</p>
          <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.025em", marginBottom: 14 }}>Connect anything that can POST.</h2>
          <p style={{ fontSize: 15, color: SLATE, marginBottom: 36, maxWidth: 540, margin: "0 auto 36px" }}>
            Pre-built support for the tools you already use. Plus a generic webhook for everything else.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            {INTEGRATIONS.map((p, i) => (
              <div key={i} style={{
                padding: "20px 18px", borderRadius: 13,
                background: "#fff", border: "1px solid #E2E8F0",
                display: "flex", alignItems: "center", gap: 10,
                justifyContent: "center",
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: p.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>
                  {p.name[0]}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── USE CASES ── */}
      <section style={{ padding: "100px 28px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 50 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: SKY_600, letterSpacing: "0.10em", marginBottom: 10 }}>WHO IT'S FOR</p>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.025em" }}>Built for the way real estate floors actually work.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {USE_CASES.map((u, i) => {
              const Icon = u.icon;
              return (
                <div key={i} style={{
                  padding: "32px 28px", borderRadius: 18,
                  background: "linear-gradient(180deg, #F8FAFC, #fff)",
                  border: "1px solid #E2E8F0",
                }}>
                  <Icon size={28} color={SKY_600} style={{ marginBottom: 14 }} />
                  <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{u.role}</h3>
                  <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.6 }}>{u.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "100px 28px", background: "#F8FAFC" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 50 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: SKY_600, letterSpacing: "0.10em", marginBottom: 10 }}>PRICING</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.025em", marginBottom: 14 }}>Simple, transparent pricing.</h2>
            <p style={{ fontSize: 16, color: SLATE, maxWidth: 560, margin: "0 auto" }}>14-day money-back guarantee on every plan. Cancel anytime.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
            {PLANS.map((p) => (
              <div key={p.name} style={{
                background: "#fff", borderRadius: 18, padding: 30,
                border: p.featured ? `2px solid ${SKY}` : "1px solid #E2E8F0",
                boxShadow: p.featured ? `0 30px 60px rgba(2,132,199,0.18)` : "0 1px 3px rgba(15,23,42,0.04)",
                position: "relative",
                transform: p.featured ? "translateY(-8px)" : "none",
              }}>
                {p.featured && (
                  <div style={{
                    position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                    padding: "4px 12px", borderRadius: 999,
                    background: `linear-gradient(135deg, ${SKY}, ${SKY_600})`, color: "#fff",
                    fontSize: 10, fontWeight: 900, letterSpacing: "0.08em",
                  }}>
                    MOST POPULAR
                  </div>
                )}
                <p style={{ fontSize: 11, fontWeight: 800, color: p.accent, letterSpacing: "0.08em", marginBottom: 6 }}>{p.tag.toUpperCase()}</p>
                <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>{p.name}</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 22 }}>
                  <span style={{ fontSize: 40, fontWeight: 900 }}>{p.price}</span>
                  {p.price !== "Custom" && <span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}>/month</span>}
                </div>
                <Link href="/login" style={{
                  display: "block", textAlign: "center",
                  padding: "11px", borderRadius: 11,
                  background: p.featured ? `linear-gradient(135deg, ${SKY}, ${SKY_600})` : "#fff",
                  color: p.featured ? "#fff" : NAVY,
                  border: p.featured ? "none" : "1px solid #E2E8F0",
                  fontSize: 14, fontWeight: 800, textDecoration: "none",
                  marginBottom: 22,
                }}>
                  {p.price === "Custom" ? "Talk to sales" : "Get started"}
                </Link>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {p.feats.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 10, fontSize: 13.5, color: NAVY }}>
                      <CheckCircle2 size={15} color={p.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: "100px 28px", background: "#fff" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.025em" }}>Common questions.</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FAQS.map((f, i) => (
              <details key={i} style={{
                background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12,
                padding: "16px 20px",
              }}>
                <summary style={{ fontSize: 15, fontWeight: 700, color: NAVY, cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {f.q}
                  <span style={{ color: SKY_600, marginLeft: 12, fontSize: 18 }}>+</span>
                </summary>
                <p style={{ marginTop: 12, fontSize: 14, color: SLATE, lineHeight: 1.65 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── BIG CTA ── */}
      <section style={{ padding: "100px 28px", background: `linear-gradient(135deg, ${NAVY}, #1E293B)`, color: "#fff", textAlign: "center" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 16 }}>
            Ready to stop missing deals?
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", marginBottom: 32, lineHeight: 1.5 }}>
            Activate in under an hour. Send your first leads in 15 minutes. See your first AI-qualified deal today.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/login" style={{
              padding: "15px 28px", borderRadius: 12,
              background: `linear-gradient(135deg, ${SKY}, ${SKY_600})`, color: "#fff",
              fontSize: 15, fontWeight: 800, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 7,
              boxShadow: "0 10px 30px rgba(2,132,199,0.45)",
            }}>
              Start now <ArrowRight size={15} />
            </Link>
            <Link href="/tutorial" style={{
              padding: "15px 28px", borderRadius: 12,
              background: "rgba(255,255,255,0.10)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.20)",
              fontSize: 15, fontWeight: 700, textDecoration: "none",
            }}>
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: NAVY, color: "rgba(255,255,255,0.6)", padding: "50px 28px 30px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 30, marginBottom: 40 }}>
            <div>
              <RealTrackLogo light />
              <p style={{ fontSize: 13, marginTop: 14, lineHeight: 1.55 }}>
                Real estate call intelligence &amp; acquisitions OS.
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.08em", marginBottom: 14 }}>PRODUCT</p>
              <a href="#features" style={{ display: "block", color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: 13.5, marginBottom: 8 }}>Features</a>
              <a href="#pricing" style={{ display: "block", color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: 13.5, marginBottom: 8 }}>Pricing</a>
              <Link href="/tutorial" style={{ display: "block", color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: 13.5, marginBottom: 8 }}>Tutorial</Link>
              <Link href="/login" style={{ display: "block", color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: 13.5 }}>Sign in</Link>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.08em", marginBottom: 14 }}>CONTACT</p>
              <a href="mailto:info@realtrack.app" style={{ display: "block", color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 13.5, marginBottom: 8 }}>info@realtrack.app</a>
              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.55)" }}><ShieldCheck size={12} /> SOC 2 Ready</span>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.55)" }}><Lock size={12} /> AES-256 + TLS 1.3</span>
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 20, fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
            © {new Date().getFullYear()} RealTrack. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
