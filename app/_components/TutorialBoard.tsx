"use client";

import { useState } from "react";

const NAVY = "var(--text-1)";
const NAVY_2 = "#2A3347";
const TEAL = "#0e7c6b";
const SLATE = "var(--text-2)";
const ARROW = "#0e7c6b";

interface Step {
  key: string;
  tab: string;
  title: string;
  caption: string;
  render: () => React.ReactNode;
}

// ── small UI primitives for the mock screens ──
function Chrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(35,43,58,0.12)", background: "#fff", boxShadow: "0 12px 40px rgba(35,43,58,0.12)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "#F1F4F9", borderBottom: "1px solid rgba(35,43,58,0.08)" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
        <span style={{ marginLeft: 10, fontSize: 11, color: SLATE, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ padding: 18, position: "relative", minHeight: 230, background: "#F2F5F9" }}>{children}</div>
    </div>
  );
}

function Arrow({ label, top, left }: { label: string; top: number; left: number }) {
  return (
    <div style={{ position: "absolute", top, left, display: "flex", alignItems: "center", gap: 6, zIndex: 5 }}>
      <div style={{
        background: "var(--midnight)", color: "#fff", fontSize: 11, fontWeight: 800,
        padding: "5px 10px", borderRadius: 8, whiteSpace: "nowrap",
        boxShadow: "0 4px 14px rgba(35,43,58,0.30)",
      }}>{label}</div>
      <svg width="40" height="24" viewBox="0 0 40 24" style={{ overflow: "visible" }}>
        <line x1="0" y1="12" x2="32" y2="12" stroke={ARROW} strokeWidth="2.5" />
        <path d="M32 12 L24 7 M32 12 L24 17" stroke={ARROW} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 9, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</p>
      <div style={{
        padding: "8px 10px", borderRadius: 7, fontSize: 11, color: NAVY,
        background: highlight ? "#E8EFFF" : "#fff",
        border: `1px solid ${highlight ? TEAL : "rgba(35,43,58,0.10)"}`,
      }}>{value}</div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    key: "onboard", tab: "1 · Onboard team",
    title: "Upload your team in one CSV",
    caption: "Settings → Import. One file provisions managers, callers, teams and trainers.",
    render: () => (
      <Chrome title="RealTrack — Settings">
        <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 14 }}>Import Team Structure</p>
        <div style={{
          border: "2px dashed " + TEAL + "55", borderRadius: 12, background: "#EEF3FF",
          padding: "26px 18px", textAlign: "center", maxWidth: 360,
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
          <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Drop CSV or click to browse</p>
          <p style={{ fontSize: 10, color: SLATE, marginTop: 4 }}>Manager · Agent · Team · Trainer · Hiring Date</p>
        </div>
        <Arrow label="Drag your roster here" top={120} left={300} />
      </Chrome>
    ),
  },
  {
    key: "share", tab: "2 · Share form",
    title: "Share your submission link",
    caption: "Submit Lead → Generate Link. Send it to your callers — submissions land in your dashboard.",
    render: () => (
      <Chrome title="RealTrack — Submit Lead">
        <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 14 }}>Shareable Submission Link</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 9, background: "var(--midnight)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
          🔗 Generate Link
        </div>
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 9, background: "#E8EFFF", border: `1px solid ${TEAL}55`, fontSize: 11, color: NAVY, fontFamily: "monospace", maxWidth: 360 }}>
          realtrack.app/submit/your-team
        </div>
        <Arrow label="Click to create a public link" top={56} left={210} />
      </Chrome>
    ),
  },
  {
    key: "submit", tab: "3 · Log the lead",
    title: "Log the lead + attach the call",
    caption: "Callers fill the owner, contact, Zillow & Zestimate, then attach the recording.",
    render: () => (
      <Chrome title="RealTrack — Public Form">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 420 }}>
          <Field label="Cold Caller" value="Sarah J." />
          <Field label="Campaign" value="Motivated Sellers" />
          <Field label="Owner Name" value="John Doe" />
          <Field label="Phone" value="(305) 555-0199" />
          <Field label="Zestimate" value="$275,000" highlight />
          <Field label="Asking Price" value="$210,000" highlight />
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 9, border: `2px dashed ${TEAL}55`, background: "#EEF3FF", fontSize: 11, fontWeight: 700, color: NAVY, maxWidth: 420, textAlign: "center" }}>
          ⬆ Attach call recording
        </div>
        <Arrow label="AI reads the rest from the call" top={150} left={300} />
      </Chrome>
    ),
  },
  {
    key: "verdict", tab: "4 · Read verdict",
    title: "Open the lead, read the verdict",
    caption: "Status, reason, call summary and the full lead form — all on one page.",
    render: () => (
      <Chrome title="RealTrack — Lead Detail">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ padding: "5px 12px", borderRadius: 999, background: "#ECFDF5", color: "#0a5f52", fontSize: 11, fontWeight: 800 }}>✓ Qualified</span>
          <span style={{ fontSize: 12, color: SLATE }}>123 Oak St, Miami FL</span>
        </div>
        <div style={{ padding: 12, borderRadius: 9, background: "#fff", border: "1px solid rgba(35,43,58,0.08)", maxWidth: 420 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#0a5f52", marginBottom: 4 }}>WHAT HAPPENED ON THE CALL</p>
          <p style={{ fontSize: 11, color: NAVY, lineHeight: 1.6 }}>Owner is relocating, motivated to close within 60 days. Asking $210k vs $275k Zestimate — a deep discount with clear motivation.</p>
        </div>
        <Arrow label="Status + reason + summary" top={20} left={300} />
      </Chrome>
    ),
  },
  {
    key: "coach", tab: "5 · Coach callers",
    title: "Coach every caller",
    caption: "Timestamped performance feedback rolls up per caller and per team automatically.",
    render: () => (
      <Chrome title="RealTrack — Callers">
        <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 12 }}>Sarah J. · 62% conversion</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
          {["[02:14] Acknowledge seller's divorce before pivoting to repairs.",
            "[04:30] Strong price anchor — repeat this on every call.",
            "[06:02] Ask for the decision-maker earlier next time."].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "8px 10px", borderRadius: 8, background: "#F2F5F9", fontSize: 11, color: NAVY }}>
              <span style={{ minWidth: 18, height: 18, borderRadius: "50%", background: "var(--midnight)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>{i + 1}</span>
              {t}
            </div>
          ))}
        </div>
        <Arrow label="Timestamped coaching" top={70} left={300} />
      </Chrome>
    ),
  },
  {
    key: "track", tab: "6 · Track team",
    title: "Track team performance",
    caption: "Pass rates, trends and recurring coaching themes on the Team Leader dashboard.",
    render: () => (
      <Chrome title="RealTrack — Team Leader">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 420, marginBottom: 14 }}>
          {[["Callers", "8"], ["Qualified", "41"], ["Pass Rate", "57%"]].map(([l, v]) => (
            <div key={l} style={{ padding: 12, borderRadius: 9, background: "#fff", border: "1px solid rgba(35,43,58,0.08)" }}>
              <p style={{ fontSize: 9, color: SLATE, fontWeight: 700 }}>{l}</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>{v}</p>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60, maxWidth: 420 }}>
          {[30, 48, 38, 60, 52, 70, 64].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "4px 4px 0 0", background: i % 2 ? TEAL : NAVY }} />
          ))}
        </div>
        <Arrow label="Live team analytics" top={20} left={300} />
      </Chrome>
    ),
  },
];

export function TutorialBoard() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setActive(i)} style={{
            padding: "8px 16px", borderRadius: 999, cursor: "pointer",
            border: `1px solid ${i === active ? NAVY : "rgba(35,43,58,0.12)"}`,
            background: i === active ? NAVY : "#fff",
            color: i === active ? "#fff" : SLATE,
            fontSize: 12.5, fontWeight: 700, transition: "all 160ms ease",
          }}>
            {s.tab}
          </button>
        ))}
      </div>

      {/* Active screen */}
      <div style={{ maxWidth: 760, margin: "0 auto" }} className="animate-scale" key={step.key}>
        {step.render()}
        <div style={{ textAlign: "center", marginTop: 22 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{step.title}</h3>
          <p style={{ fontSize: 14, color: SLATE, maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>{step.caption}</p>
        </div>
      </div>
    </div>
  );
}
