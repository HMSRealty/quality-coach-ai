"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Download, Loader2, CheckCircle2, AlertCircle, FileUp, ShieldAlert, Trash2 } from "lucide-react";
import { Card } from "@/app/_components/Card";

const RED = "#232B3A";

export default function SettingsPage() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csv = `Manager,Agent Name,Team Name,Trainer Name,Hiring Date
john@example.com,John Smith,Sales Team A,Sarah Johnson,2024-01-15
john@example.com,Jane Doe,Sales Team A,Sarah Johnson,2024-02-01
jane@example.com,Bob Wilson,Sales Team B,Mike Brown,2024-01-20
jane@example.com,Alice Johnson,Sales Team B,Mike Brown,2024-03-10`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const text = await file.text();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const response = await fetch("/api/csv-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ csv: text, userId: user.id }),
      });

      // Safely read body whether server returned JSON, HTML, or empty
      const raw = await response.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch {
        const snippet = raw.slice(0, 120).replace(/\s+/g, " ");
        throw new Error(
          `Server returned non-JSON (HTTP ${response.status}). ` +
          `Likely the API route is missing or the server crashed before responding. ` +
          `First bytes: ${snippet}`
        );
      }

      if (!response.ok) {
        throw new Error(parsed?.error || `Import failed (HTTP ${response.status})`);
      }

      const stats = parsed?.stats ?? {};
      let msg = `Imported ${stats.rows ?? 0} records: ${stats.teams ?? 0} teams, ${stats.callers ?? 0} callers, ${stats.trainers ?? 0} trainers.`;
      if (stats.errors?.length) msg += ` ${stats.errors.length} row(s) had issues — check server logs.`;
      setMessage({ type: "success", text: msg });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Import failed",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  return (
    <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#232B3A", marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: "#64748B" }}>Manage your team structure and organization.</p>
      </div>

      {/* Messages */}
      {message && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: message.type === "success" ? "#ECFDF5" : "#FBEEE8",
          border: `1px solid ${message.type === "success" ? "#A7F3D0" : "#E7B8A6"}`,
          display: "flex", alignItems: "center", gap: 10,
          color: message.type === "success" ? "#059669" : RED,
          fontSize: 13, fontWeight: 600,
        }}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Team Import */}
      <Card title="Import Team Structure">
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 14, lineHeight: 1.65 }}>
          Upload a CSV file to bulk import your team members, trainers, and managers. This will automatically create teams, assign agents, and set up trainers for your organization.
        </p>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button onClick={downloadTemplate} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 8,
            background: "#F3F4F6", border: "1px solid #E5E7EB",
            color: "#334155", fontSize: 12, fontWeight: 600, cursor: "pointer",
            transition: "all 120ms ease",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#E5E7EB"}
          onMouseLeave={e => e.currentTarget.style.background = "#F3F4F6"}
          >
            <Download size={13} /> Download Template
          </button>
        </div>

        {/* File Upload */}
        <div
          style={{
            padding: "28px 20px", borderRadius: 10,
            border: "2px dashed #E5E7EB", background: "#FAFAFA",
            textAlign: "center", cursor: "pointer",
            transition: "all 120ms ease",
          }}
          onDragOver={e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = RED;
            e.currentTarget.style.background = "#FBEEE8";
          }}
          onDragLeave={e => {
            e.currentTarget.style.borderColor = "#E5E7EB";
            e.currentTarget.style.background = "#FAFAFA";
          }}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = "#E5E7EB";
            e.currentTarget.style.background = "#FAFAFA";
            const file = e.dataTransfer.files[0];
            if (file) {
              if (fileInputRef.current) fileInputRef.current.files = e.dataTransfer.files;
              handleFileUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp size={28} style={{ margin: "0 auto 10px", color: "#94A3B8" }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: "#232B3A", marginBottom: 4 }}>
            {uploading ? "Uploading..." : "Drop CSV file or click to browse"}
          </p>
          <p style={{ fontSize: 11, color: "#64748B" }}>CSV with Manager, Agent Name, Team Name, Trainer Name, Hiring Date</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </div>
      </Card>

      {/* CSV Format */}
      <Card title="CSV Format">
        <div style={{
          padding: "12px", borderRadius: 8,
          background: "#F4EFE7", border: "1px solid #E5E7EB",
          fontFamily: "var(--font-mono)", fontSize: 12, color: "#4B5563",
          lineHeight: 1.6, overflowX: "auto",
        }}>
          <p style={{ marginBottom: 8 }}>Manager,Agent Name,Team Name,Trainer Name,Hiring Date</p>
          <p>john@example.com,John Smith,Sales Team A,Sarah Johnson,2024-01-15</p>
          <p>jane@example.com,Jane Doe,Sales Team B,Mike Brown,2024-02-01</p>
        </div>
      </Card>

      <DangerZoneCard />
    </div>
  );
}

