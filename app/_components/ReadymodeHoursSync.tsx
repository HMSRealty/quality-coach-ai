"use client";

// Pull the Readymode Agent Report into RealTrack on demand. Pick a dialer,
// pick a date range, click sync. The endpoint logs into the dialer using the
// stored encrypted credentials and parses the report into per-agent rows.
// Synced rows can then be assigned to a RealTrack user so the hours roll into
// payroll.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Server, RefreshCw, CheckCircle2, AlertCircle, CalendarDays } from "lucide-react";

const NAVY = "#15131D";
const SLATE = "#6B6880";
const MONEY = "#2563EB";
const MONEY_LT = "#3B82F6";

interface Connection { id: string; label: string | null; subdomain: string; is_active: boolean; report_url: string | null; }
interface UserOption { id: string; email: string | null; full_name: string | null; }
interface Row {
  id: string;
  connection_id: string | null;
  assigned_user_id: string | null;
  agent_name: string;
  agent_email: string | null;
  period_from: string;
  period_to: string;
  shift_start: string | null;
  shift_end: string | null;
  logged_minutes: number;
  payable_minutes: number;
  ready_minutes: number;
  break_minutes: number;
  lunch_minutes: number;
  afk_minutes: number;
  synced_at: string;
}

function fmtMin(n: number | null | undefined): string {
  if (!n) return "—";
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const d2 = new Date(now);
  const d1 = new Date(now); d1.setDate(d1.getDate() - 14);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(d1), to: iso(d2) };
}

