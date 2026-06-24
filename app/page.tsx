"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/* ════════════════════════════════════════════════════════════════════════
   RealTrack landing — Resona editorial system (deep pine · teal · coral ·
   amber on cool paper). All styles are scoped under `.rzn` so nothing leaks
   into the dashboard. Fonts resolve to the app's CSS variables:
   --font-display = Bricolage Grotesque · --font-sans = Hanken Grotesk ·
   --font-mono = Space Mono.
════════════════════════════════════════════════════════════════════════ */

const CSS = `
.rzn{
  --ink:#15302e; --ink-soft:#2c4642; --paper:#f3f4f1; --paper-2:#eceee9;
  --card:#fbfbf9; --teal:#0e7c6b; --teal-deep:#0a5f52; --coral:#ef5f3b;
  --amber:#e3a23a; --slate:#5c6b66; --line:#d9ddd6; --line-soft:#e6e8e3;
  --shadow:0 1px 2px rgba(21,48,46,.06), 0 12px 32px -12px rgba(21,48,46,.18);
  --radius:14px;
  background:var(--paper); color:var(--ink);
  font-family:var(--font-sans),"Hanken Grotesk",system-ui,sans-serif;
  font-size:17px; line-height:1.55; -webkit-font-smoothing:antialiased;
}
.rzn *{box-sizing:border-box;margin:0;padding:0}
.rzn a{color:inherit;text-decoration:none}
.rzn ::selection{background:var(--teal);color:#fff}
.rzn .wrap{max-width:1180px;margin:0 auto;padding:0 28px}
.rzn h1,.rzn h2,.rzn h3,.rzn .display{font-family:var(--font-display),"Bricolage Grotesque",serif;font-weight:700;line-height:1.04;letter-spacing:-.02em;color:var(--ink)}
.rzn .mono{font-family:var(--font-mono),"Space Mono",monospace}

/* NAV */
.rzn nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(10px);
  background:rgba(243,244,241,.82);border-bottom:1px solid var(--line)}
.rzn .nav-inner{display:flex;align-items:center;justify-content:space-between;height:68px}
.rzn .brand{display:flex;align-items:center;gap:10px;font-family:var(--font-display),"Bricolage Grotesque",serif;font-weight:700;font-size:22px;letter-spacing:-.02em}
.rzn .brand-mark{display:flex;align-items:flex-end;gap:2.5px;height:22px}
.rzn .brand-mark i{width:3px;border-radius:2px;background:var(--teal);display:block}
.rzn .brand-mark i:nth-child(1){height:8px}
.rzn .brand-mark i:nth-child(2){height:18px;background:var(--coral)}
.rzn .brand-mark i:nth-child(3){height:13px;background:var(--amber)}
.rzn .brand-mark i:nth-child(4){height:22px}
.rzn .nav-links{display:flex;gap:30px;align-items:center}
.rzn .nav-links a{font-size:15px;color:var(--ink-soft);font-weight:500;transition:color .2s}
.rzn .nav-links a:hover{color:var(--teal)}
.rzn .btn{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-sans),"Hanken Grotesk",sans-serif;font-weight:600;
  font-size:15px;padding:11px 20px;border-radius:10px;border:1px solid transparent;cursor:pointer;transition:transform .15s, background .2s, box-shadow .2s;white-space:nowrap}
.rzn .btn-primary{background:var(--ink);color:var(--paper)}
.rzn .btn-primary:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.rzn .btn-ghost2{background:transparent;border-color:var(--line);color:var(--ink)}
.rzn .btn-ghost2:hover{border-color:var(--ink);transform:translateY(-1px)}
.rzn .btn-coral{background:var(--coral);color:#fff}
.rzn .btn-coral:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.rzn .nav-cta{display:flex;gap:12px;align-items:center}

/* HERO */
.rzn header{padding:74px 0 30px;position:relative}
.rzn .eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--teal-deep);background:rgba(14,124,107,.09);
  padding:7px 14px;border-radius:100px;margin-bottom:26px}
.rzn .eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 4px rgba(14,124,107,.18)}
.rzn h1.hero-title{font-size:clamp(40px,6.2vw,76px);font-weight:800;max-width:14ch}
.rzn h1.hero-title .accent{color:var(--teal);font-style:italic;font-weight:700}
.rzn .hero-sub{font-size:clamp(18px,2.2vw,22px);color:var(--ink-soft);max-width:54ch;margin-top:26px;line-height:1.5}
.rzn .hero-sub b{color:var(--ink);font-weight:600}
.rzn .hero-cta{display:flex;gap:14px;margin-top:34px;flex-wrap:wrap}
.rzn .hero-note{font-size:14px;color:var(--slate);margin-top:18px;display:flex;align-items:center;gap:8px}
.rzn .hero-note svg{flex:none}

/* SCORE STRIP */
.rzn .scorestrip{margin-top:60px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow);overflow:hidden}
.rzn .strip-head{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--line-soft);flex-wrap:wrap;gap:10px}
.rzn .strip-head .t{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--slate)}
.rzn .live-tag{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--teal-deep);text-transform:uppercase;letter-spacing:.05em}
.rzn .live-tag .pulse{width:8px;height:8px;border-radius:50%;background:var(--teal);animation:rzPulse 1.6s infinite}
@keyframes rzPulse{0%{box-shadow:0 0 0 0 rgba(14,124,107,.5)}70%{box-shadow:0 0 0 9px rgba(14,124,107,0)}100%{box-shadow:0 0 0 0 rgba(14,124,107,0)}}
.rzn .coverage{font-family:var(--font-mono),"Space Mono",monospace;font-weight:700;font-size:15px;color:var(--ink)}
.rzn .coverage span{color:var(--teal)}
.rzn .strip-canvas{display:flex;align-items:flex-end;gap:3px;height:140px;padding:24px 22px;overflow:hidden}
.rzn .strip-canvas .bar{flex:1 1 auto;min-width:2px;border-radius:3px 3px 0 0;transition:height .5s cubic-bezier(.2,.8,.2,1), background .5s;will-change:height}
.rzn .strip-foot{display:flex;gap:26px;padding:14px 22px 18px;border-top:1px solid var(--line-soft);flex-wrap:wrap}
.rzn .legend{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slate)}
.rzn .legend i{width:11px;height:11px;border-radius:3px;display:block}

/* PROBLEM BAND */
.rzn .band{background:var(--ink);color:var(--paper);margin-top:96px;padding:84px 0}
.rzn .band h2{font-size:clamp(28px,4vw,48px);max-width:20ch;color:#fff}
.rzn .band h2 em{font-style:normal;color:var(--coral)}
.rzn .band p{color:#aebdb8;max-width:46ch;margin-top:22px;font-size:18px}
.rzn .compare{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:54px}
.rzn .compare-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius);padding:28px}
.rzn .compare-card .label{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#8ea29c;font-weight:600}
.rzn .compare-card .big{font-family:var(--font-mono),"Space Mono",monospace;font-weight:700;font-size:clamp(44px,7vw,72px);line-height:1;margin:14px 0 6px}
.rzn .compare-card.old .big{color:#6f827c}
.rzn .compare-card.new .big{color:var(--teal)}
.rzn .compare-card .cap{color:#aebdb8;font-size:15px}
.rzn .minibars{display:flex;align-items:flex-end;gap:2px;height:46px;margin-top:20px}
.rzn .minibars i{flex:1;border-radius:2px 2px 0 0;display:block;background:rgba(255,255,255,.13)}
.rzn .minibars.new i{background:var(--teal);opacity:.85}
.rzn .minibars.old i.on{background:var(--coral)}

/* SECTION SHELL */
.rzn section.block{padding:96px 0}
.rzn .sec-eyebrow{font-family:var(--font-mono),"Space Mono",monospace;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--teal-deep);margin-bottom:16px}
.rzn .sec-title{font-size:clamp(30px,4.4vw,52px);max-width:20ch}
.rzn .sec-intro{color:var(--ink-soft);max-width:54ch;margin-top:18px;font-size:18px}

/* HOW IT WORKS */
.rzn .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:58px}
.rzn .step{position:relative;padding-top:30px}
.rzn .step .num{font-family:var(--font-mono),"Space Mono",monospace;font-weight:700;font-size:14px;color:var(--coral);letter-spacing:.05em}
.rzn .step .rule{height:2px;background:var(--line);margin:14px 0 22px;position:relative;overflow:hidden}
.rzn .step .rule::after{content:"";position:absolute;inset:0;width:38%;background:var(--teal)}
.rzn .step:nth-child(2) .rule::after{width:62%}
.rzn .step:nth-child(3) .rule::after{width:100%}
.rzn .step h3{font-size:23px;margin-bottom:10px}
.rzn .step p{color:var(--ink-soft);font-size:16px}

/* FEATURES */
.rzn .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:54px;background:var(--line-soft);border:1px solid var(--line-soft);border-radius:var(--radius);overflow:hidden}
.rzn .feat{background:var(--paper);padding:34px 30px;transition:background .25s}
.rzn .feat:hover{background:var(--card)}
.rzn .feat .ico{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;background:rgba(14,124,107,.1)}
.rzn .feat .ico svg{stroke:var(--teal-deep)}
.rzn .feat:nth-child(2) .ico,.rzn .feat:nth-child(5) .ico{background:rgba(239,95,59,.1)}
.rzn .feat:nth-child(2) .ico svg,.rzn .feat:nth-child(5) .ico svg{stroke:var(--coral)}
.rzn .feat:nth-child(3) .ico,.rzn .feat:nth-child(6) .ico{background:rgba(227,162,58,.14)}
.rzn .feat:nth-child(3) .ico svg,.rzn .feat:nth-child(6) .ico svg{stroke:#b9801f}
.rzn .feat h3{font-size:20px;margin-bottom:9px}
.rzn .feat p{color:var(--ink-soft);font-size:15.5px}

/* PRODUCT PREVIEW */
.rzn .preview{background:var(--paper-2)}
.rzn .preview-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:54px;align-items:center;margin-top:14px}
.rzn .scorecard{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}
.rzn .sc-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--line-soft)}
.rzn .sc-head .meta{font-size:13px;color:var(--slate)}
.rzn .sc-head .meta b{color:var(--ink);font-weight:600;font-size:15px;display:block;margin-bottom:2px}
.rzn .gauge{position:relative;width:96px;height:96px;flex:none}
.rzn .gauge svg{transform:rotate(-90deg)}
.rzn .gauge .read{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.rzn .gauge .read .v{font-family:var(--font-mono),"Space Mono",monospace;font-weight:700;font-size:30px;line-height:1;color:var(--ink)}
.rzn .gauge .read .l{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--slate);margin-top:2px}
.rzn .pillars{padding:18px 22px;display:flex;flex-direction:column;gap:13px}
.rzn .pillar{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
.rzn .pillar .pn{font-size:14px;color:var(--ink-soft)}
.rzn .pillar .track{grid-column:1/-1;height:6px;background:var(--line-soft);border-radius:4px;overflow:hidden}
.rzn .pillar .fill{height:100%;border-radius:4px;transition:width .7s cubic-bezier(.2,.8,.2,1)}
.rzn .pillar .ps{font-family:var(--font-mono),"Space Mono",monospace;font-size:13px;font-weight:700;color:var(--ink)}
.rzn .sc-foot{padding:18px 22px;border-top:1px solid var(--line-soft);background:rgba(14,124,107,.04)}
.rzn .sc-foot .tag{font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:600;color:var(--teal-deep);margin-bottom:7px}
.rzn .sc-foot p{font-size:14.5px;color:var(--ink-soft);line-height:1.5}
.rzn .next{margin-top:14px;display:flex;gap:10px;align-items:flex-start;background:rgba(239,95,59,.07);border-radius:10px;padding:12px 14px}
.rzn .next .tag{color:var(--coral)}
.rzn .next p{color:var(--ink)}
.rzn .preview-copy h2{font-size:clamp(28px,3.6vw,44px);max-width:16ch}
.rzn .preview-copy p{color:var(--ink-soft);margin-top:18px;font-size:17px;max-width:42ch}
.rzn .preview-copy .btn{margin-top:26px}
.rzn .preview-copy .feat-list{margin-top:24px;display:flex;flex-direction:column;gap:12px}
.rzn .preview-copy .feat-list div{display:flex;gap:11px;align-items:center;font-size:15.5px;color:var(--ink-soft)}
.rzn .preview-copy .feat-list svg{flex:none;stroke:var(--teal)}

/* METRICS */
.rzn .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:14px}
.rzn .metric{border-top:2px solid var(--ink);padding-top:18px}
.rzn .metric .v{font-family:var(--font-display),"Bricolage Grotesque",serif;font-weight:800;font-size:clamp(34px,4.6vw,52px);line-height:1}
.rzn .metric:nth-child(1) .v{color:var(--teal)}
.rzn .metric:nth-child(3) .v{color:var(--coral)}
.rzn .metric .l{color:var(--ink-soft);font-size:15px;margin-top:8px}

/* PRICING */
.rzn .price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:54px;align-items:stretch}
.rzn .tier{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:32px 28px;display:flex;flex-direction:column}
.rzn .tier.featured{border-color:var(--ink);box-shadow:var(--shadow);position:relative}
.rzn .tier.featured::before{content:"Most popular";position:absolute;top:-12px;left:28px;background:var(--coral);color:#fff;font-size:12px;font-weight:600;padding:5px 12px;border-radius:100px}
.rzn .tier .tn{font-family:var(--font-display),"Bricolage Grotesque",serif;font-weight:700;font-size:22px}
.rzn .tier .td{color:var(--slate);font-size:14.5px;margin-top:6px;min-height:42px}
.rzn .tier .price{margin:20px 0 6px;display:flex;align-items:baseline;gap:6px}
.rzn .tier .price .amt{font-family:var(--font-mono),"Space Mono",monospace;font-weight:700;font-size:40px;color:var(--ink)}
.rzn .tier .price .per{color:var(--slate);font-size:14px}
.rzn .tier ul{list-style:none;margin:22px 0 28px;display:flex;flex-direction:column;gap:12px}
.rzn .tier li{display:flex;gap:11px;align-items:flex-start;font-size:15px;color:var(--ink-soft)}
.rzn .tier li svg{flex:none;margin-top:3px;stroke:var(--teal)}
.rzn .tier .btn{margin-top:auto;width:100%;justify-content:center}

/* FINAL CTA */
.rzn .final{background:var(--ink);color:#fff;border-radius:24px;padding:72px 56px;position:relative;overflow:hidden}
.rzn .final .barsbg{position:absolute;inset:0;display:flex;align-items:flex-end;gap:4px;opacity:.1;padding:0 30px}
.rzn .final .barsbg i{flex:1;background:#fff;border-radius:3px 3px 0 0}
.rzn .final-inner{position:relative;z-index:2;text-align:center}
.rzn .final h2{font-size:clamp(32px,5vw,58px);color:#fff;max-width:18ch;margin:0 auto}
.rzn .final p{color:#aebdb8;max-width:48ch;margin:20px auto 0;font-size:18px}
.rzn .final .hero-cta{justify-content:center;margin-top:34px}

/* FOOTER */
.rzn footer{padding:64px 0 40px}
.rzn .foot-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:34px}
.rzn .foot-brand p{color:var(--slate);font-size:14.5px;margin-top:16px;max-width:30ch}
.rzn .foot-col h4{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink);margin-bottom:16px;font-family:var(--font-sans),"Hanken Grotesk",sans-serif;font-weight:700}
.rzn .foot-col a{display:block;color:var(--slate);font-size:14.5px;margin-bottom:11px;transition:color .2s}
.rzn .foot-col a:hover{color:var(--teal)}
.rzn .foot-bottom{margin-top:48px;padding-top:24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;font-size:13.5px;color:var(--slate)}

/* reveal */
.rzn .rz-reveal{opacity:0;transform:translateY(22px);transition:opacity .7s ease, transform .7s cubic-bezier(.2,.8,.2,1)}
.rzn .rz-reveal.rz-in{opacity:1;transform:none}

@media(max-width:900px){
  .rzn .nav-links{display:none}
  .rzn .steps,.rzn .grid,.rzn .metrics,.rzn .price-grid,.rzn .compare{grid-template-columns:1fr}
  .rzn .preview-grid{grid-template-columns:1fr;gap:36px}
  .rzn .foot-grid{grid-template-columns:1fr 1fr}
  .rzn .final{padding:52px 26px}
  .rzn .band{padding:60px 0}
  .rzn section.block{padding:68px 0}
}
@media(max-width:560px){
  .rzn{font-size:16px}
  .rzn .foot-grid{grid-template-columns:1fr}
  .rzn .hero-cta .btn{flex:1 1 100%}
  .rzn .metrics{grid-template-columns:1fr 1fr}
}
@media(prefers-reduced-motion:reduce){
  .rzn *{animation:none!important;transition:none!important}
  .rzn .rz-reveal{opacity:1;transform:none}
}
.rzn .btn:focus-visible,.rzn a:focus-visible{outline:2.5px solid var(--teal);outline-offset:3px;border-radius:6px}
`;

