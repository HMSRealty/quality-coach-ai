"use client";

// Animated horizontal pipeline showing the lead moving through submission steps.
// Used by the public + internal submit forms while the AI is verifying.
import { Check, Loader2 } from "lucide-react";
import { T } from "@/app/_components/tokens";

type Step = { key: string; label: string };
const DEFAULT_STEPS: Step[] = [
  { key: "submit",   label: "Submit"   },
  { key: "fetch",    label: "Property" },
  { key: "upload",   label: "Recording"},
  { key: "ai",       label: "AI Review"},
  { key: "verdict",  label: "Verdict"  },
];

interface Props { current: number; steps?: Step[] }

export function PipelineProgress({ current, steps = DEFAULT_STEPS }: Props) {
  // current = index of the IN-PROGRESS step (0..N-1). >= N means complete.
  const N = steps.length;
  const pct = N <= 1 ? 100 : Math.max(0, Math.min(N - 1, current)) / (N - 1) * 100;
  return (
    <div style={{ width: "100%", padding: "10px 4px" }}>
      {/* Rail */}
      <div style={{ position: "relative", height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden", marginBottom: 16 }}>
        <span style={{
          position: "absolute", inset: 0, width: `${pct}%`,
          background: T.gradPrimary,
          boxShadow: "0 0 20px var(--magenta-glow)",
          borderRadius: 999,
          transition: "width 700ms cubic-bezier(0.16, 1, 0.30, 1)",
        }} />
        {/* Traveling pulse to make the "movement" visible */}
        <span style={{
          position: "absolute", top: -2, left: `calc(${pct}% - 7px)`,
          width: 14, height: 10, borderRadius: 999,
          background: "#0A0A0E",
          boxShadow: "0 0 14px var(--magenta)",
          transition: "left 700ms cubic-bezier(0.16, 1, 0.30, 1)",
        }} />
      </div>
      {/* Step labels */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s.key} style={{
              flex: 1, textAlign: "center",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: done ? T.gradPrimary : active ? "var(--magenta-dim)" : "var(--surface-3)",
                color: done ? "#fff" : active ? "var(--magenta)" : "var(--text-3)",
                border: done ? "none" : `1px solid var(--border-2)`,
                transition: "all 220ms ease",
                boxShadow: active ? "0 0 14px var(--magenta-glow)" : "none",
              }}>
                {done ? <Check size={11} /> : active ? <Loader2 size={11} className="animate-spin" /> : <span style={{ fontSize: 9, fontWeight: 800 }}>{i + 1}</span>}
              </span>
              <span style={{
                fontSize: 10.5, fontWeight: done || active ? 800 : 600,
                color: done ? "var(--magenta)" : active ? "var(--text-1)" : "var(--text-3)",
                letterSpacing: "0.02em",
              }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
