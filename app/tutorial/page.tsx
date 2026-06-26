"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Server, Webhook, Phone, Bot, BarChart3, Trophy, Settings, Mail, Key, Database } from "lucide-react";

const STEPS = [
  {
    icon: Mail,
    title: "1. Sign up & get approved",
    body: "Create your account with any email at realtrack.app. You'll land on the pending page until your payment is verified and an admin activates your access (typically 1–4 business hours).",
  },
  {
    icon: Key,
    title: "2. Add your Gemini API key",
    body: "RealTrack uses Google's Gemini AI to grade calls. Get a free key from aistudio.google.com/apikey, then paste it under Settings → API → Gemini API Key Pool. You can add multiple — the system rotates between them automatically if one hits rate limits.",
  },
  {
    icon: Server,
    title: "3. Connect your dialer (optional)",
    body: "If you use Readymode, add your admin credentials under Settings → API → Readymode Dialers. We'll automatically pull call recordings for every lead. Skip this step if you'll send leads via webhook only, or upload recordings manually.",
  },
  {
    icon: Webhook,
    title: "4. Create your first campaign",
    body: "Go to Campaigns → New Campaign. Give it a name (matching your dialer's campaign name) and write qualification rules — one per line. These are the criteria the AI uses to grade calls in this campaign.",
  },
  {
    icon: Phone,
    title: "5. Send leads to RealTrack",
    body: "Point your dialer's outbound webhook at https://realtrack.app/api/inbound/lead?key=YOUR_API_KEY. Include address, phone, owner name, agent name, and campaign. We accept lead-only posts (no audio) or full posts with recording URLs.",
  },
  {
    icon: Bot,
    title: "6. Watch leads flow in",
    body: "Every new lead lands in your Call Library. If a recording is attached, the AI starts analysis automatically — qualifying as Hot, Warm, Cold, or Disqualified, with a written reason and timestamps.",
  },
  {
    icon: BarChart3,
    title: "7. Review & coach",
    body: "Click any lead to see the AI's full breakdown — qualification reasoning, ARV/MAO calculations, coaching feedback for the agent, and a handoff brief for closers. Use it to improve scripts and pacing.",
  },
  {
    icon: Trophy,
    title: "8. Track performance",
    body: "The Leaderboard shows every agent's hot/warm/cold counts vs their daily target, plus a live bonus estimate. Use it in your daily huddle to drive the floor.",
  },
];

const FAQS = [
  {
    q: "Do I need a Readymode dialer to use RealTrack?",
    a: "No. RealTrack works with any source that can POST to our webhook — Readymode, BatchDialer, Aircall, Five9, even a Zapier hookup. Recordings can be attached via URL or uploaded manually.",
  },
  {
    q: "How is the AI qualifying calls?",
    a: "Every call is evaluated against The Four Pillars: Asking Price, Condition, Closing timeline, and Reason for selling. Plus non-negotiable rules: not listed with a realtor, not under contract, asking below Zillow, and residential or vacant lot only. The rest of the persona is fully editable under Dashboard → Persona, and you can override it per campaign.",
  },
  {
    q: "What happens if a call has no recording?",
    a: "The lead lands in Needs Call status. You can manually upload audio later from the lead detail page, or have your dialer post a second webhook with the recording URL after the call ends.",
  },
  {
    q: "Can I export my data?",
    a: "Yes — every Call Library view has CSV export. Per-lead JSON export is available from the detail page. Full account data export available on request via info@realtrack.app.",
  },
  {
    q: "Can I add sub-users / team members?",
    a: "Yes. Go to Floor Agents → Add Agent to register a caller, then click Invite to send them a login. Sub-users see only their own dashboard (their leads, their hours, their stats).",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Email info@realtrack.app any time. We'll confirm within 24 hours. You keep full access until the end of your current billing period — there will be no further charges on your renewal date.",
  },
];

