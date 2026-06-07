"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { startImpersonation } from "@/lib/impersonation";
import {
  Users, ShieldCheck, RefreshCw, Loader2, UserPlus, Key, Trash2,
  Search, X, Phone, Power, CheckCircle2, AlertCircle, Database, TrendingUp, Eye,
} from "lucide-react";
import { T } from "@/app/_components/tokens";

const NAVY = T.text1;
const TEAL = "#2F6BFF";
const GOLD = "#2F6BFF";
const SLATE = T.text2;

interface UserRow {
  id: string;
  email: string;
  role: string;
  plan_tier: string;
  can_receive_leads: boolean;
  allow_call_uploads: boolean;
  created_at: string;
}

interface Stats { totalUsers: number; admins: number; activeForms: number; totalLeads: number; }

// Module-scope so it doesn't remount inputs on every keystroke
function Toggle({ on, onChange, busy }: { on: boolean; onChange: () => void; busy?: boolean }) {
  return (
    <button onClick={onChange} disabled={busy} style={{
      position: "relative", width: 38, height: 22, borderRadius: 999,
      background: on ? TEAL : "#D8DEE9", border: "none",
      cursor: busy ? "wait" : "pointer", padding: 0,
      transition: "background 240ms cubic-bezier(0.16,1,0.30,1)",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 18, height: 18, borderRadius: "50%", background: T.surface1,
        boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
        transition: "left 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }} />
    </button>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, admins: 0, activeForms: 0, totalLeads: 0 });

  // New user modal
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "user", plan_tier: "starter" });
  const [creating, setCreating] = useState(false);

  // Password modal
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [updatingPw, setUpdatingPw] = useState(false);

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, role, plan_tier, can_receive_leads, allow_call_uploads, created_at")
      .order("created_at", { ascending: false });

    const { count: leadsCount } = await supabase.from("leads").select("*", { count: "exact", head: true });
    const { count: formsCount } = await supabase.from("submission_forms").select("*", { count: "exact", head: true }).eq("is_active", true);

    const rows = (profiles || []) as UserRow[];
    setUsers(rows);
    setStats({
      totalUsers: rows.length,
      admins: rows.filter(u => u.role === "admin").length,
      activeForms: formsCount || 0,
      totalLeads: leadsCount || 0,
    });
    setLoading(false);
  };

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const getAuthHeader = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.password) return showToast("err", "Email + password required");
    setCreating(true);
    const auth = await getAuthHeader();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(newUser),
    });
    const json = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) return showToast("err", json.error || "Failed to create user");
    showToast("ok", `Created ${newUser.email}`);
    setNewUser({ email: "", password: "", role: "user", plan_tier: "starter" });
    setShowCreate(false);
    loadData();
  };

  const updatePassword = async () => {
    if (!pwUser || !newPassword) return;
    setUpdatingPw(true);
    const auth = await getAuthHeader();
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ userId: pwUser.id, password: newPassword }),
    });
    const json = await res.json().catch(() => ({}));
    setUpdatingPw(false);
    if (!res.ok) return showToast("err", json.error || "Failed to update password");
    showToast("ok", `Password updated for ${pwUser.email}`);
    setPwUser(null);
    setNewPassword("");
  };

  const deleteUser = async (u: UserRow) => {
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    const auth = await getAuthHeader();
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ userId: u.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return showToast("err", json.error || "Failed to delete");
    showToast("ok", "Deleted");
    loadData();
  };

  const actAs = async (u: UserRow) => {
    try {
      await startImpersonation(u.id);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Could not act as user");
    }
  };

  const toggle = async (u: UserRow, field: "can_receive_leads" | "allow_call_uploads") => {
    setSavingId(u.id);
    const val = !u[field];
    await supabase.from("profiles").update({ [field]: val }).eq("id", u.id);
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, [field]: val } : x));
    setSavingId(null);
  };

  const filtered = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div style={{ textAlign: "center", padding: "60px 24px" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: NAVY, margin: "0 auto 12px" }} />
      <p style={{ color: SLATE }}>Loading admin console...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ShieldCheck size={18} color={GOLD} />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>Owner Console</h1>
          </div>
          <p style={{ fontSize: 13, color: SLATE }}>Manage users, permissions, and platform health.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={loadData} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 14px", borderRadius: 9,
            background: T.surface1, color: NAVY, border: "1px solid rgba(35,43,58,0.10)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 9,
            background: T.midnight, color: "#fff", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(35,43,58,0.25)",
          }}>
            <UserPlus size={13} /> Create User
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: toast.type === "ok" ? "#ECFDF5" : "#FBEEE8",
          border: `1px solid ${toast.type === "ok" ? "#A7F3D0" : "#E7B8A6"}`,
          color: toast.type === "ok" ? "#059669" : "#DC2626",
          fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {toast.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {[
          { label: "Total Users", value: stats.totalUsers, icon: Users, color: NAVY },
          { label: "Admins", value: stats.admins, icon: ShieldCheck, color: GOLD },
          { label: "Active Forms", value: stats.activeForms, icon: Power, color: TEAL },
          { label: "Total Leads", value: stats.totalLeads, icon: Database, color: "#7C3AED" },
        ].map(s => (
          <Card key={s.label} padding={18}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s.icon size={15} color={s.color} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: SLATE }}>{s.label}</span>
            </div>
            <p style={{ fontSize: 26, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em" }}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 360 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search users by email..."
          style={{
            width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10,
            background: T.surface1, border: "1px solid rgba(35,43,58,0.10)",
            fontSize: 13, color: NAVY, outline: "none",
          }}
        />
      </div>

      {/* Users table */}
      <Card padding={0}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(35,43,58,0.06)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Users ({filtered.length})</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.surface3 }}>
                {["User", "Role", "Plan", "Receive Leads", "Call Uploads", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} style={{ borderTop: "1px solid rgba(35,43,58,0.05)" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: NAVY, fontWeight: 600 }}>{u.email}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: u.role === "admin" ? "#EAF0FF" : T.surface3,
                      color: u.role === "admin" ? "#92400E" : SLATE,
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: SLATE, textTransform: "capitalize" }}>{u.plan_tier || "—"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <Toggle on={u.can_receive_leads} onChange={() => toggle(u, "can_receive_leads")} busy={savingId === u.id} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Toggle on={u.allow_call_uploads} onChange={() => toggle(u, "allow_call_uploads")} busy={savingId === u.id} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => actAs(u)} title="Act as this user" style={{
                        padding: "5px 10px", borderRadius: 7,
                        background: T.navyLight, color: NAVY, border: "1px solid rgba(35,43,58,0.12)",
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <Eye size={11} /> Act as
                      </button>
                      <button onClick={() => setPwUser(u)} title="Change password" style={{
                        padding: "5px 10px", borderRadius: 7,
                        background: T.surface3, color: NAVY, border: "1px solid rgba(35,43,58,0.08)",
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <Key size={11} /> Password
                      </button>
                      <button onClick={() => deleteUser(u)} title="Delete" style={{
                        padding: "5px 8px", borderRadius: 7,
                        background: "#FBEEE8", color: "#DC2626", border: "1px solid #E7B8A6",
                        cursor: "pointer", display: "flex", alignItems: "center",
                      }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", fontSize: 13, color: SLATE }}>No users.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create User Modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Create New User">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModalInput label="Email" type="email" value={newUser.email} onChange={v => setNewUser({ ...newUser, email: v })} placeholder="user@example.com" />
            <ModalInput label="Password" type="password" value={newUser.password} onChange={v => setNewUser({ ...newUser, password: v })} placeholder="Minimum 6 characters" />
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 6 }}>Role</label>
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} style={modalInputStyle}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 6 }}>Plan</label>
              <select value={newUser.plan_tier} onChange={e => setNewUser({ ...newUser, plan_tier: e.target.value })} style={modalInputStyle}>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <button onClick={createUser} disabled={creating} style={modalBtnStyle(creating)}>
              {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : <><UserPlus size={14} /> Create User</>}
            </button>
          </div>
        </Modal>
      )}

      {/* Password Modal */}
      {pwUser && (
        <Modal onClose={() => { setPwUser(null); setNewPassword(""); }} title={`New Password for ${pwUser.email}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModalInput label="New Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="Minimum 6 characters" />
            <button onClick={updatePassword} disabled={updatingPw || !newPassword} style={modalBtnStyle(updatingPw || !newPassword)}>
              {updatingPw ? <><Loader2 size={14} className="animate-spin" /> Updating...</> : <><Key size={14} /> Update Password</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Module-scope to keep input identity stable
const modalInputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  background: T.surface3, border: "1px solid rgba(35,43,58,0.10)",
  fontSize: 13, color: NAVY, outline: "none",
};

const modalBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "11px 16px", borderRadius: 10,
  background: disabled ? "#E5E9F0" : NAVY,
  color: disabled ? SLATE : "#fff",
  fontSize: 13, fontWeight: 700, border: "none",
  cursor: disabled ? "not-allowed" : "pointer",
  marginTop: 6,
});

function ModalInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={modalInputStyle} />
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(35,43,58,0.50)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      backdropFilter: "blur(4px)", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.surface1, borderRadius: 16, padding: 28, maxWidth: 440, width: "100%",
        boxShadow: "0 24px 80px rgba(35,43,58,0.30)",
      }} className="animate-scale">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>{title}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: SLATE, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
