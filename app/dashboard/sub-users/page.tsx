"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { startImpersonation } from "@/lib/impersonation";
import { UserPlus, Loader2, Eye, CheckCircle2, AlertCircle, UserCog } from "lucide-react";

const NAVY = "#0B0F19";
const SLATE = "#4B5563";

interface SubUser { id: string; email: string; plan_tier: string; created_at: string; }

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  background: "#F7F8FA", border: "1px solid rgba(11,15,25,0.10)",
  fontSize: 13, color: NAVY, outline: "none",
};

export default function SubUsersPage() {
  const [me, setMe] = useState<string>("");
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", plan_tier: "starter" });
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setMe(user.id);
    const { data } = await supabase
      .from("profiles")
      .select("id, email, plan_tier, created_at")
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false });
    setSubUsers((data || []) as SubUser[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const createSubUser = async () => {
    if (!form.email || !form.password) return showToast("err", "Email and password required");
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email: form.email, password: form.password, plan_tier: form.plan_tier }),
    });
    const json = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) return showToast("err", json.error || "Failed to create sub-user");
    showToast("ok", `Created ${form.email}`);
    setForm({ email: "", password: "", plan_tier: "starter" });
    load();
  };

  const actAs = async (id: string) => {
    setActingId(id);
    try {
      await startImpersonation(id);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Could not act as user");
      setActingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Sub-Users</h1>
        <p style={{ fontSize: 13, color: SLATE }}>Create accounts under you and act as them when needed.</p>
      </div>

      {toast && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: toast.type === "ok" ? "#ECFDF5" : "#FBEEE8",
          border: `1px solid ${toast.type === "ok" ? "#A7F3D0" : "#E7B8A6"}`,
          color: toast.type === "ok" ? "#059669" : "#DC2626",
          fontSize: 13, fontWeight: 600, display: "flex", gap: 8, alignItems: "center",
        }}>
          {toast.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <Card title="Create a Sub-User">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          <input type="text" placeholder="Temporary password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select value={form.plan_tier} onChange={e => setForm({ ...form, plan_tier: e.target.value })} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button onClick={createSubUser} disabled={creating} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "10px 18px", borderRadius: 10,
            background: NAVY, color: "#fff", border: "none",
            fontSize: 13, fontWeight: 700, cursor: creating ? "wait" : "pointer",
          }}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Create
          </button>
        </div>
      </Card>

      <Card padding={0}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(11,15,25,0.06)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Your Sub-Users ({subUsers.length})</h3>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Loader2 size={22} className="animate-spin" style={{ color: NAVY, margin: "0 auto" }} />
          </div>
        ) : subUsers.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: SLATE }}>
            <UserCog size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No sub-users yet.</p>
          </div>
        ) : (
          <div>
            {subUsers.map(u => (
              <div key={u.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px", borderTop: "1px solid rgba(11,15,25,0.05)",
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%", background: NAVY, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800,
                }}>{u.email.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{u.email}</p>
                  <p style={{ fontSize: 11, color: SLATE, textTransform: "capitalize" }}>{u.plan_tier} plan</p>
                </div>
                <button onClick={() => actAs(u.id)} disabled={actingId === u.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 8,
                  background: "#EEF1F6", color: NAVY, border: "1px solid rgba(11,15,25,0.10)",
                  fontSize: 12, fontWeight: 700, cursor: actingId === u.id ? "wait" : "pointer",
                }}>
                  {actingId === u.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Act as
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
