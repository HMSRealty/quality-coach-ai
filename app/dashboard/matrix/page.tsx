"use client";

// Matrix — the team-management hub. Add / edit / terminate / delete employees,
// assign them to teams, change roles. Shows the full org grouped by role bucket
// (Managers / Team Leaders / Acquisitions / QA / Trainers / Callers) plus the
// 30-day Objection Heatmap.
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import {
  Crown, Users2, ShieldCheck, Briefcase, Flag, PhoneCall,
  Search, Loader2, Mail, Building2, AlertTriangle, TrendingDown,
  Plus, Pencil, Trash2, UserMinus, UserCheck, ChevronDown,
  MoreVertical, X, Save, CheckCircle2, AlertCircle, Phone as PhoneIcon,
} from "lucide-react";

const NAVY = T.text1;
const SLATE = T.text2;

// ── Types ──────────────────────────────────────────────────────────────
type RoleKey = "owner" | "admin" | "team_leader" | "acquisitions" | "qa" | "trainer" | "caller";
interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  parent_user_id: string | null;
  organization_id: string | null;
  shift_type: "part_time" | "full_time" | null;
  daily_target: number | null;
  is_active?: boolean | null;
}
interface Agent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  team_id: string | null;
  shift_type: "part_time" | "full_time" | null;
  daily_target: number | null;
  is_active: boolean | null;
}
interface Team { id: string; name: string; leader_id: string | null }

interface Person {
  // Unified shape for either a profile or a cold_caller
  kind: "profile" | "agent";
  id: string;
  display: string;          // full_name or name
  email: string | null;
  phone: string | null;
  team_id: string | null;
  role: RoleKey;
  shift_type: "part_time" | "full_time";
  daily_target: number;
  is_active: boolean;
  parent_user_id?: string | null;
}

// ── Buckets ────────────────────────────────────────────────────────────
const BUCKETS = [
  { key: "owner",        label: "Managers",       icon: Crown,        accent: "#D946EF" },
  { key: "team_leader",  label: "Team Leaders",   icon: Flag,         accent: "#F59E0B" },
  { key: "acquisitions", label: "Acquisitions",   icon: Building2,    accent: "#10B981" },
  { key: "qa",           label: "Quality (QA)",   icon: ShieldCheck,  accent: "#0284C7" },
  { key: "trainer",      label: "Trainers",       icon: Briefcase,    accent: "#7C3AED" },
  { key: "caller",       label: "Callers",        icon: PhoneCall,    accent: "#F2266F" },
] as const;
type BucketKey = (typeof BUCKETS)[number]["key"];
const BUCKET_OPTIONS: { value: RoleKey; label: string }[] = [
  { value: "owner",        label: "Manager / Owner" },
  { value: "admin",        label: "Admin" },
  { value: "team_leader",  label: "Team Leader" },
  { value: "acquisitions", label: "Acquisitions" },
  { value: "qa",           label: "QA" },
  { value: "trainer",      label: "Trainer" },
  { value: "caller",       label: "Caller (agent)" },
];

