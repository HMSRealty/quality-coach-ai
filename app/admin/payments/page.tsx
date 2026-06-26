"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CreditCard, RefreshCw, CheckCircle2, ExternalLink, Loader2, Clock, AlertCircle, X } from "lucide-react";
import { Card } from "@/app/_components/Card";

interface Invoice {
  id: string;
  user_id: string;
  plan_tier: string;
  amount_usd: number | null;
  receipt_url: string;
  status: string;
  created_at: string;
  profiles?: { email: string } | null;
}

const PLAN_LIMITS: Record<string, number> = { starter: 100, professional: 500, enterprise: 99999 };
const PLAN_COLORS: Record<string, string>  = {
  free: "var(--text-3)", starter: "var(--emerald)", professional: "var(--brand-400)", enterprise: "var(--violet)",
};

export default function AdminPaymentsPage() {
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [loading, setLoading]     = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [previewUrl, setPreview]  = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("invoices").select("*, profiles(email)").order("created_at", { ascending: false });
    if (data) setInvoices(data as Invoice[]);
    setLoading(false);
  };

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4000);
  };

  const approve = async (inv: Invoice) => {
    setApproving(inv.id);
    try {
      const res = await fetch("/api/admin/approve-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: inv.user_id, invoiceId: inv.id, planTier: inv.plan_tier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(`✓ ${inv.profiles?.email ?? "User"} activated on ${inv.plan_tier}.`, true);
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Approval failed", false);
    }
    setApproving(null);
  };

  const pending = invoices.filter(i => i.status === "submitted_verification").length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 100,
          padding: "12px 18px", borderRadius: "var(--r-lg)",
          display: "flex", alignItems: "center", gap: 10,
          background: toast.ok ? "var(--emerald)" : "var(--rose)",
          color: "#fff", fontSize: 13, fontWeight: 600,
          boxShadow: "var(--shadow-lg)",
          animation: "slideInRight var(--t-slow) var(--ease-out)",
        }}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Receipt preview overlay */}
      {previewUrl && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}
        onClick={() => setPreview(null)}
        >
          <div style={{ position: "relative", maxWidth: 800, width: "100%", maxHeight: "90vh" }}>
            <button onClick={() => setPreview(null)} style={{
              position: "absolute", top: -12, right: -12, zIndex: 10,
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--surface-3)", border: "1px solid var(--border-3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-1)",
            }}>
              <X size={15} />
            </button>
            <img src={previewUrl} alt="Receipt" style={{ width: "100%", borderRadius: "var(--r-lg)", objectFit: "contain" }} />
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 4 }}>Payment Approvals</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Review bank transfer receipts and activate user subscriptions.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {pending > 0 && (
            <span style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: "var(--r-full)",
              background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.25)",
              fontSize: 11, fontWeight: 700, color: "var(--amber-lt)",
            }}>
              <Clock size={11} /> {pending} pending
            </span>
          )}
          <button onClick={load} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
            borderRadius: "var(--r-md)", background: "var(--surface-3)",
            border: "1px solid var(--border-2)", color: "var(--text-2)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          { label: "Total",      value: invoices.length,                                              color: "var(--text-1)" },
          { label: "Pending",    value: invoices.filter(i => i.status === "submitted_verification").length, color: "var(--amber-lt)" },
          { label: "Approved",   value: invoices.filter(i => i.status === "paid").length,            color: "var(--emerald)" },
          { label: "Revenue",    value: `$${invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount_usd ?? 0), 0).toLocaleString()}`, color: "var(--brand-400)" },
        ].map(({ label, value, color }) => (
          <Card key={label} style={{ padding: "14px 18px" }}>
            <p style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{loading ? "—" : value}</p>
          </Card>
        ))}
      </div>

      {/* Invoice table */}
      <Card style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--brand-400)", margin: "0 auto 10px" }} />
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>Loading invoices...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface-4)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CreditCard size={22} color="var(--text-3)" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>No invoices yet</p>
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>Payment submissions from users will appear here.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--border-1)" }}>
                {["Submitted", "User", "Plan", "Amount", "Receipt", "Status", "Action"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => {
                const isNew = inv.status === "submitted_verification";
                return (
                  <tr key={inv.id}
                    style={{
                      borderBottom: i < invoices.length - 1 ? "1px solid var(--border-1)" : "none",
                      background: isNew ? "rgba(245,158,11,0.02)" : "transparent",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-3)"}
                    onMouseLeave={e => e.currentTarget.style.background = isNew ? "rgba(245,158,11,0.02)" : "transparent"}
                  >
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                      {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--brand-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--brand-400)", flexShrink: 0 }}>
                          {(inv.profiles?.email ?? "?").slice(0, 2).toUpperCase()}
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{inv.profiles?.email ?? "—"}</p>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div>
                        <span style={{
                          padding: "2px 8px", borderRadius: "var(--r-full)",
                          fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                          background: `${PLAN_COLORS[inv.plan_tier] ?? "var(--text-3)"}18`,
                          color: PLAN_COLORS[inv.plan_tier] ?? "var(--text-3)",
                        }}>{inv.plan_tier}</span>
                        <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>
                          {(PLAN_LIMITS[inv.plan_tier] ?? 0) === 99999 ? "Unlimited" : PLAN_LIMITS[inv.plan_tier]?.toLocaleString()} analyses/mo
                        </p>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-1)", fontSize: 14 }}>
                      ${inv.amount_usd?.toFixed(2) ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {inv.receipt_url ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setPreview(inv.receipt_url)} style={{
                            padding: "4px 8px", borderRadius: "var(--r-sm)",
                            background: "var(--surface-3)", border: "1px solid var(--border-2)",
                            color: "var(--text-2)", fontSize: 11, cursor: "pointer",
                          }}>
                            Preview
                          </button>
                          <a href={inv.receipt_url} target="_blank" rel="noopener noreferrer" style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "4px 8px", borderRadius: "var(--r-sm)",
                            background: "var(--surface-3)", border: "1px solid var(--border-2)",
                            color: "var(--sky-lt)", fontSize: 11, textDecoration: "none",
                          }}>
                            <ExternalLink size={10} /> Open
                          </a>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-4)" }}>No file</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 8px", borderRadius: "var(--r-full)", fontSize: 11, fontWeight: 700,
                        background: inv.status === "paid" ? "var(--emerald-dim)" : inv.status === "submitted_verification" ? "var(--amber-dim)" : "var(--surface-4)",
                        color: inv.status === "paid" ? "var(--emerald)" : inv.status === "submitted_verification" ? "var(--amber-lt)" : "var(--text-3)",
                      }}>
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor" }} />
                        {inv.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {inv.status !== "paid" && (
                        <button
                          onClick={() => approve(inv)}
                          disabled={approving === inv.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "7px 14px", borderRadius: "var(--r-md)",
                            background: approving === inv.id ? "var(--emerald-dim)" : "var(--emerald)",
                            color: approving === inv.id ? "var(--emerald)" : "#000",
                            fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                            whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
                            opacity: approving === inv.id ? 0.7 : 1,
                          }}
                        >
                          {approving === inv.id
                            ? <><Loader2 size={12} className="animate-spin" /> Activating...</>
                            : <><CheckCircle2 size={12} /> Approve & Activate</>
                          }
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