const PILLAR_DEFS = [
  "Opening & rapport",
  "Motivation discovery",
  "Condition & price",
  "Objection handling",
  "Close & next step",
];

type SampleCall = {
  title: string;
  meta: string;
  overall: number;
  p: number[];
  fb: string;
  next: string;
};

const SAMPLE_CALLS: SampleCall[] = [
  {
    title: "Lead #4471 · Probate seller",
    meta: "Rep: Marcus T. · 6m 12s · qualified",
    overall: 92,
    p: [95, 90, 96, 94, 82],
    fb: "Strong, patient handling of a grieving seller. Marcus built rapport before pushing for numbers, uncovered a clear timeline pressure, and locked in condition details that put ARV within range. The close was slightly rushed.",
    next: "Slow down the wrap-up — restate the appointment time and confirm who else is on title before ending the call.",
  },
  {
    title: "Lead #4488 · Absentee owner",
    meta: "Rep: Dana K. · 4m 03s · disqualified",
    overall: 61,
    p: [70, 48, 66, 72, 52],
    fb: "The owner picked up warm, but the rep jumped straight to a price question and never found out why they'd sell. Two clear motivation cues went unexplored, so the lead got logged as cold when it may have been workable.",
    next: "Ask why they'd sell now — and what they'd do with the money — inside the first 60 seconds, before any price talk.",
  },
  {
    title: "Lead #4502 · Tired landlord",
    meta: "Rep: Priya N. · 7m 41s · qualified",
    overall: 84,
    p: [88, 86, 80, 90, 78],
    fb: "Well-paced discovery that surfaced deferred maintenance and a problem tenant — exactly the motivation that makes a deal. Good rapport throughout. The repair walk-through ran long where a few targeted questions would have done it.",
    next: "Tighten the condition questions — lead with roof, HVAC, and tenant status to size repairs faster.",
  },
  {
    title: "Lead #4519 · Pre-foreclosure",
    meta: "Rep: Sam O. · 5m 58s · qualified",
    overall: 96,
    p: [97, 95, 98, 96, 94],
    fb: "A model acquisitions call. Calm opening, genuine empathy about the situation, and a clean bridge from motivation to a realistic offer anchored on the Zillow value. Textbook close with a firm next step.",
    next: "Nothing to fix — clip this one for the new-hire training library.",
  },
];

