"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  ArrowRight, Check, Phone, BarChart3, Sparkles, ShieldCheck, Cookie, Lock,
  Flame, Sun, Snowflake, Headphones, Bot, Calculator, Search, Trophy,
  Columns3, FileText, Star,
} from "lucide-react";
import { T } from "@/app/_components/tokens";
import { supabase } from "@/lib/supabase";

const GRAD = "linear-gradient(135deg, #F2266F 0%, #7C3AED 100%)";

function RealTrackLogo({ light = false }: { light?: boolean }) {
  const stroke = light ? "#fff" : "#0B0F1F";
  const stroke2 = light ? "rgba(255,255,255,0.55)" : "rgba(11,15,31,0.5)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={34} height={22} viewBox="0 0 40 24" fill="none">
        <path d="M2 22 L20 4 L38 22" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 22 L20 11 L32 22" stroke={stroke2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.04em", color: light ? "#fff" : "#0B0F1F" }}>RealTrack</span>
    </div>
  );
}

const FEATURES = [
  { icon: Bot, title: "AI call qualification", body: "Every recording graded against your custom persona and Kill List — Hot, Warm, Cold, or disqualified, with the exact reason." },
  { icon: Calculator, title: "Instant MAO & ARV", body: "Live Zillow value + AI-estimated repairs auto-calculate your Maximum Allowable Offer and a one-click offer PDF." },
  { icon: Headphones, title: "Gong-style call player", body: "Waveform scrubbing, speed control, highlight reels, and secure signed-URL playback for every recording." },
  { icon: Columns3, title: "AI Handoff Brief", body: "A 3-bullet intel dossier — seller personality, pain point, bottom-line price — so closers skip the full re-listen." },
  { icon: Trophy, title: "Competitive leaderboard", body: "Target pacing, glowing Hot/Warm/Cold pills, and live bonus estimates keep the floor pushing." },
  { icon: Search, title: "Omni-search (⌘K)", body: "Find any lead by address, phone, agent, or words spoken inside the AI transcript — instantly." },
];

const STEPS = [
  { n: "01", title: "Submit the lead", body: "Callers log the owner + address. Property data and ARV are fetched automatically." },
  { n: "02", title: "AI reviews the call", body: "Gemini listens to every recording, qualifies the lead, and writes coaching feedback." },
  { n: "03", title: "Close & coach", body: "Acquisitions get a handoff brief; managers see objections and pace across the floor." },
];

const PLANS = [
  { name: "Starter", price: "$350", tag: "Solo wholesalers", feats: ["500 analyses/mo", "1 workspace", "Call player + ARV", "CSV import", "Email support"], accent: "#34D399" },
  { name: "Professional", price: "$750", tag: "Growing teams", feats: ["2,000 analyses/mo", "Unlimited campaigns", "Teams & roles", "Leaderboard + pacing", "Webhook export", "Priority support"], accent: "#F2266F", featured: true },
  { name: "Enterprise", price: "Custom", tag: "Call floors", feats: ["Unlimited analyses", "Multi-tenant + RBAC", "Custom AI persona", "SOC2 / audit logs", "Dedicated manager"], accent: "#A78BFA" },
];

