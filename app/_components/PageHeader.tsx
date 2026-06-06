"use client";

// Clickable page header that doubles as a breadcrumb.
//   <PageHeader title="Leads" backTo="/dashboard/calls" subtitle="…" />
// Clicking the title navigates to backTo (default "/dashboard").
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, backTo = "/dashboard", backLabel, right }: Props) {
  return (
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
      <div>
        {backLabel && (
          <Link href={backTo} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 700, color: "var(--text-3)",
            textDecoration: "none", letterSpacing: "0.04em",
            textTransform: "uppercase", marginBottom: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--magenta)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <ChevronLeft size={12} /> {backLabel}
          </Link>
        )}
        <Link href={backTo} style={{ textDecoration: "none", color: "inherit" }}>
          <h1 style={{
            fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em",
            color: "var(--text-1)", cursor: "pointer", transition: "color 180ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--magenta)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-1)")}
          >{title}</h1>
        </Link>
        {subtitle && (
          <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>{subtitle}</p>
        )}
      </div>
      {right && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>}
    </header>
  );
}
