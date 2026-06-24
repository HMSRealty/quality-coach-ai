"use client";

// Public status page. Reads /api/health and auto-refreshes every 30 seconds.
// Link to this from social bios, footers, etc. — gives customers visibility
// without needing a separate status.io subscription.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ArrowLeft } from "lucide-react";

interface Check { name: string; ok: boolean; ms: number; detail?: string; }
interface Health { ok: boolean; timestamp: string; checks: Check[]; }

const LABELS: Record<string, string> = {
  supabase: "Database",
  storage: "File Storage",
  gemini_key: "AI (Gemini)",
  encryption_key: "Encryption",
  sentry_dsn: "Error Tracking",
};

export default function StatusPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      const j = await r.json() as Health;
      setData(j);
    } catch {
      setData({ ok: false, timestamp: new Date().toISOString(), checks: [] });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const overallOk = data?.ok ?? false;

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#15302e" }}>
      <nav style={{ borderBottom: "1px solid #E2E8F0", padding: "16px 28px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#475569", fontWeight: 700, textDecoration: "none" }}>
            <ArrowLeft size={14} /> RealTrack
          </Link>
          <button onClick={load} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 28px" }}>
        {/* Big status banner */}
        <div style={{
          padding: 28, borderRadius: 18, marginBottom: 28,
          background: overallOk ? "linear-gradient(135deg,#ECFDF5,#D1FAE5)" : "linear-gradient(135deg,#FEF2F2,#FECACA)",
          border: `1px solid ${overallOk ? "#A7F3D0" : "#FECACA"}`,
          display: "flex", alignItems: "center", gap: 18,
        }}>
          {overallOk ? <CheckCircle2 size={42} color="#0a5f52" /> : <XCircle size={42} color="#DC2626" />}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: overallOk ? "#065F46" : "#7F1D1D" }}>
              {overallOk ? "All systems operational" : "We're investigating an issue"}
            </h1>
            <p style={{ fontSize: 13, color: overallOk ? "#047857" : "#991B1B", marginTop: 4 }}>
              {data ? `Last checked: ${new Date(data.timestamp).toLocaleString()}` : "Checking..."}
            </p>
          </div>
        </div>

        {/* Per-system check */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          {(data?.checks || []).map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "16px 18px",
              borderBottom: i < (data!.checks.length - 1) ? "1px solid #F1F5F9" : "none",
            }}>
              {c.ok ? <CheckCircle2 size={18} color="#0a5f52" /> : <XCircle size={18} color="#DC2626" />}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{LABELS[c.name] || c.name}</p>
                {c.detail && <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{c.detail}</p>}
              </div>
              {c.ms > 0 && <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "var(--font-mono)" }}>{c.ms}ms</span>}
            </div>
          ))}
          {loading && !data && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "#0a5f52" }} />
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#64748B", marginTop: 22, textAlign: "center" }}>
          Issue? Email <a href="mailto:info@realtrack.app" style={{ color: "#0a5f52", fontWeight: 700, textDecoration: "none" }}>info@realtrack.app</a>
        </p>
      </main>
    </div>
  );
}
