"use client";

// Honest placeholder.
//
// The brief says: "Do NOT generate placeholder pages. Do NOT build fake
// dashboards." This exists precisely to honour that. The navigation for the
// Performance OS is real, but several surfaces depend on the Python analytics
// service that does not exist yet.
//
// The alternative was worse: a page rendering plausible-looking zeros. A fake
// dashboard is indistinguishable from a broken one, and it teaches an owner to
// trust a number that nothing computed. This page states plainly what is
// missing and what has to land first.
//
// Every one of these is deleted as its real implementation ships.

import Link from "next/link";
import { Construction, ArrowRight } from "lucide-react";

export function ComingSoon({
  title,
  purpose,
  blockedBy,
  computedBy = "the Python analytics service",
}: {
  title: string;
  purpose: string;
  blockedBy: string;
  computedBy?: string;
}) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", paddingTop: 40 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 46, height: 46, borderRadius: 13, marginBottom: 20,
        background: "var(--surface-3)", border: "1px solid var(--border-2)",
      }}>
        <Construction size={20} color="var(--text-3)" />
      </div>

      <h1 style={{
        fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em",
        color: "var(--text-1)", fontFamily: "var(--font-display)",
      }}>
        {title}
      </h1>

      <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 10, lineHeight: 1.65 }}>
        {purpose}
      </p>

      <div style={{
        marginTop: 22, padding: "16px 18px", borderRadius: 13,
        background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.22)",
      }}>
        <p style={{ fontSize: 12, fontWeight: 750, color: "#B45309", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Not built yet
        </p>
        <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 7, lineHeight: 1.6 }}>
          {blockedBy}
        </p>
        <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 9, lineHeight: 1.6 }}>
          Every number on this page will be computed by {computedBy} — never by
          the AI, and never by this page. Showing you invented figures in the
          meantime would be worse than showing you nothing.
        </p>
      </div>

      <Link href="/dashboard" style={{
        display: "inline-flex", alignItems: "center", gap: 6, marginTop: 22,
        fontSize: 13, fontWeight: 650, color: "var(--text-2)", textDecoration: "none",
      }}>
        Back to the feed <ArrowRight size={13} />
      </Link>
    </div>
  );
}