const FEATURES = [
  {
    title: "AI call qualification",
    body: "Every recording graded against your custom persona and Kill List — Hot, Warm, Cold, or disqualified, with the exact reason and a 0–100 score.",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
    ),
  },
  {
    title: "Instant MAO & ARV",
    body: "Live Zillow value plus AI-estimated repairs auto-calculate your Maximum Allowable Offer — and a one-click offer PDF — on every qualified lead.",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" /><circle cx="12" cy="12" r="3" /></svg>
    ),
  },
  {
    title: "Gong-style call player",
    body: "Waveform scrubbing, speed control, highlight reels, and secure signed-URL playback — for every recording, searchable across the whole floor.",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
    ),
  },
  {
    title: "AI Handoff Brief",
    body: "A three-bullet intel dossier — seller personality, pain point, bottom-line price — so closers skip the full re-listen and pick up where the rep left off.",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" /></svg>
    ),
  },
  {
    title: "Compliance flags",
    body: "Catch missed disclosures, skipped verification, or risky language on every dial — not just the handful a manager happens to sample.",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
    ),
  },
  {
    title: "Leaderboard & omni-search",
    body: "Target pacing, glowing Hot/Warm/Cold pills, and live bonus estimates keep the floor pushing — and ⌘K finds any lead by address, phone, or words spoken.",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
    ),
  },
];

