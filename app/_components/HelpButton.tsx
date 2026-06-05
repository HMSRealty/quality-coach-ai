"use client";

// Contextual help. A top-right "?" that explains the CURRENT page. Content is
// keyed by pathname so every screen gets its own blurb (Phase 4 §3).
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.navy;
const SLATE = T.slate;

type Help = { title: string; body: string; tips?: string[] };

// Most specific match wins (startsWith). Add a row per page.
const HELP: { match: string; help: Help }[] = [
  { match: "/dashboard/pipeline", help: {
    title: "Pipeline",
    body: "A Kanban view of every lead by sales stage. Drag a card to move it between New → Contacted → Negotiating → Won/Lost.",
    tips: ["Drag = update stage instantly", "Click a card to open the full lead", "Read-only roles can view but not drag"],
  }},
  { match: "/dashboard/analytics", help: {
    title: "Analytics",
    body: "Lead KPIs and pipeline funnel for a date range. Defaults to today (EST) — the same timezone leads are dated in.",
    tips: ["Switch presets or pick a custom range", "Qual. Rate = (Hot+Warm+Cold) ÷ total"],
  }},
  { match: "/dashboard/calls", help: {
    title: "Call Library",
    body: "Every analyzed lead with its QA verdict. Search, filter by status/campaign, re-run analysis, or export to CSV.",
    tips: ["Click a row to open the lead", "Re-run re-scores the call with the latest model"],
  }},
  { match: "/dashboard/campaigns", help: {
    title: "Campaigns",
    body: "Group leads and attach custom qualification rules the AI applies during analysis.",
    tips: ["Toggle a campaign off to pause it", "Custom rules steer the AI verdict"],
  }},
  { match: "/dashboard/teams", help: {
    title: "Teams",
    body: "Group your sub-users into teams, pick a Team Leader, and set each member's role. What each role can see is governed by Roles & Access.",
    tips: ["Add members from the sub-users you created", "Change role inline per member"],
  }},
  { match: "/dashboard/sub-users", help: {
    title: "Sub-Users",
    body: "Create accounts under your workspace. Toggle Download on/off per sub-user to restrict who can pull call recordings.",
    tips: ["Act as = log in as them for support", "Delete is permanent — leads stay but get unassigned"],
  }},
  { match: "/dashboard/roles", help: {
    title: "Roles & Access",
    body: "The full permission matrix per role. Enforced in the database, not just the UI.",
  }},
  { match: "/dashboard/leaderboard", help: {
    title: "Leaderboard",
    body: "Callers ranked by points: Hot 3, Warm 2, Cold 1. Pick the window with the range buttons.",
  }},
  { match: "/dashboard/submit-lead", help: {
    title: "Submit Lead",
    body: "Log a lead, optionally attach a call recording. Property details and ARV are fetched automatically on submit.",
    tips: ["Address is the only required property field", "Generate a shareable link for outside callers"],
  }},
  { match: "/dashboard/followups", help: {
    title: "Smart Follow-Ups",
    body: "Leads the AI flagged for a future call-back, sorted by date and priority.",
  }},
  { match: "/dashboard/team-leader", help: {
    title: "Team Leader",
    body: "Roll-up of pass rates, volume and coaching themes across your callers and teams.",
  }},
  { match: "/dashboard", help: {
    title: "Overview",
    body: "Your daily snapshot: total calls, qualification rate, and the latest results. Updates live as analyses finish.",
    tips: ["Change a status inline from the table", "New Analysis uploads a call for scoring"],
  }},
];

function helpFor(path: string): Help {
  const hit = HELP.find((h) => path.startsWith(h.match));
  return hit?.help ?? {
    title: "RealTrack",
    body: "Your real-estate call QA + lead intelligence workspace. Pick a section from the sidebar to get started.",
  };
}

export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const help = helpFor(pathname || "/dashboard");

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  // Close when navigating to a new page.
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Help for this page"
        title="What is this page?"
        style={{
          width: 32, height: 32, borderRadius: 9,
          background: open ? "#EEF1F6" : "#F4EFE7", border: "1px solid #E5E7EB",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: open ? NAVY : SLATE, transition: "all 120ms ease",
        }}
      >
        <HelpCircle size={15} />
      </button>

      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute", top: 40, right: 0, width: 300, zIndex: 60,
            background: T.surface1, border: "1px solid rgba(35,43,58,0.12)", borderRadius: 12,
            boxShadow: "0 16px 48px rgba(35,43,58,0.18)", padding: 16,
          }}
          className="animate-scale"
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>{help.title}</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: SLATE, lineHeight: 0 }}>
              <X size={14} />
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.6, margin: 0 }}>{help.body}</p>
          {help.tips && help.tips.length > 0 && (
            <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {help.tips.map((t, i) => (
                <li key={i} style={{ display: "flex", gap: 7, fontSize: 12, color: NAVY }}>
                  <span style={{ color: "#2F6BFF", fontWeight: 800 }}>›</span>{t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
