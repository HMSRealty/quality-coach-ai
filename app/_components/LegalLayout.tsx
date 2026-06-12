"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalLayout({ title, lastUpdated, children }: { title: string; lastUpdated: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#0F172A" }}>
      <nav style={{ borderBottom: "1px solid #E2E8F0", padding: "16px 28px", background: "#fff" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#475569", fontWeight: 700, textDecoration: "none" }}>
            <ArrowLeft size={14} /> Back to RealTrack
          </Link>
          <div style={{ fontSize: 12, color: "#64748B" }}>Last updated: {lastUpdated}</div>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 28px 80px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, letterSpacing: "-0.02em" }}>{title}</h1>
        <div style={{ height: 4, width: 60, background: "linear-gradient(90deg,#0EA5E9,#0284C7)", borderRadius: 999, marginBottom: 36 }} />
        <div style={{ fontSize: 15, lineHeight: 1.75, color: "#334155" }}>
          {children}
        </div>
      </main>

      <footer style={{ borderTop: "1px solid #E2E8F0", padding: "24px 28px", textAlign: "center", color: "#64748B", fontSize: 12 }}>
        <Link href="/terms" style={{ color: "#475569", marginRight: 14, textDecoration: "none" }}>Terms</Link>
        <Link href="/privacy" style={{ color: "#475569", marginRight: 14, textDecoration: "none" }}>Privacy</Link>
        <Link href="/refund" style={{ color: "#475569", textDecoration: "none" }}>Refund Policy</Link>
        <div style={{ marginTop: 8 }}>© {new Date().getFullYear()} RealTrack. <a href="mailto:info@realtrack.app" style={{ color: "#0284C7", fontWeight: 600 }}>info@realtrack.app</a></div>
      </footer>
    </div>
  );
}

// Standardised heading + paragraph helpers so the three legal pages stay
// visually consistent without copy-pasting Tailwind classes.
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 32, marginBottom: 12, color: "#0F172A" }}>{children}</h2>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 14 }}>{children}</p>;
}
export function UL({ children }: { children: React.ReactNode }) {
  return <ul style={{ paddingLeft: 22, marginBottom: 14 }}>{children}</ul>;
}
export function LI({ children }: { children: React.ReactNode }) {
  return <li style={{ marginBottom: 6 }}>{children}</li>;
}