const STEPS = [
  {
    n: "STEP 01",
    title: "Connect your recordings",
    body: "Point RealTrack at your call recordings — Drive, S3, your dialer, or a shared folder. New calls are picked up automatically as they land. No rep action required.",
  },
  {
    n: "STEP 02",
    title: "AI qualifies & scores",
    body: "Each call is transcribed word-for-word with speakers separated, scored against your persona, and matched to the live Zillow value to compute ARV and the offer.",
  },
  {
    n: "STEP 03",
    title: "Coach & hand off",
    body: "Managers open one view: scores by rep, the calls that need attention, and a next step for each. Acquisitions get a handoff brief and only touch deals worth closing.",
  },
];

const TIERS = [
  {
    name: "Starter",
    desc: "For a solo wholesaler putting QA on autopilot.",
    price: "$49",
    per: "/ mo",
    feats: ["Up to 100 analyses / mo", "Transcription + scoring on every call", "Live ARV + MAO calculator", "Call player & CSV import", "90-day call history"],
    cta: "Start free trial",
    ctaClass: "btn-ghost2",
    featured: false,
  },
  {
    name: "Professional",
    desc: "For growing teams that coach by the numbers.",
    price: "$149",
    per: "/ mo",
    feats: ["Up to 500 analyses / mo", "Custom persona & Kill List", "Teams, roles & leaderboard", "Compliance flagging & handoff briefs", "Webhook export · unlimited history"],
    cta: "Book a demo",
    ctaClass: "btn-coral",
    featured: true,
  },
  {
    name: "Enterprise",
    desc: "For BPOs and call floors with scale & security needs.",
    price: "Let's talk",
    per: "",
    feats: ["Unlimited analyses & floors", "Multi-tenant + RBAC & audit logs", "SSO, data residency, SOC 2", "Dialer & CRM integrations", "Dedicated success manager"],
    cta: "Contact sales",
    ctaClass: "btn-ghost2",
    featured: false,
  },
];

