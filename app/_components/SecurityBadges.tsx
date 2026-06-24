"use client";

// Enterprise trust strip — SOC 2 / GDPR / encryption / RLS badges. Pure visual.
import { ShieldCheck, Lock, Database, Cookie, KeyRound, FileCheck2 } from "lucide-react";
import { T } from "@/app/_components/tokens";

const BADGES = [
  { icon: ShieldCheck, label: "SOC 2 Type II", sub: "Independently audited" },
  { icon: Cookie,      label: "GDPR Ready",    sub: "Data subject rights" },
  { icon: Lock,        label: "AES-256 at rest", sub: "Encrypted storage" },
  { icon: KeyRound,    label: "TLS 1.3 in transit", sub: "End-to-end transport" },
  { icon: Database,    label: "RLS isolation",  sub: "Postgres row policies" },
  { icon: FileCheck2,  label: "Audit logs",     sub: "Tamper-evident timeline" },
];

export function SecurityBadges() {
  return (
    <section className="reveal" style={{
      background: T.surface1, border: `1px solid var(--border-2)`,
      borderRadius: 18, padding: 22, boxShadow: "var(--shadow-md)",
      position: "relative", overflow: "hidden",
    }}>
      {/* magenta accent gleam */}
      <span style={{
        position: "absolute", top: -1, left: 0, right: 0, height: 2,
        background: T.gradPrimary, opacity: 0.85,
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 10, background: T.gradPrimary,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 16px rgba(14,124,107,0.30)",
        }}>
          <ShieldCheck size={15} color="#fff" />
        </span>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>Enterprise-grade security</p>
          <p style={{ fontSize: 12, color: "var(--text-2)" }}>
            Customer data is isolated per tenant, encrypted, and access-logged at every layer.
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {BADGES.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.label} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px", borderRadius: 12,
              background: "var(--surface-3)", border: "1px solid var(--border-1)",
              transition: "all 200ms var(--spring-heavy)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-brand)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-1)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <span style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: "var(--surface-1)", border: `1px solid var(--border-2)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.magenta,
              }}>
                <Icon size={15} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)" }}>{b.label}</p>
                <p style={{ fontSize: 10.5, color: "var(--text-2)" }}>{b.sub}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
