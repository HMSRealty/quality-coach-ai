"use client";

// Teams management. Owners create teams, assign a Team Leader, and add sub-users
// as members. Role-based visibility (QA / Trainer / Team Leader / Caller) is
// already enforced by RBAC + RLS; this UI activates the *who-belongs-where* part.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { T } from "@/app/_components/tokens";
import { normalizeRole, ROLE_LABELS, type Role } from "@/lib/rbac";
import {
  Users2, Plus, Trash2, Loader2, UserPlus, X, ChevronDown,
  Shield, AlertCircle, CheckCircle2,
} from "lucide-react";

const NAVY = T.text1;
const SLATE = T.text2;

interface Profile { id: string; email: string; full_name: string | null; role: string }
interface Team {
  id: string; name: string; organization_id: string | null;
  leader_id: string | null; manager_id: string | null;
  members: { user_id: string; profile?: Profile }[];
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  background: T.surface3, border: `1px solid ${T.border2}`,
  fontSize: 13, color: NAVY, outline: "none",
};

const ROLE_OPTS: Role[] = ["caller", "qa", "trainer", "team_leader"];

export default function TeamsPage() {
  const [me, setMe] = useState<{ id: string; orgId: string | null; role: Role }>({ id: "", orgId: null, role: "caller" });
  const [teams, setTeams] = useState<Team[]>([]);
  const [subUsers, setSubUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: prof } = await supabase
      .from("profiles").select("organization_id, role").eq("id", user.id).maybeSingle();
    const role = normalizeRole(prof?.role);
    const orgId = (prof?.organization_id as string) ?? null;
    setMe({ id: user.id, orgId, role });

    // Sub-users (direct children of this owner — the people they can put on teams).
    const { data: subs } = await supabase
      .from("profiles").select("id, email, full_name, role")
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false });
    setSubUsers((subs || []) as Profile[]);

    // Owner's teams + their members.
    const { data: t, error: tErr } = await supabase
      .from("teams")
      .select("id, name, organization_id, leader_id, manager_id")
      .eq("manager_id", user.id)
      .order("created_at", { ascending: false });
    if (tErr) { if (/relation .*teams.* does not exist/i.test(tErr.message)) setNeedsMigration(true); setLoading(false); return; }

    const teamIds = (t || []).map((x) => x.id);
    let memberRows: { team_id: string; user_id: string }[] = [];
    if (teamIds.length) {
      const { data: tm } = await supabase
        .from("team_members").select("team_id, user_id").in("team_id", teamIds);
      memberRows = (tm || []) as typeof memberRows;
    }
    const memberIds = Array.from(new Set(memberRows.map((m) => m.user_id)));
    let memberProfs: Profile[] = [];
    if (memberIds.length) {
      const { data: mp } = await supabase
        .from("profiles").select("id, email, full_name, role").in("id", memberIds);
      memberProfs = (mp || []) as Profile[];
    }
    const profById = new Map(memberProfs.map((p) => [p.id, p]));

    setTeams((t || []).map((row) => ({
      ...row,
      members: memberRows.filter((m) => m.team_id === row.id).map((m) => ({ user_id: m.user_id, profile: profById.get(m.user_id) })),
    })) as Team[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy("create");
    const payload: Record<string, unknown> = { name: newName.trim(), manager_id: me.id };
    if (me.orgId) payload.organization_id = me.orgId;
    const { error } = await supabase.from("teams").insert(payload);
    setBusy(null);
    if (error) return showToast(false, error.message);
    setNewName("");
    showToast(true, "Team created");
    load();
  };

  const deleteTeam = async (id: string) => {
    if (!confirm("Delete this team? Members keep their accounts.")) return;
    setBusy(id);
    await supabase.from("team_members").delete().eq("team_id", id);
    const { error } = await supabase.from("teams").delete().eq("id", id);
    setBusy(null);
    if (error) return showToast(false, error.message);
    showToast(true, "Team deleted");
    setTeams((p) => p.filter((t) => t.id !== id));
  };

  const setLeader = async (teamId: string, userId: string) => {
    setBusy(teamId + "-leader");
    const { error } = await supabase.from("teams").update({ leader_id: userId || null }).eq("id", teamId);
    setBusy(null);
    if (error) return showToast(false, error.message);
    setTeams((p) => p.map((t) => t.id === teamId ? { ...t, leader_id: userId || null } : t));
  };

  const addMember = async (teamId: string, userId: string) => {
    if (!userId) return;
    setBusy(teamId + "-add");
    const team = teams.find((t) => t.id === teamId);
    const payload: Record<string, unknown> = { team_id: teamId, user_id: userId };
    if (team?.organization_id) payload.organization_id = team.organization_id;
    const { error } = await supabase.from("team_members").insert(payload);
    setBusy(null);
    if (error) return showToast(false, error.message);
    load();
  };

  const removeMember = async (teamId: string, userId: string) => {
    setBusy(teamId + ":" + userId);
    const { error } = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    setBusy(null);
    if (error) return showToast(false, error.message);
    setTeams((p) => p.map((t) => t.id === teamId ? { ...t, members: t.members.filter((m) => m.user_id !== userId) } : t));
  };

  // Change a sub-user's role (Caller / QA / Trainer / Team Leader).
  const setRole = async (userId: string, role: Role) => {
    setBusy("role:" + userId);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    setBusy(null);
    if (error) return showToast(false, error.message);
    setSubUsers((p) => p.map((u) => u.id === userId ? { ...u, role } : u));
    showToast(true, "Role updated");
  };

  if (needsMigration) {
    return (
      <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center", padding: 32, background: T.surface1, border: `1px solid ${T.border2}`, borderRadius: 14 }}>
        <AlertCircle size={28} color="#EA580C" style={{ margin: "0 auto 12px" }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>Teams not enabled yet</h2>
        <p style={{ fontSize: 13, color: SLATE, marginTop: 6 }}>Run the CRM migrations first.</p>
      </div>
    );
  }

  const memberMap = new Map(teams.flatMap((t) => t.members.map((m) => [m.user_id, t.name])));
  const unassigned = subUsers.filter((u) => !memberMap.has(u.id));

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Teams</h1>
        <p style={{ fontSize: 13, color: SLATE }}>
          Organize the floor — group callers, QA, trainers and team leaders so reports roll up cleanly. Permissions live in{" "}
          <a href="/dashboard/roles" style={{ color: T.teal, fontWeight: 700, textDecoration: "none" }}>Roles &amp; Access</a>.
        </p>
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

      {/* Create */}
      <Card>
        <form onSubmit={createTeam} style={{ padding: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <Users2 size={18} color={NAVY} />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New team name (e.g. Dialers North)" style={{ ...inputStyle, flex: 1 }} />
          <button type="submit" disabled={busy === "create" || !newName.trim()} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 9,
            background: T.midnight, color: "#fff", border: "none", fontSize: 13, fontWeight: 700,
            cursor: busy === "create" ? "wait" : "pointer",
          }}>
            {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
          </button>
        </form>
      </Card>

      {/* Teams list */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: NAVY }} /></div>
      ) : teams.length === 0 ? (
        <Card padding={0}>
          <div style={{ padding: 48, textAlign: "center", color: SLATE }}>
            <Users2 size={28} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No teams yet. Create one above and start drafting your floor.</p>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {teams.map((team) => {
            const open = expanded === team.id;
            return (
              <Card key={team.id} padding={0}>
                <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderBottom: open ? `1px solid ${T.border1}` : "none", cursor: "pointer" }}
                     onClick={() => setExpanded(open ? null : team.id)}>
                  <Users2 size={16} color={T.teal} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{team.name}</p>
                    <p style={{ fontSize: 11, color: SLATE }}>
                      {team.members.length} member{team.members.length === 1 ? "" : "s"}
                      {team.leader_id && team.members.find((m) => m.user_id === team.leader_id)?.profile?.email ? ` · Leader: ${team.members.find((m) => m.user_id === team.leader_id)?.profile?.email}` : ""}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteTeam(team.id); }} disabled={busy === team.id}
                    title="Delete team"
                    style={{
                      background: "transparent", border: `1px solid ${T.border2}`, color: "#DC2626",
                      borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}>
                    {busy === team.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                  <ChevronDown size={16} color={SLATE} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
                </div>

                {open && (
                  <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Leader picker */}
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Shield size={14} color={T.teal} />
                      <label style={{ fontSize: 12, fontWeight: 700, color: NAVY, minWidth: 90 }}>Team Leader</label>
                      <select value={team.leader_id || ""} onChange={(e) => setLeader(team.id, e.target.value)}
                        style={{ ...inputStyle, maxWidth: 320 }}>
                        <option value="">— none —</option>
                        {team.members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>{m.profile?.full_name || m.profile?.email || m.user_id}</option>
                        ))}
                      </select>
                    </div>

                    {/* Members */}
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Members</p>
                      {team.members.length === 0 ? (
                        <p style={{ fontSize: 12, color: T.text3 }}>No members yet — add one below.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {team.members.map((m) => (
                            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: T.surface3 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>
                                  {m.profile?.full_name || m.profile?.email || m.user_id}
                                  {team.leader_id === m.user_id && <span style={{ marginLeft: 8, fontSize: 9, padding: "1px 6px", borderRadius: 999, background: T.teal, color: "#FFF", fontWeight: 800 }}>LEADER</span>}
                                </p>
                                {m.profile?.full_name && <p style={{ fontSize: 10, color: SLATE }}>{m.profile.email}</p>}
                              </div>
                              <select value={normalizeRole(m.profile?.role)} onChange={(e) => setRole(m.user_id, e.target.value as Role)}
                                disabled={busy === "role:" + m.user_id}
                                style={{ padding: "5px 10px", borderRadius: 7, background: T.surface1, border: `1px solid ${T.border2}`, fontSize: 11, color: NAVY, fontWeight: 700 }}>
                                {ROLE_OPTS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                              </select>
                              <button onClick={() => removeMember(team.id, m.user_id)} disabled={busy === team.id + ":" + m.user_id}
                                title="Remove from team"
                                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#DC2626", padding: 4 }}>
                                {busy === team.id + ":" + m.user_id ? <Loader2 size={12} className="animate-spin" /> : <X size={14} />}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add member */}
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <UserPlus size={14} color={NAVY} />
                      <select onChange={(e) => { addMember(team.id, e.target.value); e.target.value = ""; }}
                        defaultValue="" style={{ ...inputStyle, maxWidth: 320 }}>
                        <option value="">— add a sub-user —</option>
                        {subUsers
                          .filter((u) => !team.members.find((m) => m.user_id === u.id))
                          .map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                      </select>
                      <a href="/dashboard/sub-users" style={{ fontSize: 11, color: T.teal, fontWeight: 700, textDecoration: "none" }}>
                        + Create new sub-user
                      </a>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Unassigned sub-users */}
      {unassigned.length > 0 && (
        <Card padding={0}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border1}` }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>Not on any team ({unassigned.length})</p>
            <p style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>These sub-users can still log in, but won&apos;t appear in team views.</p>
          </div>
          <div style={{ padding: "10px 18px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            {unassigned.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: T.surface3 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{u.full_name || u.email}</p>
                  {u.full_name && <p style={{ fontSize: 10, color: SLATE }}>{u.email}</p>}
                </div>
                <span style={{ fontSize: 11, color: SLATE, textTransform: "capitalize" }}>{ROLE_LABELS[normalizeRole(u.role)]}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