const METRICS = [
  { v: "100%", l: "of calls qualified, not a 2% sample" },
  { v: "9hrs", l: "of manual review saved per QA lead, weekly" },
  { v: "3.2×", l: "more deals surfaced from the same dials" },
  { v: "<2min", l: "from call ending to a scored verdict" },
];

const CHECK = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
);

function scoreColor(s: number) {
  if (s >= 90) return "#0e7c6b";
  if (s >= 70) return "#e3a23a";
  return "#ef5f3b";
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ciRef = useRef(0);

  // Already signed in? Send straight to the dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/dashboard";
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];

    const $ = (sel: string) => root.querySelector(sel) as HTMLElement | null;

    /* ---- HERO SCORE STRIP ---- */
    const canvas = $("#stripCanvas");
    const BARS = 90;
    const scores: number[] = [];
    if (canvas) {
      canvas.innerHTML = "";
      for (let i = 0; i < BARS; i++) {
        const r = Math.random();
        const s = r < 0.12 ? 45 + Math.random() * 24 : r < 0.45 ? 70 + Math.random() * 19 : 89 + Math.random() * 11;
        scores.push(Math.round(s));
        const b = document.createElement("div");
        b.className = "bar";
        b.style.height = "6px";
        b.style.background = "#dfe3dd";
        canvas.appendChild(b);
      }
    }
    function animateStrip() {
      if (!canvas) return;
      const bars = canvas.children;
      let done = 0, idx = 0;
      const cov = $("#cov"), cc = $("#callCount");
      const timer = setInterval(() => {
        if (idx >= BARS) { clearInterval(timer); return; }
        const step = reduce ? BARS : 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < step && idx < BARS; k++, idx++) {
          const s = scores[idx];
          (bars[idx] as HTMLElement).style.height = (14 + (s / 100) * 108) + "px";
          (bars[idx] as HTMLElement).style.background = scoreColor(s);
          done++;
        }
        if (cov) cov.textContent = Math.round((done / BARS) * 100) + "%";
        if (cc) cc.textContent = String(1900 + done * 7);
      }, reduce ? 0 : 32);
      cleanups.push(() => clearInterval(timer));
    }

    /* ---- mini bars in problem band ---- */
    function fillMini(el: HTMLElement | null, count: number, onIdx: number[] | null) {
      if (!el) return;
      el.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const b = document.createElement("i");
        if (onIdx && onIdx.indexOf(i) > -1) b.className = "on";
        b.style.height = (20 + Math.random() * 26) + "px";
        el.appendChild(b);
      }
    }
    fillMini($("#oldBars"), 34, [12]);
    const newBars = $("#newBars");
    fillMini(newBars, 34, null);
    if (newBars) Array.prototype.forEach.call(newBars.children, (b: HTMLElement) => { b.style.height = (16 + Math.random() * 30) + "px"; });

    /* ---- CTA bg bars ---- */
    const ctaBars = $("#ctaBars");
    if (ctaBars) {
      ctaBars.innerHTML = "";
      for (let i = 0; i < 60; i++) { const b = document.createElement("i"); b.style.height = (20 + Math.random() * 80) + "%"; ctaBars.appendChild(b); }
    }

    /* ---- PRODUCT PREVIEW — scored calls ---- */
    const arc = $("#gaugeArc");
    const CIRC = 251.2;
    function renderCall(c: SampleCall) {
      const title = $("#callTitle");
      if (title) title.innerHTML = "<b>" + c.title + "</b>" + c.meta;
      if (arc) {
        (arc as unknown as SVGElement).style.stroke = scoreColor(c.overall);
        (arc as unknown as SVGElement).style.strokeDashoffset = String(CIRC - (c.overall / 100) * CIRC);
      }
      const gv = $("#gaugeVal");
      if (gv) {
        if (reduce) { gv.textContent = String(c.overall); }
        else {
          let cur = 0;
          const t = setInterval(() => {
            cur += Math.max(1, Math.round((c.overall - cur) / 6));
            if (cur >= c.overall) { cur = c.overall; clearInterval(t); }
            gv.textContent = String(cur);
          }, 22);
          cleanups.push(() => clearInterval(t));
        }
      }
      const wrap = $("#pillars");
      if (wrap) {
        wrap.innerHTML = "";
        c.p.forEach((val, idx) => {
          const row = document.createElement("div");
          row.className = "pillar";
          row.innerHTML = '<span class="pn">' + PILLAR_DEFS[idx] + '</span><span class="ps">' + val + '</span><div class="track"><div class="fill" style="width:0%;background:' + scoreColor(val) + '"></div></div>';
          wrap.appendChild(row);
          const fill = row.querySelector(".fill") as HTMLElement;
          requestAnimationFrame(() => { setTimeout(() => { fill.style.width = val + "%"; }, reduce ? 0 : 60 + idx * 70); });
        });
      }
      const fb = $("#fbText"); if (fb) fb.textContent = c.fb;
      const nx = $("#nextText"); if (nx) nx.textContent = c.next;
    }
    renderCall(SAMPLE_CALLS[0]);
    const cycleBtn = $("#cycleBtn");
    const onCycle = () => { ciRef.current = (ciRef.current + 1) % SAMPLE_CALLS.length; renderCall(SAMPLE_CALLS[ciRef.current]); };
    if (cycleBtn) cycleBtn.addEventListener("click", onCycle);
    cleanups.push(() => { if (cycleBtn) cycleBtn.removeEventListener("click", onCycle); });

    /* ---- scroll reveal + trigger strip ---- */
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("rz-in");
          if ((e.target as HTMLElement).id === "scorestrip") { setTimeout(animateStrip, reduce ? 0 : 300); }
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.16 });
    root.querySelectorAll(".rz-reveal").forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    return () => { cleanups.forEach((fn) => fn()); };
  }, []);

  return (
    <div className="rzn" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* NAV */}
      <nav>
        <div className="wrap nav-inner">
          <div className="brand">
            <span className="brand-mark"><i /><i /><i /><i /></span>RealTrack
          </div>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Product</a>
            <a href="#preview">Live preview</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="nav-cta">
            <Link href="/login" className="btn btn-ghost2">Sign in</Link>
            <Link href="/login" className="btn btn-primary">Book a demo</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header>
        <div className="wrap">
          <div className="eyebrow"><span className="dot" />AI call intelligence for real-estate acquisitions</div>
          <h1 className="hero-title">Qualify every call. <span className="accent">Coach</span> every rep.</h1>
          <p className="hero-sub">Your QA lead listens to maybe two calls in a hundred. RealTrack transcribes and grades <b>100% of them</b> — every rep, every shift — qualifies the lead against live market value, and turns each call into a score, a reason, and a next step.</p>
          <div className="hero-cta">
            <Link href="/login" className="btn btn-coral">Book a 20-min demo →</Link>
            <a href="#preview" className="btn btn-ghost2">See a scored call</a>
          </div>
          <div className="hero-note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5c6b66" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
            Drops into your existing recordings &amp; dialer. No rip-and-replace.
          </div>

          {/* SCORE STRIP */}
          <div className="scorestrip rz-reveal" id="scorestrip">
            <div className="strip-head">
              <div className="t"><span className="live-tag"><span className="pulse" />Live scoring</span> Tuesday shift · Acquisitions floor</div>
              <div className="coverage">coverage <span id="cov">0%</span></div>
            </div>
            <div className="strip-canvas" id="stripCanvas" />
            <div className="strip-foot">
              <div className="legend"><i style={{ background: "var(--coral)" }} />Needs coaching · 0–69</div>
              <div className="legend"><i style={{ background: "var(--amber)" }} />On track · 70–89</div>
              <div className="legend"><i style={{ background: "var(--teal)" }} />Excellent · 90–100</div>
              <div className="legend mono" style={{ marginLeft: "auto" }}><span id="callCount">0</span>&nbsp;calls scored today</div>
            </div>
          </div>
        </div>
      </header>

      {/* PROBLEM BAND */}
      <div className="band">
        <div className="wrap">
          <h2>You review <em>2%</em> of calls. Your pipeline is built on <em>100%</em>.</h2>
          <p>Manual QA was never a coverage problem you could hire your way out of. It&apos;s a math problem. RealTrack changes the denominator.</p>
          <div className="compare">
            <div className="compare-card old">
              <div className="label">Manual QA, the old way</div>
              <div className="big">2&nbsp;/&nbsp;100</div>
              <div className="cap">Calls a manager can realistically score by hand each week. The other 98 — and the deals hiding in them — go unheard.</div>
              <div className="minibars old" id="oldBars" />
            </div>
            <div className="compare-card new">
              <div className="label">QA with RealTrack</div>
              <div className="big">100&nbsp;/&nbsp;100</div>
              <div className="cap">Every call transcribed, qualified against your persona, priced against the Zillow value, and routed to the right coach.</div>
              <div className="minibars new" id="newBars" />
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className="block" id="how">
        <div className="wrap">
          <div className="sec-eyebrow rz-reveal">// how it works</div>
          <h2 className="sec-title rz-reveal">From a folder of recordings to a coached floor — in three steps.</h2>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="step rz-reveal" key={s.n}>
                <div className="num">{s.n}</div>
                <div className="rule" />
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="block" id="features" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-eyebrow rz-reveal">// what&apos;s inside</div>
          <h2 className="sec-title rz-reveal">Everything an acquisitions floor does by hand, running on its own.</h2>
          <div className="grid">
            {FEATURES.map((f) => (
              <div className="feat rz-reveal" key={f.title}>
                <div className="ico">{f.svg}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="block preview" id="preview">
        <div className="wrap">
          <div className="sec-eyebrow rz-reveal">// live preview</div>
          <h2 className="sec-title rz-reveal">This is what your floor opens every morning.</h2>
          <div className="preview-grid">
            {/* SCORECARD */}
            <div className="scorecard rz-reveal">
              <div className="sc-head">
                <div className="meta" id="callTitle"><b>Lead #4471 · Probate seller</b>Rep: Marcus T. · 6m 12s · qualified</div>
                <div className="gauge">
                  <svg width="96" height="96" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#e6e8e3" strokeWidth="9" />
                    <circle id="gaugeArc" cx="48" cy="48" r="40" fill="none" stroke="#0e7c6b" strokeWidth="9" strokeLinecap="round" strokeDasharray="251.2" strokeDashoffset="251.2" />
                  </svg>
                  <div className="read"><span className="v" id="gaugeVal">0</span><span className="l">score</span></div>
                </div>
              </div>
              <div className="pillars" id="pillars" />
              <div className="sc-foot">
                <div className="tag">QA summary</div>
                <p id="fbText">—</p>
                <div className="next">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef5f3b" strokeWidth="2" style={{ marginTop: 2, flex: "none" }}><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
                  <div><div className="tag">Next step</div><p id="nextText">—</p></div>
                </div>
              </div>
            </div>
            {/* COPY */}
            <div className="preview-copy rz-reveal">
              <h2>A grade is a number. RealTrack gives you the reason.</h2>
              <p>Anyone can spit out a score. The hard part is telling a rep <em>why</em> — and what to do about it. That&apos;s the part RealTrack writes for you, call after call.</p>
              <div className="feat-list">
                <div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>Per-pillar breakdown, not one mystery number</div>
                <div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>Coaching language a manager can paste into 1:1s</div>
                <div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>One next step, ranked by what moves the score most</div>
              </div>
              <button className="btn btn-primary" id="cycleBtn">Score another call →</button>
            </div>
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section className="block" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-eyebrow rz-reveal">// what changes</div>
          <h2 className="sec-title rz-reveal" style={{ marginBottom: 8 }}>The numbers acquisitions leaders care about.</h2>
          <div className="metrics">
            {METRICS.map((m) => (
              <div className="metric rz-reveal" key={m.l}><div className="v">{m.v}</div><div className="l">{m.l}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="block preview" id="pricing">
        <div className="wrap">
          <div className="sec-eyebrow rz-reveal">// pricing</div>
          <h2 className="sec-title rz-reveal">Priced per workspace. Scales with the floor.</h2>
          <p className="sec-intro rz-reveal">Every plan scores 100% of calls — tiers differ on volume, history, and how deep you customize the persona. Annual billing shown; monthly available.</p>
          <div className="price-grid">
            {TIERS.map((t) => (
              <div className={"tier rz-reveal" + (t.featured ? " featured" : "")} key={t.name}>
                <div className="tn">{t.name}</div>
                <div className="td">{t.desc}</div>
                <div className="price"><span className="amt">{t.price}</span>{t.per && <span className="per">{t.per}</span>}</div>
                <ul>
                  {t.feats.map((f) => (
                    <li key={f}>{CHECK}{f}</li>
                  ))}
                </ul>
                <Link href="/login" className={"btn " + t.ctaClass}>{t.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="block">
        <div className="wrap">
          <div className="final rz-reveal">
            <div className="barsbg" id="ctaBars" />
            <div className="final-inner">
              <h2>Stop sampling. Start qualifying everything.</h2>
              <p>Send us a folder of last week&apos;s recordings. We&apos;ll score them all and walk you through the deals your 2% sample has been missing.</p>
              <div className="hero-cta">
                <Link href="/login" className="btn btn-coral">Book a 20-min demo →</Link>
                <a href="#preview" className="btn btn-ghost2" style={{ borderColor: "rgba(255,255,255,.3)", color: "#fff" }}>See a scored call</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <div className="brand"><span className="brand-mark"><i /><i /><i /><i /></span>RealTrack</div>
              <p>AI call intelligence for real-estate acquisitions. Qualify every call, coach every rep.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="#features">Features</a><a href="#preview">Live preview</a><a href="#pricing">Pricing</a><a href="#how">How it works</a>
            </div>
            <div className="foot-col">
              <h4>Company</h4>
              <a href="#">About</a><a href="#">Customers</a><a href="#">Security</a><a href="#">Careers</a>
            </div>
            <div className="foot-col">
              <h4>Resources</h4>
              <Link href="/tutorial">Docs</Link><a href="#">QA scorecard guide</a><Link href="/status">Status</Link><a href="mailto:info@realtrack.app">Contact</a>
            </div>
          </div>
          <div className="foot-bottom">
            <div>© {new Date().getFullYear()} RealTrack. All rights reserved.</div>
            <div>Privacy · Terms · Data processing</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
