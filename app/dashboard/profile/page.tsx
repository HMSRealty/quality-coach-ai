"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { ProfileDetailsCard } from "@/app/_components/ProfileDetailsCard";
import {
  User, Key, BarChart3, CreditCard, Shield,
  Save, Loader2, CheckCircle2, AlertCircle,
  Eye, EyeOff, ExternalLink, Zap, ChevronRight,
  TrendingUp, Calendar, Phone, FolderCog,
} from "lucide-react";
import Link from "next/link";

type Tab = "overview" | "api" | "usage" | "billing";

interface Profile {
  id: string;
  email: string;
  gemini_api_key?: string;
  plan_tier: string;
  payment_status: string;
  is_active: boolean;
  monthly_lead_limit: number;
  current_month_usage: number;
  role: string;
  created_at?: string;
}

const PLAN_DETAILS: Record<string, { name: string; price: string; color: string; analyses: string; features: string[] }> = {
  free:         { name: "Free",         price: "$0/mo",    color: "var(--text-3)",    analyses: "10",        features: ["10 analyses/month", "1 campaign", "Basic scoring"] },
  starter:      { name: "Starter",      price: "$350/mo",    color: "var(--emerald)",   analyses: "500",       features: ["500 analyses/month", "3 campaigns", "Gemini 2.5 Flash", "CSV export"] },
  professional: { name: "Professional", price: "$750/mo",    color: "var(--brand-400)", analyses: "2,000",     features: ["2,000 analyses/month", "Unlimited campaigns", "Gemini 2.5 Pro", "Compliance trails", "Re-analyze"] },
  enterprise:   { name: "Enterprise",   price: "$1,500/mo",  color: "var(--violet)",    analyses: "Unlimited", features: ["Unlimited analyses", "Multi-tenant", "Custom API key", "White-label", "SLA", "Dedicated manager"] },
};