function bucketOfProfile(p: Profile): BucketKey {
  const r = (p.role || "").toLowerCase();
  if (!p.parent_user_id || r === "owner" || r === "admin") return "owner";
  if (r === "team_leader" || r === "team leader") return "team_leader";
  if (r === "qa") return "qa";
  if (r === "acquisitions" || r === "acq") return "acquisitions";
  if (r === "trainer") return "trainer";
  return "caller";
}
const initials = (s: string) => (s || "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

// ── Page ───────────────────────────────────────────────────────────────
export default function MatrixPage() {
  const [me, setMe] = useState<{ id: string; orgId: string | null } | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [objections, setObjections] = useState<Array<{ label: string; count: number }>>([]);
  const [objLoading, setObjLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg }); setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: mine } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (mine?.organization_id as string) ?? null;
    setMe({ id: user.id, orgId });

    const pq = supabase.from("profiles").select("id, email, full_name, role, parent_user_id, organization_id, shift_type, daily_target");
    const { data: p } = orgId ? await pq.eq("organization_id", orgId) : await pq;
    setProfiles((p || []) as Profile[]);

    const { data: ag } = await supabase.from("cold_callers")
      .select("id, name, email, phone, team_id, shift_type, daily_target, is_active")
      .eq("user_id", user.id).order("name");
    setAgents((ag || []) as Agent[]);

    const { data: t } = await supabase.from("teams").select("id, name, leader_id").eq("manager_id", user.id);
    setTeams((t || []) as Team[]);
    setLoading(false);

    // Objection heatmap
    setObjLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let q = supabase.from("leads").select("status, metadata").gte("created_at", since).in("status", ["Cold", "Disqualified", "Call Back", "Duplicate"]);
    if (orgId) q = q.eq("organization_id", orgId);
    const { data: dq } = await q;
    const buckets: Record<string, number> = {};
    for (const row of (dq || []) as { metadata?: Record<string, unknown> }[]) {
      const obj = ((row.metadata || {}).primary_objection as string | undefined) || "Unclassified";
      if (obj === "None") continue;
      buckets[obj] = (buckets[obj] || 0) + 1;
    }
    setObjections(Object.entries(buckets).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count));
    setObjLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Combine profiles + cold_callers into a unified list.
  const people: Person[] = useMemo(() => {
    const out: Person[] = [];
    for (const p of profiles) {
      out.push({
        kind: "profile", id: p.id,
        display: p.full_name || p.email,
        email: p.email, phone: null,
        team_id: null,
        role: bucketOfProfile(p),
        shift_type: p.shift_type ?? "full_time",
        daily_target: p.daily_target ?? (p.shift_type === "part_time" ? 1 : 2),
        is_active: true,
        parent_user_id: p.parent_user_id,
      });
    }
    for (const a of agents) {
      out.push({
        kind: "agent", id: a.id,
        display: a.name,
        email: a.email, phone: a.phone,
        team_id: a.team_id,
        role: "caller",
        shift_type: a.shift_type ?? "full_time",
        daily_target: a.daily_target ?? (a.shift_type === "part_time" ? 1 : 2),
        is_active: a.is_active !== false,
      });
    }
    return out;
  }, [profiles, agents]);

  const filtered = useMemo(() => {
    if (!search.trim()) return people;
    const q = search.toLowerCase();
    return people.filter(p =>
      [p.display, p.email, p.phone].some(v => (v || "").toLowerCase().includes(q))
    );
  }, [people, search]);

  const grouped: Record<BucketKey, Person[]> = useMemo(() => {
    const out: Record<BucketKey, Person[]> = { owner: [], team_leader: [], acquisitions: [], qa: [], trainer: [], caller: [] };
    for (const p of filtered) out[p.role === "admin" ? "owner" : p.role]?.push(p);
    return out;
  }, [filtered]);

  // ── Actions ──────────────────────────────────────────────────────────
  const updateProfileRow = async (id: string, patch: Partial<Profile>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) { showToast(false, error.message); return false; }
    setProfiles(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
    return true;
  };
  const updateAgentRow = async (id: string, patch: Partial<Agent>) => {
    const { error } = await supabase.from("cold_callers").update(patch).eq("id", id);
    if (error) { showToast(false, error.message); return false; }
    setAgents(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
    return true;
  };

  const setTeam = async (person: Person, teamId: string | null) => {
    setBulkBusy(`team:${person.id}`);
    if (person.kind === "agent") {
      await updateAgentRow(person.id, { team_id: teamId });
    } else {
      // System users use team_members table.
      await supabase.from("team_members").delete().eq("user_id", person.id);
      if (teamId) {
        const team = teams.find(t => t.id === teamId);
        const payload: Record<string, unknown> = { team_id: teamId, user_id: person.id };
        if (team) payload.organization_id = me?.orgId ?? null;
        await supabase.from("team_members").insert(payload);
      }
    }
    setBulkBusy(null);
    setOpenMenuId(null);
    showToast(true, teamId ? `Moved to ${teams.find(t => t.id === teamId)?.name}` : "Removed from team");
  };

  const terminate = async (person: Person) => {
    if (!confirm(`Mark ${person.display} as terminated (inactive)? Their data stays.`)) return;
    setBulkBusy(`term:${person.id}`);
    if (person.kind === "agent") await updateAgentRow(person.id, { is_active: false });
    setBulkBusy(null);
    setOpenMenuId(null);
    showToast(true, `${person.display} marked inactive`);
  };
  const reactivate = async (person: Person) => {
    setBulkBusy(`act:${person.id}`);
    if (person.kind === "agent") await updateAgentRow(person.id, { is_active: true });
    setBulkBusy(null);
    setOpenMenuId(null);
    showToast(true, `${person.display} reactivated`);
  };

  const remove = async (person: Person) => {
    if (!confirm(`Permanently delete ${person.display}? Leads/calls stay (unassigned).`)) return;
    setBulkBusy(`del:${person.id}`);
    if (person.kind === "agent") {
      const { error } = await supabase.from("cold_callers").delete().eq("id", person.id);
      if (error) { showToast(false, error.message); setBulkBusy(null); return; }
      setAgents(p => p.filter(x => x.id !== person.id));
    } else {
      // System user — call the admin DELETE route (clears FK references too).
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ userId: person.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(false, j.error || "Delete failed"); setBulkBusy(null); return; }
      setProfiles(p => p.filter(x => x.id !== person.id));
    }
    setBulkBusy(null);
    setOpenMenuId(null);
    showToast(true, "Deleted");
  };

  // Save from the modal (edit OR add)
  const saveDraft = async (d: Person, password?: string) => {
    if (!d.display.trim()) return showToast(false, "Name required");
    if (editing) {
      // EDIT
      if (d.kind === "agent") {
        await updateAgentRow(d.id, {
          name: d.display, email: d.email, phone: d.phone,
          team_id: d.team_id, shift_type: d.shift_type,
          daily_target: d.daily_target, is_active: d.is_active,
        });
      } else {
        await updateProfileRow(d.id, {
          full_name: d.display, role: d.role,
          shift_type: d.shift_type, daily_target: d.daily_target,
        });
        // Team membership for profile
        await supabase.from("team_members").delete().eq("user_id", d.id);
        if (d.team_id) await supabase.from("team_members").insert({ team_id: d.team_id, user_id: d.id, organization_id: me?.orgId ?? null });
      }
      setEditing(null);
      showToast(true, "Saved");
    } else {
      // ADD
      if (d.kind === "agent") {
        if (!me) return;
        const { data, error } = await supabase.from("cold_callers").insert({
          name: d.display, email: d.email, phone: d.phone, team_id: d.team_id,
          shift_type: d.shift_type, daily_target: d.daily_target, is_active: true,
          user_id: me.id,
        }).select().single();
        if (error) return showToast(false, error.message);
        setAgents(p => [data as Agent, ...p]);
      } else {
        // Add system user — calls /api/admin/users (creates auth + profile row)
        if (!d.email) return showToast(false, "Email required for system users");
        if (!password || password.length < 6) return showToast(false, "Password ≥ 6 chars required");
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ email: d.email, password, role: d.role, plan_tier: "starter" }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return showToast(false, j.error || "Create failed");
        // Patch the new profile with extras then assign team
        if (j.user?.id) {
          await supabase.from("profiles").update({
            full_name: d.display, shift_type: d.shift_type, daily_target: d.daily_target,
          }).eq("id", j.user.id);
          if (d.team_id) await supabase.from("team_members").insert({ team_id: d.team_id, user_id: j.user.id, organization_id: me?.orgId ?? null });
        }
        await load();
      }
      setAdding(false);
      showToast(true, "Added");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em" }}>Company Matrix</h1>
          <p style={{ fontSize: 13.5, color: SLATE, marginTop: 4 }}>
            Add, edit, terminate, or delete employees · assign each one to a team · see the full org at a glance.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter people…"
              style={{
                padding: "10px 12px 10px 36px", borderRadius: 10, width: 260,
                background: "var(--surface-1)", border: "1px solid var(--border-2)",
                fontSize: 13, color: "var(--text-1)", outline: "none",
              }} />
          </div>
          <button onClick={() => setAdding(true)} className="btn-brand">
            <Plus size={14} /> Add employee
          </button>
        </div>
      </div>

      {toast && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, display: "flex", gap: 8, alignItems: "center",
          background: toast.ok ? "#ECFDF5" : "#FBEEE8", color: toast.ok ? "#065F46" : "#991B1B",
          border: `1px solid ${toast.ok ? "#A7F3D0" : "#FBCFBE"}`,
          fontSize: 13, fontWeight: 700,
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}

      {/* Summary chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {BUCKETS.map(b => {
          const Icon = b.icon; const count = grouped[b.key].length;
          return (
            <div key={b.key} style={{
              background: "var(--surface-1)", border: "1px solid var(--border-2)",
              borderRadius: 14, padding: 16, position: "relative", overflow: "hidden",
            }}>
              <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: b.accent }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: `${b.accent}22`, color: b.accent, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={14} /></span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: SLATE, textTransform: "uppercase" }}>{b.label}</span>
              </div>
              <p style={{ fontSize: 26, fontWeight: 900, color: NAVY, lineHeight: 1 }}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* People grid */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: NAVY }} /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          {BUCKETS.map(b => {
            const Icon = b.icon;
            const list = grouped[b.key];
            return (
              <div key={b.key} className="reveal" style={{
                background: "var(--surface-1)", border: "1px solid var(--border-2)",
                borderRadius: 16, overflow: "visible",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border-1)", background: `${b.accent}10` }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: b.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={15} /></span>
                  <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, flex: 1 }}>{b.label}</p>
                  <span style={{ fontSize: 12, fontWeight: 800, color: b.accent, background: `${b.accent}22`, padding: "2px 9px", borderRadius: 999 }}>{list.length}</span>
                  <button onClick={() => setAdding(true)} title="Add to this group" className="btn-ghost" style={{ padding: "5px 8px", fontSize: 11 }}>
                    <Plus size={11} />
                  </button>
                </div>
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain" }}>
                  {list.length === 0 ? (
                    <p style={{ fontSize: 12, color: T.text3 as string, textAlign: "center", padding: 16 }}>—</p>
                  ) : list.map(p => (
                    <PersonRow
                      key={`${p.kind}-${p.id}`}
                      person={p}
                      teams={teams}
                      accent={b.accent}
                      isOwner={!p.parent_user_id && p.kind === "profile"}
                      menuOpen={openMenuId === `${p.kind}-${p.id}`}
                      onToggleMenu={() => setOpenMenuId(openMenuId === `${p.kind}-${p.id}` ? null : `${p.kind}-${p.id}`)}
                      onEdit={() => { setEditing(p); setOpenMenuId(null); }}
                      onSetTeam={(tid) => setTeam(p, tid)}
                      onTerminate={() => terminate(p)}
                      onReactivate={() => reactivate(p)}
                      onDelete={() => remove(p)}
                      busy={bulkBusy?.includes(p.id) ? bulkBusy : null}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Objection heatmap */}
      <div className="reveal" style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9,
            background: T.gradPrimary as string, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><AlertTriangle size={14} /></span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Objection Heatmap</p>
            <p style={{ fontSize: 11.5, color: SLATE }}>Why the floor is losing deals · last 30 days</p>
          </div>
          <TrendingDown size={14} color={SLATE} />
        </div>
        {objLoading ? <Loader2 size={16} className="animate-spin" style={{ color: NAVY }} /> : objections.length === 0 ? (
          <p style={{ fontSize: 12.5, color: T.text3 as string }}>No tagged objections yet. The AI starts filling this in after the next batch of analyses.</p>
        ) : (() => {
          const maxC = objections[0].count;
          const total = objections.reduce((s, o) => s + o.count, 0);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {objections.map((o, i) => {
                const pct = Math.round((o.count / maxC) * 100);
                const share = Math.round((o.count / total) * 100);
                const heat = i === 0 ? "#DC2626" : i === 1 ? "#F2266F" : i === 2 ? "#EA580C" : i === 3 ? "#F59E0B" : "#7C3AED";
                return (
                  <div key={o.label} style={{ display: "grid", gridTemplateColumns: "180px 1fr 64px 50px", alignItems: "center", gap: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</p>
                    <div style={{ position: "relative", height: 22, borderRadius: 8, background: "var(--surface-3)", overflow: "hidden" }}>
                      <span style={{
                        position: "absolute", inset: 0, width: `${pct}%`,
                        background: `linear-gradient(90deg, ${heat}, ${heat}DD)`,
                        borderRadius: 8,
                        boxShadow: `0 0 12px ${heat}55`,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{o.count} deals</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: heat, textAlign: "right" }}>{share}%</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Teams summary */}
      {teams.length > 0 && (
        <div className="reveal" style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, padding: 18 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Users2 size={16} color={T.magenta as string} /> Teams ({teams.length})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {teams.map(t => {
              const leader = profiles.find(p => p.id === t.leader_id);
              return (
                <div key={t.id} style={{ padding: 12, borderRadius: 12, background: "var(--surface-3)", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>{t.name}</p>
                  <p style={{ fontSize: 11, color: SLATE, marginTop: 4 }}>Leader: {leader?.full_name || leader?.email || "—"}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {(adding || editing) && (
        <PersonModal
          initial={editing}
          teams={teams}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={saveDraft}
        />
      )}
    </div>
  );
}

// ── Person row ─────────────────────────────────────────────────────────
function PersonRow({
  person, teams, accent, isOwner, menuOpen, onToggleMenu, onEdit, onSetTeam, onTerminate, onReactivate, onDelete, busy,
}: {
  person: Person; teams: Team[]; accent: string; isOwner: boolean;
  menuOpen: boolean; onToggleMenu: () => void;
  onEdit: () => void; onSetTeam: (id: string | null) => void;
  onTerminate: () => void; onReactivate: () => void; onDelete: () => void;
  busy: string | null;
}) {
  const teamName = person.team_id ? teams.find(t => t.id === person.team_id)?.name : null;
  return (
    <div style={{
      position: "relative", display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 10,
      background: person.is_active ? "var(--surface-3)" : "rgba(220,38,38,0.06)",
      border: person.is_active ? "1px solid var(--border-1)" : "1px solid rgba(220,38,38,0.20)",
      opacity: person.is_active ? 1 : 0.78,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: accent, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 800, flexShrink: 0,
      }}>{initials(person.display)}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {person.display}
          {isOwner && <Crown size={11} color={T.magenta as string} />}
          {!person.is_active && <span style={{ fontSize: 9, fontWeight: 900, color: "#DC2626", letterSpacing: "0.08em" }}>TERMINATED</span>}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-2)", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          {person.email && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Mail size={9} /> {person.email}</span>}
          {person.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><PhoneIcon size={9} /> {person.phone}</span>}
        </p>
        <p style={{ fontSize: 10.5, color: "var(--text-3)", display: "flex", gap: 8, marginTop: 3 }}>
          <span><strong>{person.shift_type === "part_time" ? "Part-time" : "Full-time"}</strong> · target {person.daily_target}/d</span>
          {teamName ? <span>· Team: <strong style={{ color: "var(--text-2)" }}>{teamName}</strong></span> : <span>· No team</span>}
        </p>
      </div>
      <button onClick={onToggleMenu} disabled={!!busy}
        style={{
          width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-2)",
          background: "var(--surface-1)", color: "var(--text-1)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <MoreVertical size={13} />}
      </button>

      {menuOpen && (
        <div style={{
          position: "absolute", top: 44, right: 8, zIndex: 30,
          background: "var(--surface-1)", border: "1px solid var(--border-2)",
          borderRadius: 12, boxShadow: "0 18px 38px rgba(0,0,0,0.20)",
          width: 230, padding: 6,
        }}>
          <MenuItem icon={Pencil} label="Edit details" onClick={onEdit} />
          <div style={{ height: 1, background: "var(--border-1)", margin: "4px 6px" }} />
          <p style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 10px" }}>Move to team</p>
          <MenuItem icon={X} label="No team" onClick={() => onSetTeam(null)} />
          {teams.map(t => (
            <MenuItem key={t.id} icon={Users2} label={t.name} onClick={() => onSetTeam(t.id)} />
          ))}
          <div style={{ height: 1, background: "var(--border-1)", margin: "4px 6px" }} />
          {person.is_active ? (
            person.kind === "agent" && <MenuItem icon={UserMinus} label="Terminate (mark inactive)" onClick={onTerminate} color="#EA580C" />
          ) : (
            <MenuItem icon={UserCheck} label="Reactivate" onClick={onReactivate} color="#10B981" />
          )}
          {!isOwner && (
            <MenuItem icon={Trash2} label="Delete permanently" onClick={onDelete} color="#DC2626" />
          )}
        </div>
      )}
    </div>
  );
}
function MenuItem({ icon: Icon, label, onClick, color }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", border: "none", cursor: "pointer",
      background: "transparent", color: color || "var(--text-1)",
      padding: "8px 10px", borderRadius: 7,
      display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 600,
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <Icon size={12} color={color || "var(--text-2)"} /> {label}
    </button>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────
function PersonModal({
  initial, teams, onClose, onSave,
}: {
  initial: Person | null; teams: Team[];
  onClose: () => void;
  onSave: (p: Person, password?: string) => Promise<void>;
}) {
  const [d, setD] = useState<Person>(initial || {
    kind: "agent", id: "", display: "", email: "", phone: "", team_id: null,
    role: "caller", shift_type: "full_time", daily_target: 2, is_active: true,
  });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try { await onSave(d, password); } finally { setBusy(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 9,
    background: "var(--surface-3)", border: "1px solid var(--border-2)",
    fontSize: 13, color: "var(--text-1)", outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4, display: "block" };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(8,10,24,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="animate-scale" style={{
        width: "100%", maxWidth: 560, borderRadius: 18,
        background: "var(--surface-1)", border: "1px solid var(--border-2)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.40)", padding: 22,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)" }}>{initial ? "Edit employee" : "Add employee"}</p>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={16} /></button>
        </div>

        {!initial && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setD({ ...d, kind: "agent", role: "caller" })} className={d.kind === "agent" ? "btn-brand" : "btn-ghost"} style={{ flex: 1, justifyContent: "center", fontSize: 12 }}>
              Caller (no login)
            </button>
            <button onClick={() => setD({ ...d, kind: "profile" })} className={d.kind === "profile" ? "btn-brand" : "btn-ghost"} style={{ flex: 1, justifyContent: "center", fontSize: 12 }}>
              System user (login)
            </button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Full name *</label>
            <input value={d.display} onChange={e => setD({ ...d, display: e.target.value })} placeholder="Jane Doe" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email{d.kind === "profile" ? " *" : ""}</label>
            <input value={d.email || ""} onChange={e => setD({ ...d, email: e.target.value })} placeholder="jane@company.com" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={d.phone || ""} onChange={e => setD({ ...d, phone: e.target.value })} placeholder="+1 (305) 555-0199" style={inputStyle} />
          </div>
          {!initial && d.kind === "profile" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Temporary password *</label>
              <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="≥ 6 characters" style={inputStyle} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Role</label>
            <select value={d.role} onChange={e => setD({ ...d, role: e.target.value as RoleKey })} style={inputStyle} disabled={d.kind === "agent"}>
              {BUCKET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Team</label>
            <select value={d.team_id ?? ""} onChange={e => setD({ ...d, team_id: e.target.value || null })} style={inputStyle}>
              <option value="">— none —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Shift type</label>
            <select value={d.shift_type} onChange={e => { const v = e.target.value as "part_time" | "full_time"; setD({ ...d, shift_type: v, daily_target: v === "part_time" ? 1 : 2 }); }} style={inputStyle}>
              <option value="full_time">Full-time (2/day)</option>
              <option value="part_time">Part-time (1/day)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Daily target</label>
            <input type="number" step="0.5" min="0" value={d.daily_target} onChange={e => setD({ ...d, daily_target: Number(e.target.value) || 0 })} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-brand">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {initial ? "Save changes" : "Create employee"}
          </button>
        </div>
      </div>
    </div>
  );
}
