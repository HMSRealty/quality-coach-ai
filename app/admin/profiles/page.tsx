"use client";

// Admin → Profiles: redesigned. Table-first layout with summary cards,
// search, plan filter, sortable columns, per-row actions (Act as / Delete).
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { startImpersonation } from "@/lib/impersonation";
import { T } from "@/app/_components/tokens";
import {
  Users, Search, RefreshCw, Loader2, Eye, Trash2, CheckCircle2, AlertCircle,
  Crown, ArrowUpDown, BarChart3, FolderCog, Mail, ShieldCheck, Clock,
} from "lucide-react";

const NAVY = T.text1;
const SLATE = T.text2;

interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  plan_tier: string;
  payment_status: string;
  is_active: boolean;
  monthly_lead_limit: number;
  current_month_usage: number;
  role: string;
  parent_user_id?: string | null;
  created_at?: string;
  lead_count?: number;
  campaign_count?: number;
  is_approved?: boolean;
}

type SortKey = "email" | "plan" | "leads" | "campaigns" | "usage" | "created";

const PLAN_COLOR: Record<string, string> = {
  free: T.slate, starter: T.emerald, professional: T.teal, enterprise: T.violet,
};

export default function AdminProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlan] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (!pData) { setLoading(false); return; }

    // Avoid the N+1: pull all owner ids for leads/campaigns in TWO queries total,
    // then tally counts client-side instead of 2 queries per profile.
    const [{ data: leadRows }, { data: campRows }] = await Promise.all([
      supabase.from("leads").select("user_id").limit(50000),
      supabase.from("campaigns").select("user_id").limit(50000),
    ]);
    const leadCounts = new Map<string, number>();
    (leadRows || []).forEach((r: { user_id: string | null }) => { if (r.user_id) leadCounts.set(r.user_id, (leadCounts.get(r.user_id) || 0) + 1); });
    const campCounts = new Map<string, number>();
    (campRows || []).forEach((r: { user_id: string | null }) => { if (r.user_id) campCounts.set(r.user_id, (campCounts.get(r.user_id) || 0) + 1); });

    const enriched = (pData as Profile[]).map((p) => ({
      ...p, lead_count: leadCounts.get(p.id) ?? 0, campaign_count: campCounts.get(p.id) ?? 0,
    }));
    setProfiles(enriched);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let r = profiles;
    if (planFilter !== "all") r = r.filter((p) => p.plan_tier === planFilter);
    if (roleFilter !== "all") {
      if (roleFilter === "owner") r = r.filter((p) => !p.parent_user_id);
      else if (roleFilter === "sub") r = r.filter((p) => !!p.parent_user_id);
      else r = r.filter((p) => (p.role || "").toLowerCase() === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((p) => (p.email || "").toLowerCase().includes(q) || (p.full_name || "").toLowerCase().includes(q));
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    const k = sort.key;
    return [...r].sort((a, b) => {
      const get = (x: Profile) =>
        k === "email" ? x.email : k === "plan" ? x.plan_tier :
        k === "leads" ? (x.lead_count ?? 0) : k === "campaigns" ? (x.campaign_count ?? 0) :
        k === "usage" ? (x.current_month_usage / Math.max(x.monthly_lead_limit, 1)) :
        new Date(x.created_at || 0).getTime();
      const av = get(a), bv = get(b);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [profiles, planFilter, roleFilter, search, sort]);

  // Counts for the summary cards
  const totals = useMemo(() => {
    const total = profiles.length;
    const owners = profiles.filter((p) => !p.parent_user_id).length;
    const subs = total - owners;
    const active = profiles.filter((p) => p.is_active).length;
    const byPlan = profiles.reduce<Record<string, number>>((acc, p) => { acc[p.plan_tier] = (acc[p.plan_tier] || 0) + 1; return acc; }, {});
    return { total, owners, subs, active, byPlan };
  }, [profiles]);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const actAs = async (id: string) => {
    setBusyId(id);
    try { await startImpersonation(id); }
    catch (e) { showToast(false, e instanceof Error ? e.message : "Could not act as user"); setBusyId(null); }
  };

  const toggleApproved = async (p: Profile) => {
    const next = !(p.is_approved ?? true);
    setBusyId(p.id);
    const { error } = await supabase.from("profiles").update({ is_approved: next }).eq("id", p.id);
    setBusyId(null);
    if (error) return showToast(false, error.message);
    setProfiles((prev) => prev.map((x) => x.id === p.id ? { ...x, is_approved: next } : x));
    showToast(true, next ? `Approved ${p.email}` : `Approval revoked for ${p.email}`);
  };

  const deleteProfile = async (p: Profile) => {
    if (!confirm(`Delete ${p.email}?\nLeads/calls stay (unassigned). This cannot be undone.`)) return;
    setBusyId(p.id);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ userId: p.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) return showToast(false, j.error || j.hint || "Delete failed");
    showToast(true, "User deleted");
    setProfiles((prev) => prev.filter((x) => x.id !== p.id));
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>Admin</p>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY }}>All Profiles</h1>
          <p style={{ fontSize: 13, color: SLATE, marginTop: 4 }}>{totals.total} users · {totals.owners} owners · {totals.subs} sub-users · {totals.active} active</p>
        </div>
        <button onClick={load} style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px",
          borderRadius: 10, background: T.midnight, border: "none", color: "#fff", cursor: "pointer",
          fontSize: 12, fontWeight: 700, boxShadow: "0 2px 8px rgba(35,43,58,0.25)",
        }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {toast && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, display: "flex", gap: 8, alignItems: "center",
          background: toast.ok ? T.emeraldBg : "#FBEEE8",
          color: toast.ok ? T.emerald : "#DC2626",
          fontSize: 13, fontWeight: 600, border: `1px solid ${toast.ok ? "#A7F3D0" : "#FBCFBE"}`,
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}

      {/* Plan summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {(["free", "starter", "professional", "enterprise"] as const).map((p) => (
          <div key={p} style={{ background: T.surface1, border: `1px solid ${T.border2}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{p}</span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: PLAN_COLOR[p] }} />
            </div>
            <p style={{ fontSize: 26, fontWeight: 900, color: NAVY, lineHeight: 1 }}>{totals.byPlan[p] || 0}</p>
            <p style={{ fontSize: 11, color: SLATE, marginTop: 4 }}>users on {p}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email or name…"
            style={{
              width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10,
              background: T.surface1, border: `1px solid ${T.border2}`, fontSize: 13, color: NAVY, outline: "none",
            }} />
        </div>
        <select value={planFilter} onChange={(e) => setPlan(e.target.value)} style={selectStyle}>
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={selectStyle}>
          <option value="all">Any role</option>
          <option value="owner">Owners (top-level)</option>
          <option value="sub">Sub-users</option>
          <option value="admin">Admin</option>
          <option value="qa">QA</option>
          <option value="team_leader">Team Leader</option>
          <option value="trainer">Trainer</option>
          <option value="caller">Caller</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: T.surface1, border: `1px solid ${T.border2}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(35,43,58,0.04)" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={22} className="animate-spin" style={{ color: NAVY }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 50, textAlign: "center", color: SLATE }}>
            <Users size={28} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No users match the current filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
              <thead>
                <tr style={{ background: T.surface3 }}>
                  <Th label="User" k="email" sort={sort} onClick={sortBy} />
                  <Th label="Plan" k="plan" sort={sort} onClick={sortBy} />
                  <Th label="Leads" k="leads" sort={sort} onClick={sortBy} align="right" />
                  <Th label="Camps" k="campaigns" sort={sort} onClick={sortBy} align="right" />
                  <Th label="Usage" k="usage" sort={sort} onClick={sortBy} />
                  <Th label="Joined" k="created" sort={sort} onClick={sortBy} />
                  <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: SLATE, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const pct = Math.min(100, Math.round((p.current_month_usage / Math.max(p.monthly_lead_limit, 1)) * 100));
                  return (
                    <tr key={p.id} style={{ borderTop: `1px solid ${T.border1}` }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%", background: T.navyLight,
                            color: NAVY, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 800, flexShrink: 0,
                          }}>{p.email.slice(0, 2).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: "flex", alignItems: "center", gap: 6 }}>
                              {p.full_name || p.email}
                              {!p.parent_user_id && <Crown size={11} color={T.teal} />}
                              {!p.parent_user_id && p.is_approved === false && (
                                <span style={{
                                  fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 999,
                                  background: "#FEF3C7", color: "#92400E",
                                  display: "inline-flex", alignItems: "center", gap: 3,
                                }}>
                                  <Clock size={9} /> PENDING
                                </span>
                              )}
                              {p.is_active ? null : <span style={{ fontSize: 9, color: "#DC2626", fontWeight: 700 }}>● inactive</span>}
                            </p>
                            {p.full_name && (
                              <p style={{ fontSize: 11, color: SLATE, display: "flex", alignItems: "center", gap: 4 }}>
                                <Mail size={10} /> {p.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, textTransform: "uppercase", padding: "3px 9px", borderRadius: 999,
                          background: `${PLAN_COLOR[p.plan_tier] || T.slate}15`, color: PLAN_COLOR[p.plan_tier] || T.slate,
                        }}>{p.plan_tier}</span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 700, color: NAVY }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <BarChart3 size={11} color={SLATE} /> {p.lead_count ?? 0}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 700, color: NAVY }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <FolderCog size={11} color={SLATE} /> {p.campaign_count ?? 0}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", minWidth: 160 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 99, background: T.surface3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: pct > 85 ? "#DC2626" : T.teal, transition: "width 400ms ease" }} />
                          </div>
                          <span style={{ fontSize: 10, color: SLATE, fontWeight: 700, minWidth: 50, textAlign: "right" }}>
                            {p.current_month_usage}/{p.monthly_lead_limit}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: SLATE }}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          {!p.parent_user_id && (
                            <button onClick={() => toggleApproved(p)} disabled={busyId === p.id}
                              title={p.is_approved === false ? "Approve this user" : "Revoke approval"}
                              style={{
                                ...iconBtn,
                                color: p.is_approved === false ? "#059669" : "#92400E",
                                borderColor: p.is_approved === false ? "#A7F3D0" : "#FCD34D",
                                background: p.is_approved === false ? "#ECFDF5" : "#FEF3C7",
                              }}>
                              {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                            </button>
                          )}
                          <button onClick={() => actAs(p.id)} disabled={busyId === p.id} title="Act as this user"
                            style={iconBtn}>
                            {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                          </button>
                          <button onClick={() => deleteProfile(p)} disabled={busyId === p.id} title="Delete user"
                            style={{ ...iconBtn, color: "#DC2626", borderColor: "#FBCFBE" }}>
                            {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ label, k, sort, onClick, align }: { label: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onClick: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = sort.key === k;
  return (
    <th style={{ padding: "12px 16px", textAlign: align || "left", fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", userSelect: "none" }}
      onClick={() => onClick(k)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: active ? T.navy : T.slate }}>
        {label} <ArrowUpDown size={10} style={{ opacity: active ? 1 : 0.4 }} />
      </span>
    </th>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 10,
  background: T.surface1, border: `1px solid ${T.border2}`,
  fontSize: 13, color: T.navy, outline: "none", cursor: "pointer",
};
const iconBtn: React.CSSProperties = {
  padding: 7, borderRadius: 8, cursor: "pointer",
  background: T.surface1, border: `1px solid ${T.border2}`, color: T.navy,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
