"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { TutorialBoard } from "@/app/_components/TutorialBoard";
import {
  ArrowRight, Check, Users, Phone, BarChart3, Target,
  Shield, Sparkles, Globe, FileSpreadsheet, Headphones, Award,
  TrendingUp,
} from "lucide-react";

const NAVY = "#1A1A1A";
const NAVY_2 = "#2B2520";
const TEAL = "#C75B39";
const GOLD = "#B0703A";
const SLATE = "#5B5249";

function HMSLogo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  const navy = light ? "#fff" : NAVY;
  const teal = light ? "rgba(255,255,255,0.7)" : TEAL;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size * 0.62} viewBox="0 0 40 24" fill="none">
        <path d="M2 22 L20 4 L38 22" stroke={navy} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M8 22 L20 11 L32 22" stroke={teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9"/>
      </svg>
      <span style={{
        fontSize: size * 0.5, fontWeight: 800, letterSpacing: "0.06em",
        color: light ? "#fff" : NAVY, lineHeight: 1,
      }}>
        RealTrack
      </span>
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh", color: NAVY }}>
      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? "rgba(255,255,255,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? `1px solid rgba(26,26,26,0.08)` : "1px solid transparent",
        transition: "all 400ms cubic-bezier(0.16,1,0.30,1)",
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "18px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <HMSLogo size={28} />
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <a href="#features" style={{ fontSize: 14, fontWeight: 500, color: SLATE, textDecoration: "none" }}>Features</a>
            <a href="#pricing" style={{ fontSize: 14, fontWeight: 500, color: SLATE, textDecoration: "none" }}>Pricing</a>
            <a href="#how" style={{ fontSize: 14, fontWeight: 500, color: SLATE, textDecoration: "none" }}>How it works</a>
            <a href="#tutorial" style={{ fontSize: 14, fontWeight: 500, color: SLATE, textDecoration: "none" }}>Tutorial</a>
            <Link href="/" style={{ fontSize: 14, fontWeight: 500, color: SLATE, textDecoration: "none" }}>Sign in</Link>
            <Link href="/" style={{
              padding: "10px 20px", borderRadius: 10, background: NAVY,
              color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none",
              boxShadow: "0 4px 14px rgba(26,26,26,0.25)",
            }}>
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: "relative", padding: "140px 32px 80px",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FAF8F4 60%, #FFFFFF 100%)",
        overflow: "hidden",
      }}>
        <div className="animate-float" style={{
          position: "absolute", top: "10%", right: "8%",
          width: 380, height: 380, borderRadius: "50%",
          background: `radial-gradient(circle, ${TEAL}22 0%, transparent 70%)`,
          filter: "blur(40px)", pointerEvents: "none",
        }} />
        <div className="animate-float" style={{
          position: "absolute", bottom: "10%", left: "6%",
          width: 320, height: 320, borderRadius: "50%",
          background: `radial-gradient(circle, ${NAVY}18 0%, transparent 70%)`,
          filter: "blur(40px)", pointerEvents: "none", animationDelay: "1s",
        }} />

        <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", textAlign: "center" }} className="animate-in">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 999,
            background: "#fff", border: `1px solid rgba(26,26,26,0.10)`,
            boxShadow: "0 4px 16px rgba(26,26,26,0.06)", marginBottom: 28,
          }}>
            <Sparkles size={13} color={TEAL} />
            <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
              Built for high-volume outbound real estate teams
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(40px, 6vw, 76px)", fontWeight: 900,
            color: NAVY, lineHeight: 1.05, letterSpacing: "-0.03em",
            marginBottom: 24,
          }}>
            The outbound platform that<br />
            <span style={{
              background: `linear-gradient(135deg, ${TEAL} 0%, ${NAVY} 100%)`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              scales your revenue.
            </span>
          </h1>

          <p style={{
            fontSize: 19, color: SLATE, lineHeight: 1.6,
            maxWidth: 720, margin: "0 auto 40px",
          }}>
            End-to-end automation, team management, and conversation analytics for
            outbound real estate operations. Built for managers who run teams of cold
            callers — not solo dialers.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "16px 28px", borderRadius: 12,
              background: NAVY, color: "#fff",
              fontSize: 15, fontWeight: 700, textDecoration: "none",
              boxShadow: "0 8px 24px rgba(26,26,26,0.30)",
            }}>
              Start free trial <ArrowRight size={16} />
            </Link>
            <a href="#how" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "16px 28px", borderRadius: 12,
              background: "#fff", color: NAVY,
              border: "1px solid rgba(26,26,26,0.12)",
              fontSize: 15, fontWeight: 600, textDecoration: "none",
              boxShadow: "0 4px 12px rgba(26,26,26,0.06)",
            }}>
              See it in action
            </a>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24,
            marginTop: 80, padding: "32px 40px", background: "#fff",
            borderRadius: 18, border: "1px solid rgba(26,26,26,0.08)",
            boxShadow: "0 12px 40px rgba(26,26,26,0.06)",
          }}>
            {[
              { v: "3.4×", l: "Conversion lift" },
              { v: "62%", l: "Less manual entry" },
              { v: "24/7", l: "Lead processing" },
              { v: "100%", l: "Call quality coverage" },
            ].map(s => (
              <div key={s.l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em" }}>{s.v}</div>
                <div style={{ fontSize: 12, color: SLATE, marginTop: 4, fontWeight: 500 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "100px 32px", background: "#FAF8F4" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: TEAL, letterSpacing: "0.12em", marginBottom: 12 }}>
              THE PLATFORM
            </p>
            <h2 style={{ fontSize: 44, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", marginBottom: 16 }}>
              Run every outbound function from one place.
            </h2>
            <p style={{ fontSize: 17, color: SLATE, maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
              Submission intake, cold caller dashboards, team rollups, trainer portal — all
              of it, unified.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {[
              { i: Globe, t: "Global Lead Intake", d: "Shareable URL accepts submissions from anywhere. Background processing kicks off instantly." },
              { i: Phone, t: "Caller Dashboards", d: "Connect rate, conversion rate, talk ratios — every KPI per agent, mathematically tight." },
              { i: Target, t: "Auto Qualifiers", d: "Budget, authority, need and timeline captured straight from the conversation. Zero note-taking." },
              { i: Users, t: "Team Rollups", d: "Manager portals aggregate every caller. Compare performance side-by-side with visual analytics." },
              { i: FileSpreadsheet, t: "CSV Onboarding", d: "Upload Manager/Agent/Team/Trainer/Hiring — dashboards auto-provision in seconds." },
              { i: TrendingUp, t: "Smart Follow-Ups", d: "\"Call me back in 2 months\" auto-flagged. Nothing warm slips through." },
              { i: Headphones, t: "Trainer Portal", d: "Material hub, coaching logs, roleplay dialer. Test calls scored with timestamps." },
              { i: BarChart3, t: "Conversation Analytics", d: "Talk-to-listen ratio, monologue duration, micro-agreements — correlated to closing rate." },
              { i: Shield, t: "Compliance Coverage", d: "Every call processed, graded, and archived for review. Audit-ready by default." },
            ].map(({ i: Icon, t, d }) => (
              <div key={t} style={{
                padding: 28, background: "#fff", borderRadius: 16,
                border: "1px solid rgba(26,26,26,0.08)",
                transition: "all 300ms cubic-bezier(0.16,1,0.30,1)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "0 16px 40px rgba(26,26,26,0.12)";
                e.currentTarget.style.borderColor = TEAL;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "rgba(26,26,26,0.08)";
              }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 16,
                }}>
                  <Icon size={20} color="#fff" strokeWidth={2} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{t}</h3>
                <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.6 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: "100px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: TEAL, letterSpacing: "0.12em", marginBottom: 12 }}>
              HOW IT WORKS
            </p>
            <h2 style={{ fontSize: 44, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em" }}>
              Three steps to a fully running outbound floor.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
            {[
              { n: "01", t: "Upload your team", d: "Drop a CSV with Manager, Agent, Team, Trainer, Hiring Date. Accounts provision instantly. Dashboards populate. Submission form syncs." },
              { n: "02", t: "Share the link", d: "Send the public submission URL to your callers. Anyone, anywhere submits leads with caller selection, campaign tagging, and optional call upload." },
              { n: "03", t: "Run the floor", d: "Manager dashboards roll up KPIs in real time. Trainers coach. The platform captures qualifiers, flags follow-ups, and scores every call." },
            ].map(s => (
              <div key={s.n}>
                <div style={{
                  fontSize: 64, fontWeight: 900, color: TEAL,
                  letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 16, opacity: 0.18,
                }}>
                  {s.n}
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 12 }}>{s.t}</h3>
                <p style={{ fontSize: 15, color: SLATE, lineHeight: 1.7 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TUTORIAL */}
      <section id="tutorial" style={{ padding: "100px 32px", background: "#FAF8F4" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: TEAL, letterSpacing: "0.12em", marginBottom: 12 }}>TUTORIAL</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", marginBottom: 14 }}>
              Learn RealTrack in minutes
            </h2>
            <p style={{ fontSize: 17, color: SLATE, maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
              Short walkthroughs for every part of the platform — from onboarding your team to reading the verdict on a lead.
            </p>
          </div>

          <TutorialBoard />
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{
        padding: "100px 32px",
        background: `linear-gradient(180deg, #FAF8F4 0%, #FFFFFF 100%)`,
      }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: TEAL, letterSpacing: "0.12em", marginBottom: 12 }}>
              PRICING
            </p>
            <h2 style={{ fontSize: 44, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", marginBottom: 16 }}>
              Two tiers. Pick your scale.
            </h2>
            <p style={{ fontSize: 17, color: SLATE }}>
              No per-seat games. Flat pricing that scales with your operation.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Professional */}
            <div style={{
              padding: 36, background: "#fff", borderRadius: 20,
              border: "1px solid rgba(26,26,26,0.10)",
              boxShadow: "0 8px 24px rgba(26,26,26,0.06)",
            }}>
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: SLATE, letterSpacing: "0.1em", marginBottom: 8 }}>PROFESSIONAL</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em" }}>$250</span>
                  <span style={{ fontSize: 15, color: SLATE }}>/month</span>
                </div>
                <p style={{ fontSize: 14, color: SLATE, marginTop: 8 }}>For growing outbound teams.</p>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "7 active campaigns",
                  "Unlimited cold callers",
                  "Standard KPI dashboards",
                  "Team & manager management",
                  "CSV onboarding",
                  "Public lead submission form",
                  "Conversation analytics",
                  "Auto qualifiers",
                ].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: NAVY }}>
                    <Check size={15} color={TEAL} strokeWidth={3} /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/" style={{
                display: "block", textAlign: "center", padding: "13px 20px",
                borderRadius: 11, background: "#fff", color: NAVY,
                border: `1.5px solid ${NAVY}`, fontSize: 14, fontWeight: 700,
                textDecoration: "none",
              }}>
                Start Professional
              </Link>
            </div>

            {/* Enterprise */}
            <div style={{
              padding: 36, background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
              borderRadius: 20, color: "#fff", position: "relative", overflow: "hidden",
              boxShadow: "0 24px 60px rgba(26,26,26,0.30)",
            }}>
              <div style={{
                position: "absolute", top: 24, right: 24,
                padding: "6px 12px", borderRadius: 999,
                background: GOLD, color: NAVY,
                fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
              }}>
                <Award size={11} style={{ display: "inline", marginRight: 4, marginBottom: -1 }} />
                PREMIUM
              </div>

              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: "0.1em", marginBottom: 8 }}>ENTERPRISE</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>$700</span>
                  <span style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}>/month</span>
                </div>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 8 }}>For full-scale operations.</p>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Unlimited campaigns",
                  "Everything in Professional",
                  "Advanced Trainer Portal",
                  "Internal roleplay dialer (WebRTC)",
                  "Organizational tracking & rollups",
                  "Advanced analytics & visualizations",
                  "Smart follow-up flagging",
                  "Call upload & grading at scale",
                  "Priority onboarding & support",
                ].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#fff" }}>
                    <Check size={15} color={GOLD} strokeWidth={3} /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/" style={{
                display: "block", textAlign: "center", padding: "13px 20px",
                borderRadius: 11, background: GOLD, color: NAVY,
                fontSize: 14, fontWeight: 800, textDecoration: "none",
                boxShadow: "0 8px 24px rgba(200,162,75,0.40)",
              }}>
                Start Enterprise
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "100px 32px", background: "#fff" }}>
        <div style={{
          maxWidth: 1000, margin: "0 auto",
          padding: "64px 48px", borderRadius: 24,
          background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
          textAlign: "center", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: "-30%", right: "-10%",
            width: 400, height: 400, borderRadius: "50%",
            background: `radial-gradient(circle, ${TEAL}40 0%, transparent 70%)`,
            filter: "blur(20px)",
          }} />
          <h2 style={{
            fontSize: 42, fontWeight: 900, color: "#fff",
            letterSpacing: "-0.02em", marginBottom: 16, position: "relative",
          }}>
            Stop running outbound on spreadsheets.
          </h2>
          <p style={{
            fontSize: 17, color: "rgba(255,255,255,0.8)",
            maxWidth: 560, margin: "0 auto 32px", lineHeight: 1.6,
            position: "relative",
          }}>
            Get every caller, manager, and trainer on one platform. See the difference
            in your first week.
          </p>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "16px 32px", borderRadius: 12,
            background: GOLD, color: NAVY,
            fontSize: 15, fontWeight: 800, textDecoration: "none",
            boxShadow: "0 12px 32px rgba(200,162,75,0.40)",
            position: "relative",
          }}>
            Get started — free trial <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        padding: "40px 32px", background: NAVY, color: "rgba(255,255,255,0.7)",
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
        }}>
          <HMSLogo size={26} light />
          <p style={{ fontSize: 13 }}>© 2026 RealTrack. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