export default function TutorialPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0E", color: "#F4F4FF" }}>
      <nav style={{ borderBottom: "1px solid #22222c", padding: "16px 28px", background: "#0A0A0E", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#9A9AB0", fontWeight: 700, textDecoration: "none" }}>
            <ArrowLeft size={14} /> Back to RealTrack
          </Link>
          <Link href="/login" style={{
            padding: "8px 16px", borderRadius: 9,
            background: "linear-gradient(135deg,#3B82F6,#2563EB)", color: "#fff",
            fontSize: 13, fontWeight: 800, textDecoration: "none",
          }}>
            Sign in →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "64px 28px 40px", textAlign: "center" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 999,
            background: "rgba(10,95,82,0.08)", color: "#2563EB",
            fontSize: 12, fontWeight: 800, marginBottom: 14,
          }}>
            <Sparkles size={12} /> GETTING STARTED
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.025em", marginBottom: 14 }}>
            From signup to qualified leads in 15 minutes.
          </h1>
          <p style={{ fontSize: 17, color: "#9A9AB0", lineHeight: 1.6 }}>
            Follow these eight steps to get RealTrack fully operational — from your first signup
            through to your first AI-qualified lead landing in your Call Library.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "20px 28px 60px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} style={{
                display: "flex", gap: 18, padding: "20px 22px",
                background: "#0A0A0E", border: "1px solid #22222c", borderRadius: 14,
                boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                  background: "linear-gradient(135deg,#3B82F6,#2563EB)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, color: "#F4F4FF" }}>{s.title}</h3>
                  <p style={{ fontSize: 14.5, color: "#9A9AB0", lineHeight: 1.65 }}>{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Webhook reference */}
      <section style={{ background: "#101018", padding: "60px 28px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8, letterSpacing: "-0.02em" }}>Webhook reference</h2>
          <p style={{ fontSize: 14.5, color: "#9A9AB0", marginBottom: 22 }}>
            Send leads to RealTrack with a single HTTP POST. Works with any dialer, CRM, or no-code tool.
          </p>

          <div style={{ background: "#0A0A0E", borderRadius: 12, padding: "18px 22px", overflowX: "auto", fontFamily: "ui-monospace, SF Mono, Consolas, monospace", fontSize: 12.5, color: "#22222c", lineHeight: 1.7 }}>
            <div style={{ color: "#93C5FD" }}>POST <span style={{ color: "#FCD34D" }}>https://realtrack.app/api/inbound/lead?key=YOUR_API_KEY</span></div>
            <div style={{ color: "#94A3B8" }}>Content-Type: application/json</div>
            <div style={{ color: "#94A3B8" }}>Authorization: Bearer YOUR_API_KEY</div>
            <div style={{ height: 8 }} />
            <div>{`{`}</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>address</span>&quot;: &quot;123 Main St&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>city</span>&quot;: &quot;Dallas&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>state</span>&quot;: &quot;TX&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>zip</span>&quot;: &quot;75201&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>firstName</span>&quot;: &quot;John&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>lastName</span>&quot;: &quot;Doe&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>phone</span>&quot;: &quot;5551234567&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>campaign</span>&quot;: &quot;Motivated Sellers&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>agent_name</span>&quot;: &quot;Sarah Smith&quot;,</div>
            <div>  &quot;<span style={{ color: "#7DD3FC" }}>recording_url</span>&quot;: &quot;https://...&quot;  <span style={{ color: "#9A9AB0" }}>// optional</span></div>
            <div>{`}`}</div>
          </div>

          <p style={{ fontSize: 12.5, color: "#9A9AB0", marginTop: 14 }}>
            Get your API key under <strong>Settings → API → API Keys</strong>. Webhook accepts JSON, form-urlencoded, or
            Readymode&apos;s <code style={{ background: "#22222c", padding: "1px 5px", borderRadius: 4 }}>lead[0][field]</code> format.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "60px 28px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 24, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQS.map((f, i) => (
            <details key={i} style={{
              background: "#0A0A0E", border: "1px solid #22222c", borderRadius: 11,
              padding: "14px 18px",
            }}>
              <summary style={{ fontSize: 15, fontWeight: 700, color: "#F4F4FF", cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {f.q}
                <span style={{ color: "#2563EB", marginLeft: 12 }}>+</span>
              </summary>
              <p style={{ marginTop: 10, fontSize: 14, color: "#9A9AB0", lineHeight: 1.65 }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "linear-gradient(180deg, #0A0A0E, #1B1B24)", color: "#fff", padding: "60px 28px", textAlign: "center" }}>
        <h2 style={{ fontSize: 30, fontWeight: 900, marginBottom: 12, letterSpacing: "-0.02em" }}>Ready to start?</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 26 }}>14-day money-back guarantee. Cancel anytime.</p>
        <Link href="/login?tab=signup" style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "14px 28px", borderRadius: 12,
          background: "linear-gradient(135deg,#3B82F6,#2563EB)", color: "#fff",
          fontSize: 15, fontWeight: 800, textDecoration: "none",
          boxShadow: "0 10px 30px rgba(10,95,82,0.40)",
        }}>
          Get started <ArrowRight size={16} />
        </Link>
      </section>

      <footer style={{ background: "#0B0F1F", color: "rgba(255,255,255,0.6)", padding: "30px 28px", textAlign: "center", fontSize: 12 }}>
        <a href="mailto:info@realtrack.app" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>info@realtrack.app</a>
        <div style={{ marginTop: 6 }}>© {new Date().getFullYear()} RealTrack.</div>
      </footer>
    </div>
  );
}
