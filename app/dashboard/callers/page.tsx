"use client";

// Agents (cold_callers) — add / modify / delete + shift_type + daily target.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import {
  Users2, Plus, Trash2, Loader2, Save, X, Mail, Phone, Search,
  CheckCircle2, AlertCircle, Pencil, UserPlus,
} from "lucide-react";

const NAVY = T.text1;
const SLATE = T.text2;

interface Agent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  team_id: string | null;
  hiring_date: string | null;
  shift_type: "part_time" | "full_time" | null;
  daily_target: number | null;
  is_active: boolean | null;
  notes: string | null;
}
interface Team { id: string; name: string }

const blank: Omit<Agent, "id"> = {
  name: "", email: "", phone: "", team_id: null, hiring_date: null,
  shift_type: "full_time", daily_target: 2, is_active: true, notes: "",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9,
  background: "var(--surface-3)", border: "1px solid var(--border-2)",
  fontSize: 13, color: "var(--text-1)", outline: "none",
};

const iconBtn: React.CSSProperties = {
  padding: 7, borderRadius: 8, cursor: "pointer", marginLeft: 6,
  background: "var(--surface-1)", border: "1px solid var(--border-2)", color: "var(--text-1)",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Agent, "id"> | null>(null);
  const [adding, setAdding] = useState(false);
  const [newAgent, setNewAgent] = useState<Omit<Agent, "id">>(blank);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg }); setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: a } = await supabase.from("cold_callers")
      .select("id, name, email, phone, team_id, hiring_date, shift_type, daily_target, is_active, notes")
      .eq("user_id", user.id).order("name");
    setAgents((a || []) as Agent[]);
    const { data: t } = await supabase.from("teams").select("id, name").eq("manager_id", user.id);
    setTeams((t || []) as Team[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (a: Agent) => {
    setEditingId(a.id);
    setDraft({
      name: a.name, email: a.email, phone: a.phone, team_id: a.team_id,
      hiring_date: a.hiring_date,
      shift_type: a.shift_type ?? "full_time",
      daily_target: a.daily_target ?? (a.shift_type === "part_time" ? 1 : 2),
      is_active: a.is_active ?? true, notes: a.notes,
    });
  };

  const saveEdit = async (id: string) => {
    if (!draft) return;
    setBusyId(id);
    const { error } = await supabase.from("cold_callers").update(draft).eq("id", id);
    setBusyId(null);
    if (error) return showToast(false, error.message);
    setAgents(p => p.map(a => a.id === id ? { ...a, ...draft } : a));
    setEditingId(null); setDraft(null);
    showToast(true, "Saved");
  };

  const remove = async (a: Agent) => {
    if (!confirm(`Delete ${a.name}? Their existing leads stay (unassigned).`)) return;
    setBusyId(a.id);
    const { error } = await supabase.from("cold_callers").delete().eq("id", a.id);
    setBusyId(null);
    if (error) return showToast(false, error.message);
    setAgents(p => p.filter(x => x.id !== a.id));
    showToast(true, "Agent deleted");
  };

  const add = async () => {
    if (!newAgent.name.trim()) return showToast(false, "Name is required");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBusyId("new");
    const payload = { ...newAgent, user_id: user.id };
    const { data, error } = await supabase.from("cold_callers").insert(payload).select().single();
    setBusyId(null);
    if (error) return showToast(false, error.message);
    setAgents(p => [data as Agent, ...p]);
    setNewAgent(blank); setAdding(false);
    showToast(true, "Agent added");
  };

  const [subUsers, setSubUsers] = useState<Set<string>>(new Set());
  // Load existing sub-users to know which agents already have logins.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles")
        .select("full_name")
        .eq("parent_user_id", user.id)
        .eq("role", "caller");
      if (data) setSubUsers(new Set(data.map((p: { full_name: string | null }) => p.full_name || "").filter(Boolean)));
    })();
  }, []);

  const createLogin = async (a: Agent) => {
    if (!a.email) return showToast(false, "Agent needs an email address first — edit and add one.");
    const password = prompt(`Create login for ${a.name}\n\nSet a temporary password (min 6 chars):`);
    if (!password || password.length < 6) return showToast(false, "Password must be at least 6 characters.");
    setBusyId(a.id);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email: a.email, password, role: "caller", plan_tier: "starter", full_name: a.name }),
    });
    const j = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok || j.error) return showToast(false, j.error || "Failed to create login");
    setSubUsers(prev => new Set(prev).add(a.name));
    showToast(true, `Login created for ${a.name} (${a.email})`);
  };

  const filtered = agents.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [a.name, a.email, a.phone].some(v => (v || "").toLowerCase().includes(q));
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Agents</h1>
          <p style={{ fontSize: 13, color: SLATE }}>Add, modify, or remove cold callers. Info · contact · team · shift · target.</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-brand">
          <Plus size={14} /> Add agent
        </button>
      </div>

      {toast && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, display: "flex", gap: 8, alignItems: "center",
          background: toast.ok ? "#ECFDF5" : "#FBEEE8", color: toast.ok ? "#059669" : "#DC2626",
          fontSize: 13, fontWeight: 600, border: `1px solid ${toast.ok ? "#A7F3D0" : "#FBCFBE"}`,
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}

      <div style={{ position: "relative", maxWidth: 360 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or phone…"
          style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>

      {adding && (
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <input value={newAgent.name} onChange={e => setNewAgent({ ...newAgent, name: e.target.value })} placeholder="Full name *" style={inputStyle} />
            <input value={newAgent.email || ""} onChange={e => setNewAgent({ ...newAgent, email: e.target.value })} placeholder="Email" style={inputStyle} />
            <input value={newAgent.phone || ""} onChange={e => setNewAgent({ ...newAgent, phone: e.target.value })} placeholder="Phone" style={inputStyle} />
            <select value={newAgent.team_id ?? ""} onChange={e => setNewAgent({ ...newAgent, team_id: e.target.value || null })} style={inputStyle}>
              <option value="">— no team —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={newAgent.shift_type ?? "full_time"}
              onChange={e => { const v = e.target.value as "part_time" | "full_time"; setNewAgent({ ...newAgent, shift_type: v, daily_target: v === "part_time" ? 1 : 2 }); }}
              style={inputStyle}>
              <option value="full_time">Full-time (2/day)</option>
              <option value="part_time">Part-time (1/day)</option>
            </select>
            <input type="number" step="0.5" min="0" value={newAgent.daily_target ?? 2}
              onChange={e => setNewAgent({ ...newAgent, daily_target: Number(e.target.value) })} placeholder="Target" style={inputStyle} />
            <input type="date" value={newAgent.hiring_date || ""} onChange={e => setNewAgent({ ...newAgent, hiring_date: e.target.value || null })} style={inputStyle} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button onClick={() => { setAdding(false); setNewAgent(blank); }} className="btn-ghost">Cancel</button>
            <button onClick={add} disabled={busyId === "new"} className="btn-brand">
              {busyId === "new" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save agent
            </button>
          </div>
        </div>
      )}

      <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 50, textAlign: "center" }}><Loader2 size={22} className="animate-spin" style={{ color: NAVY }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 50, textAlign: "center", color: SLATE }}>
            <Users2 size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No agents yet. Click <strong>Add agent</strong> to start.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "var(--surface-3)" }}>
                  {["Agent", "Contact", "Team", "Shift", "Target", "Hired", "Active", ""].map((h) => (
                    <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 800, color: SLATE, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const editing = editingId === a.id && draft;
                  return (
                    <tr key={a.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                      <td style={{ padding: "11px 14px", minWidth: 200 }}>
                        {editing ? (
                          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: T.gradPrimary, color: "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 800,
                            }}>{a.name.split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase()}</div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{a.name}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: SLATE }}>
                        {editing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input value={draft.email || ""} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="Email" style={inputStyle} />
                            <input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" style={inputStyle} />
                          </div>
                        ) : (
                          <>
                            {a.email && <p style={{ display: "flex", alignItems: "center", gap: 5 }}><Mail size={11} /> {a.email}</p>}
                            {a.phone && <p style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}><Phone size={11} /> {a.phone}</p>}
                            {!a.email && !a.phone && "—"}
                          </>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--text-1)" }}>
                        {editing ? (
                          <select value={draft.team_id ?? ""} onChange={e => setDraft({ ...draft, team_id: e.target.value || null })} style={inputStyle}>
                            <option value="">— none —</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        ) : teams.find(t => t.id === a.team_id)?.name || "—"}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12 }}>
                        {editing ? (
                          <select value={draft.shift_type ?? "full_time"}
                            onChange={e => { const v = e.target.value as "part_time" | "full_time"; setDraft({ ...draft, shift_type: v, daily_target: v === "part_time" ? 1 : 2 }); }}
                            style={inputStyle}>
                            <option value="full_time">Full-time</option>
                            <option value="part_time">Part-time</option>
                          </select>
                        ) : (
                          <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                            background: a.shift_type === "part_time" ? "#FEF3C7" : "#DBEAFE",
                            color: a.shift_type === "part_time" ? "#92400E" : "#1E40AF",
                          }}>{a.shift_type === "part_time" ? "Part-time" : "Full-time"}</span>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>
                        {editing ? (
                          <input type="number" step="0.5" min="0" value={draft.daily_target ?? 2}
                            onChange={e => setDraft({ ...draft, daily_target: Number(e.target.value) })}
                            style={{ ...inputStyle, width: 80 }} />
                        ) : (a.daily_target ?? (a.shift_type === "part_time" ? 1 : 2))}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: SLATE }}>
                        {editing ? (
                          <input type="date" value={draft.hiring_date || ""} onChange={e => setDraft({ ...draft, hiring_date: e.target.value || null })} style={inputStyle} />
                        ) : a.hiring_date ? new Date(a.hiring_date).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {editing ? (
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                            <input type="checkbox" checked={!!draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />
                            Active
                          </label>
                        ) : (
                          <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                            background: a.is_active === false ? "#FEE2E2" : "#D1FAE5",
                            color: a.is_active === false ? "#991B1B" : "#065F46",
                          }}>{a.is_active === false ? "Inactive" : "Active"}</span>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {editing ? (
                          <>
                            <button onClick={() => saveEdit(a.id)} disabled={busyId === a.id} className="btn-brand" style={{ padding: "5px 12px", fontSize: 11 }}>
                              {busyId === a.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
                            </button>
                            <button onClick={() => { setEditingId(null); setDraft(null); }} style={iconBtn}><X size={12} /></button>
                          </>
                        ) : (
                          <>
                            {subUsers.has(a.name) ? (
                              <span title="Has login" style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, background: "#D1FAE5", color: "#065F46" }}>Has login</span>
                            ) : (
                              <button onClick={() => createLogin(a)} disabled={busyId === a.id} title="Create login for this agent"
                                style={{ ...iconBtn, color: "#0284C7", borderColor: "#BAE6FD", gap: 4, fontSize: 11, fontWeight: 700, padding: "5px 10px" }}>
                                <UserPlus size={12} /> Login
                              </button>
                            )}
                            <button onClick={() => startEdit(a)} title="Edit" style={iconBtn}><Pencil size={12} /></button>
                            <button onClick={() => remove(a)} disabled={busyId === a.id} title="Delete"
                              style={{ ...iconBtn, color: "#DC2626", borderColor: "#FBCFBE" }}>
                              {busyId === a.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          </>
                        )}
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
