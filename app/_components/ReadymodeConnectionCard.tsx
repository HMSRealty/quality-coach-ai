"use client";

// Manage multiple Readymode dialer connections per user. Each dialer has its
// own subdomain + admin login. Recording fetch tries each enabled dialer
// in turn so a lead can come from any of them.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Link as LinkIcon, Loader2, CheckCircle2, XCircle, Trash2, ShieldCheck, Eye, EyeOff, Plus, Server } from "lucide-react";

const NAVY = "#15131D";
const SLATE = "#6B6880";
const MONEY = "#2563EB";
const SKY_600 = "#2563EB";

interface Connection {
  id: string;
  label: string | null;
  subdomain: string;
  username: string;
  is_active: boolean;
  last_used_at: string | null;
  last_login_ok: boolean | null;
  last_error: string | null;
}

export function ReadymodeConnectionCard() {
  const [list, setList] = useState<Connection[]>([]);
  const [envFallback, setEnvFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [label, setLabel] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const r = await fetch("/api/readymode/connection", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const j = await r.json().catch(() => ({}));
    setList((j.connections || []) as Connection[]);
    setEnvFallback(!!j.env_fallback_active);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setLabel(""); setSubdomain(""); setUsername(""); setPassword(""); setShowPw(false); };

  const test = async () => {
    if (!subdomain.trim() || !username.trim() || !password.trim()) { setMsg({ type: "err", text: "Fill all fields to test." }); return; }
    setTesting(true); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/readymode/connection?test=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ subdomain: subdomain.trim(), username: username.trim(), password }),
    });
    const j = await r.json().catch(() => ({}));
    setTesting(false);
    if (j.ok) setMsg({ type: "ok", text: `Login OK (status ${j.login_status}).` });
    else setMsg({ type: "err", text: `Login failed (status ${j.login_status}). Check credentials.` });
  };

  const save = async () => {
    if (!subdomain.trim() || !username.trim() || !password.trim()) { setMsg({ type: "err", text: "All fields required." }); return; }
    setBusy(true); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/readymode/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ label: label.trim() || null, subdomain: subdomain.trim(), username: username.trim(), password }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !j.ok) { setMsg({ type: "err", text: j.error || "Save failed" }); return; }
    if (j.verified === false) setMsg({ type: "err", text: `Saved, but login failed (status ${j.login_status}). Check password.` });
    else { setMsg({ type: "ok", text: "Connection saved and verified." }); reset(); setAdding(false); }
    await load();
  };

  const toggle = async (c: Connection) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/readymode/connection?id=${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ is_active: !c.is_active }),
    });
    await load();
  };

  const remove = async (c: Connection) => {
    if (!confirm(`Remove "${c.label || c.subdomain}"?`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/readymode/connection?id=${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session?.access_token}` } });
    await load();
  };

  const card: React.CSSProperties = { background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 14, padding: 22, boxShadow: "var(--shadow-sm)" };
  const inp: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--border-2)", background: "#FFFFFF", color: "#15131D", fontSize: 13, outline: "none", fontFamily: "var(--font-mono)" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", marginBottom: 5, display: "block" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: "#15131D", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <LinkIcon size={16} color={SKY_600} /> Readymode Dialers
        </p>
        <button onClick={() => { setAdding(a => !a); setMsg(null); reset(); }} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "7px 12px", borderRadius: 8,
          background: adding ? "var(--surface-3)" : "linear-gradient(135deg,#3B82F6,#2563EB)",
          color: adding ? NAVY : "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
        }}>
          <Plus size={13} /> {adding ? "Cancel" : "Add Dialer"}
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 14 }}>
        Add one connection per Readymode dialer your team uses. Each is stored encrypted and tried in order when fetching recordings.
        {envFallback && " A platform default is currently active — add yours below to override it."}
      </p>

      {adding && (
        <div style={{ background: "#F1F2F8", border: "1px solid var(--border-1)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div>
              <label style={lbl}>Label (optional)</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Main dialer" style={{ ...inp, fontFamily: "inherit" }} />
            </div>
            <div>
              <label style={lbl}>Subdomain</label>
              <input value={subdomain} onChange={e => setSubdomain(e.target.value)} placeholder="acme" style={inp} />
            </div>
            <div>
              <label style={lbl}>Admin Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="api_user" style={inp} />
            </div>
            <div>
              <label style={lbl}>Admin Password</label>
              <div style={{ position: "relative" }}>
                <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="Password" style={{ ...inp, paddingRight: 38 }} />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4 }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {msg && (
            <div style={{
              marginTop: 12, padding: "9px 12px", borderRadius: 8,
              background: msg.type === "ok" ? "rgba(52,211,153,0.12)" : "rgba(251,113,133,0.12)",
              color: msg.type === "ok" ? MONEY : "#DC2626",
              border: `1px solid ${msg.type === "ok" ? "#A7F3D0" : "#FECACA"}`,
              fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7,
            }}>
              {msg.type === "ok" ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {msg.text}
            </div>
          )}

          <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
            <button onClick={save} disabled={busy} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 18px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#3B82F6,#2563EB)", color: "#fff",
              fontSize: 13, fontWeight: 800, cursor: busy ? "wait" : "pointer",
            }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Save
            </button>
            <button onClick={test} disabled={testing} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 14px", borderRadius: 9, border: "1px solid var(--border-2)",
              background: "#FFFFFF", color: "#15131D", fontSize: 12.5, fontWeight: 700, cursor: testing ? "wait" : "pointer",
            }}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Test Login
            </button>
          </div>
        </div>
      )}

      {loading ? <Loader2 size={18} className="animate-spin" style={{ color: SKY_600 }} /> : list.length === 0 ? (
        <p style={{ fontSize: 13, color: SLATE }}>No dialers connected yet. Click <strong>Add Dialer</strong> to register your first one.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {list.map(c => {
            const ok = c.is_active && c.last_login_ok !== false;
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "11px 14px", borderRadius: 10,
                background: c.is_active ? "#F1F2F8" : "rgba(251,113,133,0.12)",
                border: `1px solid ${c.is_active ? "var(--border-1)" : "#FECACA"}`,
                opacity: c.is_active ? 1 : 0.7,
              }}>
                <Server size={15} color={ok ? MONEY : c.is_active ? "#F59E0B" : "#DC2626"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: "flex", alignItems: "center", gap: 6 }}>
                    {c.label || c.subdomain}
                    {!c.is_active && <span style={{ fontSize: 9, color: "#DC2626", fontWeight: 800 }}>● DISABLED</span>}
                    {c.last_login_ok === false && <span style={{ fontSize: 9, color: "#F59E0B", fontWeight: 800 }}>● LOGIN FAILED</span>}
                  </p>
                  <p style={{ fontSize: 11, color: SLATE, marginTop: 1, fontFamily: "var(--font-mono)" }}>
                    {c.subdomain}.readymode.com · {c.username}
                  </p>
                </div>
                <button onClick={() => toggle(c)} title={c.is_active ? "Pause" : "Resume"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-2)", background: "#FFFFFF", color: NAVY, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                  {c.is_active ? "Pause" : "Resume"}
                </button>
                <button onClick={() => remove(c)} title="Remove"
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
