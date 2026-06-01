"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Search, RefreshCw, BarChart3, Loader2 } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  plan_tier: string;
  payment_status: string;
  is_active: boolean;
  monthly_lead_limit: number;
  current_month_usage: number;
  role: string;
  lead_count?: number;
  campaign_count?: number;
}

const C: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14 };

export default function AdminProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [planFilter, setPlan]   = useState("all");

  useEffect(() => { load(); }, []);
  useEffect(() => {
    let r = profiles;
    if (planFilter !== "all") r = r.filter(p => p.plan_tier === planFilter);
    if (search) { const q = search.toLowerCase(); r = r.filter(p => p.email.toLowerCase().includes(q)); }
    setFiltered(r);
  }, [profiles, search, planFilter]);

  const load = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from("profiles").select("*").order("email");
    if (!pData) { setLoading(false); return; }

    // Enrich with lead + campaign counts
    const enriched = await Promise.all(
      (pData as Profile[]).map(async (p) => {
        const [lRes, cRes] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("user_id", p.id),
          supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", p.id),
        ]);
        return { ...p, lead_count: lRes.count ?? 0, campaign_count: cRes.count ?? 0 };
      })
    );

    setProfiles(enriched);
    setFiltered(enriched);
    setLoading(false);
  };

  const planColors: Record<string, string> = {
    free: "var(--text-muted)", starter: "var(--accent)", professional: "var(--blue)", enterprise: "#a855f7",
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Header */}
      <div style={{ ...C, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 }}>Admin</p>
          <p style={{ fontSize: 22, fontWeight: 900 }}>All Profiles</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>User account registry with usage and plan details.</p>
        </div>
        <button onClick={load} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
          borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)",
          color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontWeight: 600,
        }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email..."
            style={{
              width: "100%", background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "10px 12px 10px 30px", fontSize: 13, color: "var(--text)", outline: "none",
            }}
          />
        </div>
        <select
          value={planFilter}
          onChange={e => setPlan(e.target.value)}
          style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--text)", outline: "none", cursor: "pointer",
          }}
        >
          <option value="all">All Plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Profile grid */}
      {loading ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-dim)", margin: "0 auto" }} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 14 }}>
          {filtered.map(p => {
            const usagePct = Math.min(100, Math.round((p.current_month_usage / p.monthly_lead_limit) * 100));
            const planColor = planColors[p.plan_tier] ?? "var(--text-muted)";
            return (
              <div key={p.id} style={{ ...C, padding: 20 }}>
                {/* Avatar + info */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "var(--accent-dim)", border: "1px solid var(--accent-glow)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: "var(--accent)", flexShrink: 0,
                  }}>
                    {p.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ overflow: "hidden" }}>
                    <p style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.email}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "capitalize",
                        padding: "1px 7px", borderRadius: 99,
                        background: `${planColor}18`, color: planColor,
                      }}>
                        {p.plan_tier}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: p.is_active ? "var(--accent)" : "var(--red)",
                      }}>
                        {p.is_active ? "● Active" : "● Inactive"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    ["Leads", p.lead_count ?? 0, <BarChart3 size={12} />],
                    ["Campaigns", p.campaign_count ?? 0, <Users size={12} />],
                  ].map(([label, val, icon]) => (
                    <div key={String(label)} style={{
                      background: "var(--surface)", borderRadius: 9, padding: "10px 12px",
                      display: "flex", flexDirection: "column", gap: 4,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-dim)", fontSize: 11 }}>
                        {icon as React.ReactNode} {label}
                      </div>
                      <p style={{ fontSize: 18, fontWeight: 800 }}>{String(val)}</p>
                    </div>
                  ))}
                </div>

                {/* Usage bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "var(--text-dim)" }}>
                    <span>Monthly Usage</span>
                    <span>{p.current_month_usage}/{p.monthly_lead_limit}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 99, width: `${usagePct}%`,
                      background: usagePct > 85 ? "var(--red)" : "var(--accent)",
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
