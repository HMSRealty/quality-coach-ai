"use client";

// Per-tenant Readymode admin credentials card. Lets each org owner save
// their dialer subdomain + admin username/password (encrypted at rest)
// so the recording-fetch worker can log in on their behalf.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Link as LinkIcon, Loader2, CheckCircle2, XCircle, Trash2, ShieldCheck, Eye, EyeOff } from "lucide-react";

const SKY = "#0EA5E9";
const SKY_600 = "#0284C7";
const MONEY = "#059669";

interface ConnectionStatus {
  subdomain: string | null;
  username: string | null;
  last_used_at: string | null;
  last_login_ok: boolean | null;
  last_error: string | null;
  updated_at: string | null;
}

export function ReadymodeConnectionCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [envFallback, setEnvFallback] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const r = await fetch("/api/readymode/connection", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      setConn(j.connection || null);
      setEnvFallback(!!j.env_fallback_active);
      if (j.connection) {
        setSubdomain(j.connection.subdomain || "");
        setUsername(j.connection.username || "");
      }
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!subdomain.trim() || !username.trim() || !password.trim()) {
      setMsg({ type: "err", text: "All three fields are required." });
      return;
    }
    setSaving(true); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/readymode/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ subdomain: subdomain.trim(), username: username.trim(), password }),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok || !j.ok) {
      setMsg({ type: "err", text: j.error || "Save failed" });
      return;
    }
    if (j.verified === false) {
      setMsg({ type: "err", text: `Saved, but login verification failed (status ${j.login_status}). Check the password.` });
    } else {
      setMsg({ type: "ok", text: "Connection saved and verified." });
      setPassword("");
    }
    await load();
  };

  const test = async () => {
    if (!subdomain.trim() || !username.trim() || !password.trim()) {
      setMsg({ type: "err", text: "Fill all fields to test." });
      return;
    }
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
    else setMsg({ type: "err", text: `Login failed (status ${j.login_status}). Double-check the credentials.` });
  };

  const remove = async () => {
    if (!confirm("Remove the Readymode connection? Recording fetch will stop until you re-add it.")) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/readymode/connection", { method: "DELETE", headers: { Authorization: `Bearer ${session?.access_token}` } });
    setSubdomain(""); setUsername(""); setPassword("");
    setMsg({ type: "ok", text: "Removed." });
    await load();
  };

  const card: React.CSSProperties = {
    background: "#fff", border: "1px solid var(--border-2)", borderRadius: 14,
    padding: 22, boxShadow: "var(--shadow-sm)",
  };
  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--border-2)",
    background: "#fff", color: "#000", fontSize: 13, outline: "none",
    fontFamily: "var(--font-mono)",
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.05em", color: "var(--text-3)", marginBottom: 5, display: "block",
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <LinkIcon size={16} color={SKY_600} /> Readymode Connection
        </p>
        {conn && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
            background: conn.last_login_ok === false ? "#FEF2F2" : "#ECFDF5",
            color: conn.last_login_ok === false ? "#DC2626" : MONEY,
          }}>
            {conn.last_login_ok === false ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
            {conn.last_login_ok === false ? "Last login failed" : "Verified"}
          </span>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 14 }}>
        Saves an encrypted Readymode admin login so the recording fetcher can pull call audio for each lead.
        {envFallback && " A platform-wide fallback is currently active — set your own here to override it."}
      </p>

      {loading ? <Loader2 size={18} className="animate-spin" style={{ color: SKY_600 }} /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div>
              <label style={lbl}>Subdomain</label>
              <input value={subdomain} onChange={e => setSubdomain(e.target.value)} placeholder="hmsrealty" style={inp} />
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{subdomain ? `→ https://${subdomain.replace(/\./g, "").replace(/^https?:\/\//, "")}.readymode.com` : "Your dialer subdomain only — no https:// or .readymode.com"}</p>
            </div>
            <div>
              <label style={lbl}>Admin Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="api_user" style={inp} />
            </div>
            <div>
              <label style={lbl}>Admin Password</label>
              <div style={{ position: "relative" }}>
                <input value={password} onChange={e => setPassword(e.target.value)}
                  type={showPw ? "text" : "password"}
                  placeholder={conn ? "••••••••  (leave blank to keep current)" : "Password"} style={{ ...inp, paddingRight: 38 }} />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4 }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {msg && (
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 8,
              background: msg.type === "ok" ? "#ECFDF5" : "#FEF2F2",
              border: `1px solid ${msg.type === "ok" ? "#A7F3D0" : "#FECACA"}`,
              color: msg.type === "ok" ? MONEY : "#DC2626",
              fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7,
            }}>
              {msg.type === "ok" ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {msg.text}
            </div>
          )}

          <div style={{ display: "flex", gap: 9, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={save} disabled={saving} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 18px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#0EA5E9,#0284C7)", color: "#fff",
              fontSize: 13, fontWeight: 800, cursor: saving ? "wait" : "pointer",
            }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Save Connection
            </button>
            <button onClick={test} disabled={testing} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 14px", borderRadius: 9, border: "1px solid var(--border-2)",
              background: "#fff", color: "#000", fontSize: 12.5, fontWeight: 700, cursor: testing ? "wait" : "pointer",
            }}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Test Login
            </button>
            {conn && (
              <button onClick={remove} style={{
                marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
                padding: "9px 12px", borderRadius: 9, border: "1px solid #FECACA",
                background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>

          {conn?.last_error && (
            <p style={{ fontSize: 11.5, color: "#DC2626", marginTop: 10 }}>Last error: {conn.last_error}</p>
          )}
        </>
      )}
    </div>
  );
}