const BADGES = [
  { icon: ShieldCheck, label: "SOC 2 Type II" },
  { icon: Cookie, label: "GDPR Ready" },
  { icon: Lock, label: "AES-256 + TLS 1.3" },
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
    <div style={{ background: "var(--canvas)", minHeight: "100vh", color: "var(--text-1)", overflowX: "clip" }}>
      {/* ── NAV ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? "color-mix(in srgb, var(--surface-1) 80%, transparent)" : "transparent",
        backdropFilter: scrolled ? "saturate(180%) blur(18px)" : "none",
        borderBottom: scrolled ? "1px solid var(--border-2)" : "1px solid transparent",
        transition: "all 380ms cubic-bezier(0.16,1,0.30,1)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none" }}><RealTrackLogo /></Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="#features" style={navLink}>Features</a>
            <a href="#how" style={navLink}>How it works</a>
            <a href="#pricing" style={navLink}>Pricing</a>
            <Link href="/tutorial" style={navLink}>Tutorial</Link>
            <Link href="/login" style={navLink}>Sign in</Link>
            <Link href="/login" className="btn-brand" style={{ padding: "9px 18px" }}>Get started <ArrowRight size={14} /></Link>
          </div>
        </div>
      </nav>

      {/* ── HERO (midnight) ── */}
      <header style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(180deg, #0B0F1F 0%, #0D1228 60%, #11162A 100%)",
        color: "#fff", padding: "150px 28px 110px",
      }}>
        {/* glow orbs */}
        <div style={{ position: "absolute", top: -120, left: "12%", width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(242,38,111,0.30), transparent 70%)", filter: "blur(20px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -160, right: "8%", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.28), transparent 70%)", filter: "blur(20px)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 980, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
            <Sparkles size={13} color="#FF4F92" /> AI revenue intelligence for real-estate wholesalers
          </span>
          <h1 style={{ fontSize: "clamp(40px, 6vw, 68px)", fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.03em", margin: "22px 0 0" }}>
            Turn every cold call<br />into a <span style={{ background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>closeable deal.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(255,255,255,0.72)", maxWidth: 640, margin: "22px auto 0" }}>
            RealTrack listens to your calls, qualifies leads against the Zillow value, calculates the offer,
            and coaches your floor — so acquisitions only ever touch deals worth closing.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
            <Link href="/login" className="btn-brand" style={{ padding: "14px 26px", fontSize: 15 }}>Start free <ArrowRight size={16} /></Link>
            <a href="#how" style={{ ...heroGhost }}>See how it works</a>
          </div>
          {/* trust row */}
          <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 30, flexWrap: "wrap", opacity: 0.8 }}>
            {BADGES.map((b) => { const I = b.icon; return (
              <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}><I size={13} color="#FF4F92" /> {b.label}</span>
            ); })}
          </div>
        </div>

        {/* floating verdict mock */}
        <div className="reveal" style={{ maxWidth: 880, margin: "56px auto 0", position: "relative" }}>
          <div className="glass-dark" style={{ borderRadius: 20, padding: 18, boxShadow: "0 40px 90px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { icon: Flame, label: "Hot", val: "$182k", sub: "≤70% of $265k", c: "#F2266F" },
                { icon: Sun, label: "Warm", val: "$228k", sub: "motivated · 86%", c: "#F59E0B" },
                { icon: Snowflake, label: "Cold", val: "$0", sub: "price fishing", c: "#0284C7" },
                { icon: BarChart3, label: "Qual rate", val: "61%", sub: "this week", c: "#34D399" },
              ].map((k) => { const I = k.icon; return (
                <div key={k.label} style={{ flex: "1 1 160px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: k.c, textTransform: "uppercase" }}><I size={12} /> {k.label}</span>
                  <p style={{ fontSize: 26, fontWeight: 900, marginTop: 8, color: "#fff" }}>{k.val}</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{k.sub}</p>
                </div>
              ); })}
            </div>
          </div>
        </div>
      </header>

      {/* ── LOGOS / stat band ── */}
      <section style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--border-1)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "34px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 20, textAlign: "center" }}>
          {[["3.2x", "more deals surfaced"], ["–40%", "time per lead"], ["100%", "calls QA'd"], ["<2s", "to a verdict"]].map(([v, l]) => (
            <div key={l}>
              <p style={{ fontSize: 30, fontWeight: 900, background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{v}</p>
              <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ maxWidth: 1160, margin: "0 auto", padding: "90px 28px 30px" }}>
        <div className="reveal" style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={pill}>The platform</p>
          <h2 style={h2}>Everything an acquisitions floor needs</h2>
          <p style={lead}>From the first dial to the signed contract — qualified, calculated, and coached by AI.</p>
        </div>
        <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
          {FEATURES.map((f) => { const I = f.icon; return (
            <div key={f.title} style={card}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--border-brand)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "var(--border-2)"; }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 24px rgba(242,38,111,0.30)" }}>
                <I size={20} color="#fff" />
              </span>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 16, color: "var(--text-1)" }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, marginTop: 8 }}>{f.body}</p>
            </div>
          ); })}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 28px" }}>
        <div className="reveal" style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={pill}>How it works</p>
          <h2 style={h2}>Live in minutes, not months</h2>
        </div>
        <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ ...card, position: "relative" }}>
              <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", opacity: 0.9 }}>{s.n}</span>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 8, color: "var(--text-1)" }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, marginTop: 8 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ background: "var(--surface-1)", borderTop: "1px solid var(--border-1)", borderBottom: "1px solid var(--border-1)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "84px 28px" }}>
          <div className="reveal" style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={pill}>Pricing</p>
            <h2 style={h2}>Plans that scale with your floor</h2>
          </div>
          <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, alignItems: "stretch" }}>
            {PLANS.map((p) => (
              <div key={p.name} style={{
                background: p.featured ? "linear-gradient(180deg,#0B0F1F,#1A2140)" : "var(--surface-1)",
                color: p.featured ? "#fff" : "var(--text-1)",
                border: p.featured ? "1px solid rgba(242,38,111,0.4)" : "1px solid var(--border-2)",
                borderRadius: 20, padding: 26, position: "relative",
                boxShadow: p.featured ? "0 24px 60px rgba(242,38,111,0.22)" : "var(--shadow-md)",
                display: "flex", flexDirection: "column",
              }}>
                {p.featured && <span style={{ position: "absolute", top: 16, right: 16, padding: "3px 10px", borderRadius: 999, background: GRAD, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em" }}>POPULAR</span>}
                <p style={{ fontSize: 13, fontWeight: 700, color: p.accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.name}</p>
                <p style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{p.tag}</p>
                <p style={{ fontSize: 40, fontWeight: 900, marginTop: 14, letterSpacing: "-0.02em" }}>{p.price}<span style={{ fontSize: 14, fontWeight: 600, opacity: 0.6 }}>{p.price !== "Custom" ? "/mo" : ""}</span></p>
                <ul style={{ listStyle: "none", padding: 0, margin: "18px 0 22px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {p.feats.map((f) => (
                    <li key={f} style={{ display: "flex", gap: 9, fontSize: 13.5, alignItems: "center" }}>
                      <Check size={15} color={p.accent} /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={p.featured ? "btn-brand" : "btn-ghost"} style={{ justifyContent: "center", padding: "12px" }}>
                  {p.price === "Custom" ? "Talk to sales" : "Start free"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "90px 28px" }}>
        <div className="reveal" style={{
          borderRadius: 28, padding: "56px 40px", textAlign: "center",
          background: "linear-gradient(135deg,#0B0F1F,#1A2140)", color: "#fff",
          border: "1px solid rgba(242,38,111,0.3)", position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -100, right: -60, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(242,38,111,0.35), transparent 70%)", filter: "blur(10px)" }} />
          <h2 style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 900, letterSpacing: "-0.02em", position: "relative" }}>Stop guessing which leads to chase.</h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.72)", maxWidth: 540, margin: "14px auto 0", position: "relative" }}>
            Join the floors closing more with less effort. Set up your workspace in under 5 minutes.
          </p>
          <Link href="/login" className="btn-brand" style={{ marginTop: 28, padding: "14px 28px", fontSize: 15, position: "relative" }}>Get started free <ArrowRight size={16} /></Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#0B0F1F", color: "rgba(255,255,255,0.6)", padding: "40px 28px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
          <RealTrackLogo light />
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12 }}>
            {BADGES.map((b) => { const I = b.icon; return (
              <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><I size={13} color="#FF4F92" /> {b.label}</span>
            ); })}
          </div>
          <div style={{ fontSize: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <a href="mailto:info@realtrack.app" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>info@realtrack.app</a>
            <Link href="/tutorial" style={{ color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Tutorial</Link>
            <Link href="/terms" style={{ color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Terms</Link>
            <Link href="/privacy" style={{ color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Privacy</Link>
            <Link href="/refund" style={{ color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Refund</Link>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>© {new Date().getFullYear()} RealTrack. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const navLink: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "var(--text-2)", textDecoration: "none", padding: "8px 12px" };
const heroGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none" };
const pill: React.CSSProperties = { display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "var(--magenta-dim)", color: "var(--magenta)", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 };
const h2: React.CSSProperties = { fontSize: "clamp(28px,4vw,40px)", fontWeight: 900, letterSpacing: "-0.025em", color: "var(--text-1)" };
const lead: React.CSSProperties = { fontSize: 16, color: "var(--text-2)", maxWidth: 560, margin: "12px auto 0", lineHeight: 1.6 };
const card: React.CSSProperties = { background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-sm)", transition: "all 220ms cubic-bezier(0.16,1,0.30,1)" };