export default function ProfilePage() {
  const [tab, setTab]           = useState<Tab>("overview");
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [apiKey, setApiKey]     = useState("");
  const [showKey, setShowKey]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [callCount, setCallCount] = useState(0);
  const [campCount, setCampCount] = useState(0);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [pRes, lRes, cRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

    if (pRes.data) { setProfile(pRes.data as Profile); setApiKey(pRes.data.gemini_api_key ?? ""); }
    setCallCount(lRes.count ?? 0);
    setCampCount(cRes.count ?? 0);
    setLoading(false);
  };

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const saveApiKey = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ gemini_api_key: apiKey || null }).eq("id", profile.id);
    if (error) showToast(error.message, false);
    else showToast("API key saved successfully.", true);
    setSaving(false);
  };

  if (loading) return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {[120, 80, 300].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: "var(--r-lg)" }} className="skeleton" />
      ))}
    </div>
  );

  if (!profile) return null;

  const planDet = PLAN_DETAILS[profile.plan_tier] ?? PLAN_DETAILS.free;
  const usagePct = Math.min(100, Math.round((profile.current_month_usage / Math.max(profile.monthly_lead_limit, 1)) * 100));
  const initials = profile.email.slice(0, 2).toUpperCase();

  // API Config tab is restricted to admins/owners only
  const isAdmin = profile.role === "admin";
  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview",  icon: User },
    ...(isAdmin ? [{ id: "api" as Tab,      label: "API Config",icon: Key }] : []),
    { id: "usage",    label: "Usage",     icon: BarChart3 },
    { id: "billing",  label: "Billing",   icon: CreditCard },
  ];

  // If a non-admin somehow lands on the api tab, kick them back
  if (tab === "api" && !isAdmin) {
    setTimeout(() => setTab("overview"), 0);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 100,
          padding: "12px 18px", borderRadius: "var(--r-lg)",
          display: "flex", alignItems: "center", gap: 10,
          background: toast.ok ? "var(--emerald)" : "var(--rose)",
          color: "#fff", fontSize: 13, fontWeight: 600,
          boxShadow: "var(--shadow-lg)",
          animation: "slideInRight var(--t-slow) var(--ease-out) both",
        }}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Profile Hero ── */}
      <Card>
        <div style={{
          padding: "28px 28px 0",
          background: "linear-gradient(180deg, var(--brand-dim) 0%, transparent 100%)",
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 24 }}>
            {/* Avatar */}
            <div style={{
              width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, var(--brand-500), var(--brand-600))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 900, color: "#fff",
              boxShadow: "0 4px 20px var(--brand-glow)",
              border: "3px solid var(--surface-2)",
            }}>{initials}</div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)" }}>
                  {profile.email.split("@")[0]}
                </h1>
                {profile.role === "admin" && (
                  <span style={{
                    padding: "2px 8px", borderRadius: "var(--r-full)",
                    background: "var(--rose-dim)", color: "var(--rose-lt)",
                    fontSize: 10, fontWeight: 700,
                  }}>ADMIN</span>
                )}
                <span style={{
                  padding: "2px 8px", borderRadius: "var(--r-full)", fontSize: 10, fontWeight: 700,
                  textTransform: "capitalize",
                  background: `${planDet.color}18`, color: planDet.color,
                }}>{profile.plan_tier}</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14 }}>{profile.email}</p>

              {/* Stat chips */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { icon: Phone,     label: `${callCount.toLocaleString()} Calls Analyzed` },
                  { icon: FolderCog, label: `${campCount} Campaigns` },
                  { icon: Zap,       label: `${profile.current_month_usage}/${profile.monthly_lead_limit} This Month` },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-3)" }}>
                    <Icon size={12} /> {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Status badge */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: "var(--r-full)",
              background: profile.is_active ? "var(--emerald-dim)" : "var(--rose-dim)",
              border: `1px solid ${profile.is_active ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)"}`,
              fontSize: 12, fontWeight: 700,
              color: profile.is_active ? "var(--emerald)" : "var(--rose-lt)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              {profile.is_active ? "Active" : "Inactive"}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-2)", marginTop: 8 }}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: tab === id ? 600 : 400,
                  color: tab === id ? "var(--brand-400)" : "var(--text-3)",
                  borderBottom: `2px solid ${tab === id ? "var(--brand-400)" : "transparent"}`,
                  marginBottom: -1,
                  transition: "color var(--t-fast), border-color var(--t-fast)",
                }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: "24px 28px" }}>

          {/* Overview tab */}
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <ProfileDetailsCard />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  { label: "Email",          value: profile.email },
                  { label: "Account Status", value: profile.is_active ? "Active" : "Suspended" },
                  { label: "Plan",           value: planDet.name },
                  { label: "Payment Status", value: profile.payment_status.replace(/_/g, " ") },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    padding: "14px 16px", borderRadius: "var(--r-md)",
                    background: "var(--surface-3)", border: "1px solid var(--border-1)",
                  }}>
                    <p style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                      {label}
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", textTransform: "capitalize" }}>{value}</p>
                  </div>
                ))}
              </div>

              {!profile.gemini_api_key && isAdmin && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "14px 16px", borderRadius: "var(--r-md)",
                  background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.2)",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <AlertCircle size={16} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--amber-lt)" }}>Gemini API Key Required</p>
                      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                        Add your Gemini API key to start analyzing calls.
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setTab("api")} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 14px", borderRadius: "var(--r-md)",
                    background: "var(--amber)", color: "#000",
                    fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                  }}>
                    Add Key <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* API Config tab */}
          {tab === "api" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>Gemini API Key</h3>
                <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.65 }}>
                  Your personal Gemini API key is used to power AI analysis. Get yours free at{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                    style={{ color: "var(--brand-400)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    Google AI Studio <ExternalLink size={11} />
                  </a>
                </p>
              </div>

              <div style={{
                padding: "16px 18px", borderRadius: "var(--r-md)",
                background: "var(--surface-3)", border: "1px solid var(--border-2)",
              }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 10 }}>
                  API Key
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="AIza..."
                      style={{
                        width: "100%", padding: "10px 40px 10px 14px",
                        background: "var(--surface-4)",
                        fontFamily: "var(--font-mono)", fontSize: 13,
                      }}
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", cursor: "pointer", color: "var(--text-3)",
                        display: "flex", padding: 0,
                      }}
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button
                    onClick={saveApiKey}
                    disabled={saving}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 18px", borderRadius: "var(--r-md)",
                      background: "var(--brand-500)", color: "#fff",
                      fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                      opacity: saving ? 0.7 : 1, whiteSpace: "nowrap",
                    }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Key
                  </button>
                </div>
                {apiKey && (
                  <p style={{ fontSize: 11, color: "var(--emerald)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={11} /> Key is configured · calls will be processed with this key
                  </p>
                )}
              </div>

              <div style={{
                padding: "14px 16px", borderRadius: "var(--r-md)",
                background: "var(--brand-dim)", border: "1px solid var(--border-brand)",
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-300)", marginBottom: 4 }}>
                  How it works
                </p>
                <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.65 }}>
                  Your API key is stored encrypted and only used on our secure servers when processing your calls.
                  It is never exposed to the browser or third parties.
                </p>
              </div>
            </div>
          )}

          {/* Usage tab */}
          {tab === "usage" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>Monthly Analyses Used</p>
                    <p style={{ fontSize: 28, fontWeight: 900, color: "var(--text-1)" }}>
                      {profile.current_month_usage}
                      <span style={{ fontSize: 16, fontWeight: 400, color: "var(--text-3)" }}>
                        {" "}/ {profile.monthly_lead_limit}
                      </span>
                    </p>
                  </div>
                  <p style={{
                    fontSize: 22, fontWeight: 900,
                    color: usagePct > 85 ? "var(--rose)" : usagePct > 60 ? "var(--amber)" : "var(--emerald)",
                  }}>
                    {usagePct}%
                  </p>
                </div>
                <div style={{ height: 8, borderRadius: "var(--r-full)", background: "var(--surface-4)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "var(--r-full)",
                    width: `${usagePct}%`,
                    background: usagePct > 85
                      ? "linear-gradient(90deg, var(--amber), var(--rose))"
                      : "linear-gradient(90deg, var(--brand-500), var(--brand-400))",
                    transition: "width 0.8s var(--ease-out)",
                  }} />
                </div>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
                  {profile.monthly_lead_limit - profile.current_month_usage} analyses remaining this month
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Total Calls", value: callCount, icon: Phone,     color: "var(--brand-400)" },
                  { label: "Campaigns",   value: campCount, icon: FolderCog, color: "var(--emerald)" },
                  { label: "This Month",  value: profile.current_month_usage, icon: TrendingUp, color: "var(--amber)" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} style={{
                    padding: "16px 18px", borderRadius: "var(--r-md)",
                    background: "var(--surface-3)", border: "1px solid var(--border-1)",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "var(--r-md)",
                      background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={16} color={color} />
                    </div>
                    <div>
                      <p style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{value}</p>
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>{label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {usagePct > 80 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "14px 16px", borderRadius: "var(--r-md)",
                  background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.2)",
                }}>
                  <p style={{ fontSize: 13, color: "var(--amber-lt)", fontWeight: 500 }}>
                    You&apos;ve used {usagePct}% of your monthly limit. Consider upgrading.
                  </p>
                  <Link href="/landing#pricing" style={{
                    padding: "7px 14px", borderRadius: "var(--r-md)",
                    background: "var(--amber)", color: "#000",
                    fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
                  }}>
                    Upgrade Plan
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Billing tab */}
          {tab === "billing" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Current plan */}
              <div style={{
                padding: "20px", borderRadius: "var(--r-lg)",
                background: "var(--surface-3)", border: `1px solid ${planDet.color}30`,
                position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%",
                  background: `${planDet.color}10`, pointerEvents: "none",
                }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>
                      Current Plan
                    </p>
                    <p style={{ fontSize: 24, fontWeight: 900, color: planDet.color, marginBottom: 4 }}>{planDet.name}</p>
                    <p style={{ fontSize: 14, color: "var(--text-2)" }}>{planDet.price}</p>
                  </div>
                  <span style={{
                    padding: "4px 12px", borderRadius: "var(--r-full)",
                    background: profile.payment_status === "paid" ? "var(--emerald-dim)" : "var(--amber-dim)",
                    color: profile.payment_status === "paid" ? "var(--emerald)" : "var(--amber-lt)",
                    fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                  }}>
                    {profile.payment_status.replace(/_/g, " ")}
                  </span>
                </div>
                <div style={{ height: 1, background: "var(--border-2)", margin: "16px 0" }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {planDet.features.map(f => (
                    <span key={f} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-2)" }}>
                      <CheckCircle2 size={11} color={planDet.color} /> {f}
                    </span>
                  ))}
                </div>
              </div>

              {profile.payment_status !== "paid" && (
                <Link href="/landing#pricing" style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 20px", borderRadius: "var(--r-lg)",
                  background: "var(--brand-dim)", border: "1px solid var(--border-brand)",
                  textDecoration: "none",
                }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--brand-300)", marginBottom: 4 }}>
                      Upgrade to unlock full access
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                      Plans start at $49/month. Activate via ACH/Wire transfer.
                    </p>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: "var(--r-md)",
                    background: "var(--brand-500)", color: "#fff",
                    fontSize: 12, fontWeight: 700,
                  }}>
                    View Plans <ChevronRight size={13} />
                  </div>
                </Link>
              )}

              {/* Payment method info */}
              <div style={{
                padding: "16px 18px", borderRadius: "var(--r-md)",
                background: "var(--surface-3)", border: "1px solid var(--border-2)",
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10 }}>Payment Method</p>
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>
                  All plans are paid via ACH/Wire bank transfer.{" "}
                  <Link href="/landing#pricing" style={{ color: "var(--brand-400)" }}>Learn more</Link>
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
