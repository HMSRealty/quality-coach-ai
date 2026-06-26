"use client";

// Manage a pool of Gemini API keys per user. Multiple keys reduce risk
// of hitting rate limits — the analyzer rotates through them and disables
// any key with 5 consecutive errors.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Key, Plus, Trash2, Loader2, CheckCircle2, XCircle, Sparkles, Eye, EyeOff, AlertTriangle, Play, Pause } from "lucide-react";

const NAVY = "#15131D";
const SLATE = "#6B6880";
const SKY = "#3B82F6";
const SKY_600 = "#2563EB";
const MONEY = "#2563EB";

interface KeyRow {
  id: string;
  label: string | null;
  is_active: boolean;
  last_used_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  assigned_user_id: string | null;
}
interface UserOption { id: string; email: string | null; full_name: string | null; }

export function GeminiKeysCard() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const auth = { Authorization: `Bearer ${session.access_token}` };
    const [r, ur] = await Promise.all([
      fetch("/api/gemini/keys", { headers: auth }),
      fetch("/api/users/list", { headers: auth }),
    ]);
    const j = await r.json().catch(() => ({}));
    const uj = await ur.json().catch(() => ({}));
    setKeys((j.keys || []) as KeyRow[]);
    setUsers((uj.users || []) as UserOption[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const userLabel = (id: string | null) => {
    if (!id) return "Unassigned (pool)";
    const u = users.find(x => x.id === id);
    return u ? (u.full_name || u.email || id.slice(0, 8)) : id.slice(0, 8);
  };

  const add = async () => {
    if (!keyValue.trim()) { setMsg({ type: "err", text: "Paste a Gemini API key." }); return; }
    setBusy(true); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/gemini/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ label: label.trim() || null, key: keyValue.trim(), assigned_user_id: assignTo || null }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !j.ok) { setMsg({ type: "err", text: j.error || "Add failed" }); return; }
    setMsg({ type: "ok", text: "Key added to rotation." });
    setLabel(""); setKeyValue(""); setAssignTo(""); setAdding(false);
    await load();
  };

  const reassign = async (k: KeyRow, newUserId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/gemini/keys?id=${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ assigned_user_id: newUserId || null }),
    });
    await load();
  };

  const toggle = async (k: KeyRow) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/gemini/keys?id=${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ is_active: !k.is_active, reset_errors: !k.is_active }),
    });
    await load();
  };

  const remove = async (k: KeyRow) => {
    if (!confirm(`Remove ${k.label || "this key"} from the rotation?`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/gemini/keys?id=${k.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    await load();
  };

  const card: React.CSSProperties = { background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 14, padding: 22, boxShadow: "var(--shadow-sm)" };
  const inp: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--border-2)", background: "#FFFFFF", color: "#15131D", fontSize: 13, outline: "none", fontFamily: "var(--font-mono)" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: "#15131D", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} color={SKY_600} /> Gemini API Key Pool
        </p>
        <button onClick={() => setAdding(a => !a)} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "7px 12px", borderRadius: 8,
          background: adding ? "var(--surface-3)" : "linear-gradient(135deg,#3B82F6,#2563EB)",
          color: adding ? NAVY : "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
        }}>
          <Plus size={13} /> {adding ? "Cancel" : "Add Key"}
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 14 }}>
        Add as many Gemini keys as you have. The analyzer rotates through them automatically — when one hits rate limits, the next takes over. Keys with 5 consecutive errors auto-disable. Get keys at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: SKY_600 }}>aistudio.google.com/apikey</a>.
      </p>

      {adding && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: 9, marginBottom: 14, alignItems: "end" }}>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" style={{ ...inp, fontFamily: "inherit" }} />
          <div style={{ position: "relative" }}>
            <input value={keyValue} onChange={e => setKeyValue(e.target.value)} type={showKey ? "text" : "password"} placeholder="AIzaSy..." style={{ ...inp, paddingRight: 38 }} />
            <button type="button" onClick={() => setShowKey(s => !s)}
              style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4 }}>
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
            style={{ ...inp, fontFamily: "inherit" }} title="Assign to user">
            <option value="">Unassigned (pool)</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email || u.id.slice(0, 8)}</option>)}
          </select>
          <button onClick={add} disabled={busy} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "9px 16px", borderRadius: 9, border: "none",
            background: MONEY, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: busy ? "wait" : "pointer",
          }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Save
          </button>
        </div>
      )}

      {msg && (
        <div style={{
          marginBottom: 12, padding: "9px 12px", borderRadius: 8,
          background: msg.type === "ok" ? "rgba(52,211,153,0.12)" : "rgba(251,113,133,0.12)",
          color: msg.type === "ok" ? MONEY : "#DC2626",
          border: `1px solid ${msg.type === "ok" ? "#A7F3D0" : "#FECACA"}`,
          fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7,
        }}>
          {msg.type === "ok" ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {msg.text}
        </div>
      )}

      {loading ? <Loader2 size={18} className="animate-spin" style={{ color: SKY_600 }} /> : keys.length === 0 ? (
        <p style={{ fontSize: 13, color: SLATE }}>No keys added yet. The platform default is being used.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {keys.map((k) => {
            const ok = k.consecutive_errors === 0 && k.is_active;
            return (
              <div key={k.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10,
                background: k.is_active ? "#F1F2F8" : "rgba(251,113,133,0.12)",
                border: `1px solid ${k.is_active ? "var(--border-1)" : "#FECACA"}`,
                opacity: k.is_active ? 1 : 0.7,
              }}>
                <Key size={14} color={ok ? MONEY : k.is_active ? "#F59E0B" : "#DC2626"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                    {k.label || "(unlabeled)"}
                    {!k.is_active && <span style={{ fontSize: 9, color: "#DC2626", fontWeight: 800, marginLeft: 8 }}>● DISABLED</span>}
                  </p>
                  <p style={{ fontSize: 11, color: SLATE, marginTop: 1 }}>
                    Assigned to <strong style={{ color: NAVY }}>{userLabel(k.assigned_user_id)}</strong>
                    {k.last_used_at && <span> · used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                    {k.consecutive_errors > 0 && (
                      <span style={{ color: "#F59E0B", fontWeight: 700, marginLeft: 8 }}>
                        <AlertTriangle size={10} style={{ display: "inline", marginRight: 3 }} />
                        {k.consecutive_errors} errors
                      </span>
                    )}
                  </p>
                </div>
                <select value={k.assigned_user_id || ""} onChange={e => reassign(k, e.target.value)}
                  title="Reassign" style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border-2)", background: "#FFFFFF", color: NAVY, fontSize: 11, maxWidth: 140 }}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email || u.id.slice(0, 8)}</option>)}
                </select>
                <button onClick={() => toggle(k)} title={k.is_active ? "Pause" : "Resume"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-2)", background: "#FFFFFF", color: NAVY, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                  {k.is_active ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
                </button>
                <button onClick={() => remove(k)} title="Remove"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