// ── Danger Zone: owner-only full data reset ────────────────────────────────
function DangerZoneCard() {
  const [isOwner, setIsOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const r = String(data?.role || "").toLowerCase();
      setIsOwner(["owner", "admin", "user"].includes(r));
    })();
  }, []);

  if (!isOwner) return null;

  const doReset = async () => {
    setBusy(true); setResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/org/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok && j.ok) { setResult({ ok: true, msg: "All CRM data has been reset." }); setOpen(false); setConfirm(""); }
    else setResult({ ok: false, msg: j.error || "Reset failed." });
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #FECACA", borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <ShieldAlert size={17} color="#DC2626" />
        <p style={{ fontSize: 15, fontWeight: 800, color: "#DC2626" }}>Danger Zone</p>
      </div>
      <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 14 }}>
        Permanently delete <strong>all of your CRM data</strong> — every lead, call recording, campaign and agent in your account. This cannot be undone. Your login, team logins and organization stay intact. <strong>Owner only.</strong>
      </p>

      {result && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: result.ok ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${result.ok ? "#A7F3D0" : "#FECACA"}`, color: result.ok ? "#059669" : "#DC2626" }}>
          {result.msg}
        </div>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10,
          background: "#fff", color: "#DC2626", border: "1px solid #DC2626", fontSize: 13, fontWeight: 800, cursor: "pointer",
        }}><Trash2 size={14} /> Reset all CRM data</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>Type <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 4, border: "1px solid #FECACA" }}>DELETE</code> to confirm:</p>
          <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="DELETE" autoFocus
            style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid #FCA5A5", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", outline: "none" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setOpen(false); setConfirm(""); }} style={{ padding: "9px 16px", borderRadius: 9, background: "#fff", border: "1px solid var(--border-2)", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
            <button onClick={doReset} disabled={confirm !== "DELETE" || busy} style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9,
              background: confirm === "DELETE" ? "#DC2626" : "#FCA5A5", color: "#fff", border: "none",
              fontSize: 13, fontWeight: 800, cursor: confirm === "DELETE" && !busy ? "pointer" : "not-allowed",
            }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Permanently delete everything</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shift Type editor ──────────────────────────────────────────────────────
function ShiftTypeCard({ onToast }: { onToast: (ok: boolean, msg: string) => void }) {
  const [shift, setShift] = useState<"part_time" | "full_time">("full_time");
  const [target, setTarget] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("shift_type, daily_target").eq("id", user.id).maybeSingle();
      if (data) {
        const s = (data.shift_type as "part_time" | "full_time") || "full_time";
        setShift(s);
        setTarget(typeof data.daily_target === "number" ? data.daily_target : s === "part_time" ? 1 : 2);
      }
      setLoading(false);
    })();
  }, []);

  const save = async (next: "part_time" | "full_time") => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const defaultTarget = next === "part_time" ? 1 : 2;
    const { error } = await supabase
      .from("profiles")
      .update({ shift_type: next, daily_target: defaultTarget })
      .eq("id", user.id);
    setSaving(false);
    if (error) return onToast(false, error.message);
    setShift(next); setTarget(defaultTarget);
    onToast(true, `Shift set to ${next === "part_time" ? "Part-time" : "Full-time"} (target ${defaultTarget})`);
  };

  return (
    <Card title="Shift Type">
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 14 }}>
        Choose your shift. Part-time targets <strong>1 qualified lead/day</strong>;
        Full-time targets <strong>2/day</strong>. Used for leaderboard and pacing.
      </p>
      {loading ? <Loader2 size={16} className="animate-spin" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([
            { key: "part_time", label: "Part-time", target: 1 },
            { key: "full_time", label: "Full-time", target: 2 },
          ] as const).map((opt) => {
            const active = shift === opt.key;
            return (
              <button key={opt.key} onClick={() => save(opt.key)} disabled={saving}
                style={{
                  padding: "16px 18px", borderRadius: 14, cursor: saving ? "wait" : "pointer",
                  background: active ? "#0B0F1F" : "#FFFFFF",
                  color: active ? "#fff" : "#0B0F1F",
                  border: active ? "1px solid #0B0F1F" : "1px solid rgba(15,23,42,0.10)",
                  textAlign: "left", display: "flex", flexDirection: "column", gap: 6,
                  transition: "all 200ms ease",
                  boxShadow: active ? "0 8px 24px rgba(11,15,31,0.25)" : "0 1px 3px rgba(11,15,31,0.05)",
                }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{opt.label}</span>
                <span style={{ fontSize: 11, opacity: active ? 0.8 : 0.7 }}>
                  Daily target: <strong>{opt.target} qualified lead{opt.target > 1 ? "s" : ""}</strong>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>Currently saved: <strong>{shift === "part_time" ? "Part-time" : "Full-time"}</strong> · target {target}/day</p>
    </Card>
  );
}

// ── Export webhook URL ─────────────────────────────────────────────────────
function WebhookCard({ onToast }: { onToast: (ok: boolean, msg: string) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      if (!prof?.organization_id) { setLoading(false); return; }
      const { data: org } = await supabase.from("organizations").select("export_webhook_url").eq("id", prof.organization_id).maybeSingle();
      if (org?.export_webhook_url) setUrl(org.export_webhook_url as string);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    if (!prof?.organization_id) { setSaving(false); return; }
    const { error } = await supabase.from("organizations").update({ export_webhook_url: url.trim() || null }).eq("id", prof.organization_id);
    setSaving(false);
    if (error) return onToast(false, error.message);
    onToast(true, "Webhook URL saved");
  };

  return (
    <Card title="Lead Export Webhook">
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 14 }}>
        Paste your Zapier / GoHighLevel / Make webhook URL. The <strong>Export Lead</strong> button on every Lead page sends the full payload (lead + ARV + AI summary + signed call URL) here.
      </p>
      {loading ? <Loader2 size={16} className="animate-spin" /> : (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/..."
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 9,
              background: "#F2F5F9", border: "1px solid rgba(35,43,58,0.10)",
              fontSize: 13, color: "#232B3A", outline: "none",
            }} />
          <button onClick={save} disabled={saving} style={{
            padding: "10px 18px", borderRadius: 9, background: "#0B0F1F",
            color: "#fff", border: "none", cursor: saving ? "wait" : "pointer",
            fontSize: 13, fontWeight: 700,
          }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : "Save"}
          </button>
        </div>
      )}
    </Card>
  );
}