export function ReadymodeHoursSync() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [{ from, to }, setRange] = useState(defaultRange());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string; debug?: unknown } | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const auth = { Authorization: `Bearer ${session.access_token}` };

    const [connR, uR, rowsR] = await Promise.all([
      fetch("/api/readymode/connection", { headers: auth }),
      fetch("/api/users/list", { headers: auth }),
      fetch(`/api/readymode/agent-report?from=${from}&to=${to}`, { headers: auth }),
    ]);
    const connJ = await connR.json().catch(() => ({}));
    const uJ = await uR.json().catch(() => ({}));
    const rowsJ = await rowsR.json().catch(() => ({}));

    const conns = (connJ.connections || []) as Connection[];
    setConnections(conns);
    if (!connectionId && conns[0]) setConnectionId(conns[0].id);
    setUsers((uJ.users || []) as UserOption[]);
    setRows((rowsJ.rows || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const sync = async () => {
    if (!connectionId) { setMsg({ type: "err", text: "Pick a dialer connection first." }); return; }
    if (!from || !to) { setMsg({ type: "err", text: "Pick a date range." }); return; }
    setSyncing(true); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/readymode/agent-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ connection_id: connectionId, from, to }),
    });
    const j = await r.json().catch(() => ({}));
    setSyncing(false);
    if (!r.ok || !j.ok) {
      // Surface diagnostic detail (attempts, status codes, body previews)
      // so we can see WHY the sync failed instead of a generic "Sync failed".
      setMsg({
        type: "err",
        text: j.error || `Sync failed (HTTP ${r.status})`,
        debug: { http_status: r.status, ...j },
      });
      return;
    }
    setMsg({ type: "ok", text: `Synced ${j.count} agent${j.count === 1 ? "" : "s"} from Readymode.` });
    await loadAll();
  };

  const reassign = async (row: Row, newUserId: string) => {
    setReassigning(row.id);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/readymode/agent-report?id=${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ assigned_user_id: newUserId || null }),
    });
    setRows((p) => p.map((x) => (x.id === row.id ? { ...x, assigned_user_id: newUserId || null } : x)));
    setReassigning(null);
  };

  const userLabel = (id: string | null) => {
    if (!id) return "Unassigned";
    const u = users.find((x) => x.id === id);
    return u ? (u.full_name || u.email || id.slice(0, 8)) : id.slice(0, 8);
  };

  const inp: React.CSSProperties = {
    padding: "9px 11px", borderRadius: 9, border: "1px solid var(--border-2)",
    background: "#FFFFFF", color: NAVY, fontSize: 13, outline: "none",
  };
  const card: React.CSSProperties = {
    background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 14,
    padding: 22, boxShadow: "var(--shadow-sm)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Sync controls */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, background: "rgba(59,130,246,0.14)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Server size={16} color={MONEY} />
          </span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Auto-fetch from Readymode</p>
            <p style={{ fontSize: 11.5, color: SLATE, marginTop: 2 }}>
              Logs into your saved dialer connection and pulls the Agent Report for any date range.
            </p>
          </div>
        </div>

        {connections.length === 0 ? (
          <div style={{
            padding: 14, borderRadius: 10, background: "rgba(245,158,11,0.12)",
            border: "1px solid #FDE68A", color: "#F59E0B", fontSize: 13,
          }}>
            No Readymode connection yet. Add one in{" "}
            <a href="/dashboard/integrations" style={{ color: MONEY, fontWeight: 700 }}>Integrations</a> first.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr)) auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: SLATE, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Dialer</label>
              <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} style={{ ...inp, width: "100%" }}>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.label || c.subdomain}{!c.is_active ? " (paused)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: SLATE, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}><CalendarDays size={10} style={{ display: "inline", marginRight: 4 }} />From</label>
              <input type="date" value={from} onChange={(e) => setRange({ from: e.target.value, to })} style={{ ...inp, width: "100%" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: SLATE, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>To</label>
              <input type="date" value={to} onChange={(e) => setRange({ from, to: e.target.value })} style={{ ...inp, width: "100%" }} />
            </div>
            <button onClick={sync} disabled={syncing || !connectionId} style={{
              padding: "10px 18px", borderRadius: 10, border: "none",
              background: syncing ? "#86EFAC" : "linear-gradient(135deg,#3B82F6,#2563EB)",
              color: "#fff", fontSize: 13, fontWeight: 800,
              cursor: syncing ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              whiteSpace: "nowrap",
            }}>
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync now
            </button>
          </div>
        )}

        {msg && (
          <div style={{
            marginTop: 12, padding: "9px 12px", borderRadius: 9,
            background: msg.type === "ok" ? "rgba(52,211,153,0.12)" : "rgba(251,113,133,0.12)",
            color: msg.type === "ok" ? MONEY : "#DC2626",
            border: `1px solid ${msg.type === "ok" ? "#A7F3D0" : "#FECACA"}`,
            fontSize: 12.5, fontWeight: 600,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {msg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}
            </div>
            {msg.debug != null && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#7F1D1D" }}>
                  Show diagnostic details
                </summary>
                <pre style={{
                  marginTop: 6, padding: 10, borderRadius: 7, background: "#FFFFFF",
                  border: "1px solid #FECACA", color: "#15131D", fontSize: 11,
                  maxHeight: 360, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  fontFamily: "var(--font-mono)",
                }}>
                  {JSON.stringify(msg.debug, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Synced rows */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Synced hours</p>
          <p style={{ fontSize: 11.5, color: SLATE }}>
            Showing {rows.length} row{rows.length === 1 ? "" : "s"} · assign each to a RealTrack user to roll into payroll.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Loader2 size={22} className="animate-spin" style={{ color: MONEY }} />
          </div>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: SLATE, padding: 20, textAlign: "center" }}>
            Nothing synced yet. Pick a dialer + date range above and click Sync now.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#F1F2F8", color: SLATE }}>
                  {["Agent", "Period", "Logged", "Payable", "Ready", "Break", "Lunch", "AFK", "Assign to"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                    <td style={{ padding: "10px 12px", color: NAVY, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {r.agent_name}
                      {r.agent_email && <span style={{ fontSize: 10, fontWeight: 500, color: SLATE, marginLeft: 6 }}>{r.agent_email}</span>}
                    </td>
                    <td style={{ padding: "10px 12px", color: SLATE, whiteSpace: "nowrap" }}>{r.period_from} → {r.period_to}</td>
                    <td style={{ padding: "10px 12px", color: NAVY, fontWeight: 700 }}>{fmtMin(r.logged_minutes)}</td>
                    <td style={{ padding: "10px 12px", color: MONEY, fontWeight: 800 }}>{fmtMin(r.payable_minutes)}</td>
                    <td style={{ padding: "10px 12px", color: NAVY }}>{fmtMin(r.ready_minutes)}</td>
                    <td style={{ padding: "10px 12px", color: SLATE }}>{fmtMin(r.break_minutes)}</td>
                    <td style={{ padding: "10px 12px", color: SLATE }}>{fmtMin(r.lunch_minutes)}</td>
                    <td style={{ padding: "10px 12px", color: SLATE }}>{fmtMin(r.afk_minutes)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <select
                        value={r.assigned_user_id || ""}
                        onChange={(e) => reassign(r, e.target.value)}
                        disabled={reassigning === r.id}
                        style={{ ...inp, padding: "5px 8px", fontSize: 11, maxWidth: 180 }}
                        title={userLabel(r.assigned_user_id)}
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name || u.email || u.id.slice(0, 8)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
