"use client";

// Developer / Integrations — Inbound API & webhook ingestion.
// Generate API keys, show the inbound webhook URL, and a copyable payload so a
// dialer (Readymode / BatchDialer) can POST leads directly. Clean Enterprise.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  KeyRound, Loader2, Copy, Check, Plus, Trash2, Webhook, Terminal, ShieldCheck, AlertTriangle,
  Send, CheckCircle2, XCircle,
} from "lucide-react";

const SKY = "#0EA5E9";
const SKY_600 = "#0284C7";
const MONEY = "#059669";
const SPRING = { type: "spring", stiffness: 440, damping: 30 } as const;

interface ApiKey { id: string; label: string | null; key_prefix: string; last_used_at: string | null; revoked: boolean; created_at: string; }

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, background: "#fff", border: "1px solid var(--border-2)", color: done ? MONEY : "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
      {done ? <><Check size={13} /> Copied</> : <><Copy size={13} /> {label || "Copy"}</>}
    </button>
  );
}

export default function ApiIntegrationsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [label, setLabel] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [sampleCampaign, setSampleCampaign] = useState("YOUR_CAMPAIGN_ID");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Test webhook
  const [testKey, setTestKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    setOrgId((prof?.organization_id as string) ?? null);
    const { data: cs } = await supabase.from("campaigns").select("id").eq("user_id", user.id).limit(1);
    if (cs?.[0]?.id) setSampleCampaign(cs[0].id);
    const { data } = await supabase.from("api_keys").select("id,label,key_prefix,last_used_at,revoked,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    setKeys((data || []) as ApiKey[]);
    setLoading(false);
  };

  useEffect(() => { setOrigin(window.location.origin); load(); }, []);

  const generate = async () => {
    if (!userId) return;
    setGenerating(true);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const raw = "rt_live_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const key_hash = await sha256hex(raw);
    const { error } = await supabase.from("api_keys").insert({
      user_id: userId, organization_id: orgId,
      label: label.trim() || "Dialer key", key_prefix: raw.slice(0, 12), key_hash,
    });
    setGenerating(false);
    if (error) { alert("Could not create key: " + error.message); return; }
    setFreshKey(raw); setTestKey(raw); setLabel("");
    load();
  };

  const runTest = async () => {
    const key = testKey.trim();
    if (!key) { setTestResult({ ok: false, msg: "Paste an API key to test (or generate one above)." }); return; }
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ test: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) setTestResult({ ok: true, msg: j.message || "Connection OK — your dialer is ready." });
      else setTestResult({ ok: false, msg: j.error || `Failed (HTTP ${r.status}).` });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Request failed." });
    }
    setTesting(false);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this key? Dialers using it will stop working immediately.")) return;
    await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Permanently delete this key?")) return;
    await supabase.from("api_keys").delete().eq("id", id);
    load();
  };

  const webhookUrl = `${origin || "https://app.realtrack.com"}/api/inbound/lead`;
  const payload = JSON.stringify({
    address: "123 Main St, Austin, TX 78701",
    seller_name: "John Doe",
    campaign_id: sampleCampaign,
    audio_url: "https://dialer.example.com/recordings/abc123.mp3",
  }, null, 2);
  const curl = `curl -X POST ${webhookUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${payload.replace(/\n/g, " ").replace(/\s+/g, " ")}'`;

  const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--border-2)", borderRadius: 16, padding: 22, boxShadow: "var(--shadow-sm)" };
  const codeBox: React.CSSProperties = { margin: 0, padding: 16, borderRadius: 12, background: "#0B1220", color: "#E2E8F0", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, overflowX: "auto" };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(14,165,233,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Webhook size={20} color={SKY_600} />
        </span>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#000", letterSpacing: "-0.02em" }}>API &amp; Integrations</h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>Connect your dialer (Readymode, BatchDialer…) to push leads straight into RealTrack.</p>
        </div>
      </div>

      {/* Fresh key reveal */}
      <AnimatePresence>
        {freshKey && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}
            style={{ ...card, borderColor: "color-mix(in srgb, #059669 40%, transparent)", borderLeft: `4px solid ${MONEY}` }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: MONEY, textTransform: "uppercase", letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} /> Copy your key now — it won&apos;t be shown again
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <code style={{ flex: 1, padding: "11px 13px", borderRadius: 10, background: "#F8FAFC", border: "1px solid var(--border-2)", fontFamily: "var(--font-mono)", fontSize: 13, color: "#000", overflowX: "auto", whiteSpace: "nowrap" }}>{freshKey}</code>
              <CopyBtn text={freshKey} label="Copy key" />
            </div>
            <button onClick={() => setFreshKey(null)} style={{ marginTop: 12, background: "none", border: "none", color: "var(--text-3)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>I&apos;ve saved it — dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate + key list */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 8 }}><KeyRound size={16} color={SKY_600} /> API Keys</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Key label (e.g. Readymode)"
              style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff", color: "#000", fontSize: 13, outline: "none", minWidth: 180 }} />
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={generate} disabled={generating}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", cursor: generating ? "wait" : "pointer", background: "linear-gradient(135deg, #0EA5E9, #0284C7)", color: "#fff", fontSize: 13, fontWeight: 800, boxShadow: "0 8px 20px rgba(14,165,233,0.35)" }}>
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Generate API Key
            </motion.button>
          </div>
        </div>

        {loading ? (
          <Loader2 size={20} className="animate-spin" style={{ color: SKY_600 }} />
        ) : keys.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>No keys yet. Generate one to start receiving inbound leads.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {keys.map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 11, background: "#F8FAFC", border: "1px solid var(--border-1)", opacity: k.revoked ? 0.55 : 1 }}>
                <KeyRound size={15} color={k.revoked ? "var(--text-3)" : SKY_600} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#000" }}>{k.label || "Key"} {k.revoked && <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 800 }}>· REVOKED</span>}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{k.key_prefix}…••••  ·  added {new Date(k.created_at).toLocaleDateString()}  ·  {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}</p>
                </div>
                {!k.revoked && <button onClick={() => revoke(k.id)} title="Revoke" style={{ background: "none", border: "1px solid var(--border-2)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "#92400E", fontSize: 11.5, fontWeight: 700 }}>Revoke</button>}
                <button onClick={() => remove(k.id)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", padding: 4 }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhook URL */}
      <div style={card}>
        <p style={{ fontSize: 15, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 4 }}><Webhook size={16} color={SKY_600} /> Inbound Webhook URL</p>
        <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 12 }}>Point your dialer&apos;s webhook to this endpoint and send the API key as a Bearer token.</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <code style={{ flex: 1, padding: "12px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${SKY}`, fontFamily: "var(--font-mono)", fontSize: 13, color: SKY_600, fontWeight: 700, overflowX: "auto", whiteSpace: "nowrap" }}>{webhookUrl}</code>
          <CopyBtn text={webhookUrl} label="Copy URL" />
        </div>
      </div>

      {/* Test webhook */}
      <div style={card}>
        <p style={{ fontSize: 15, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 4 }}><Send size={16} color={SKY_600} /> Test Webhook</p>
        <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 12 }}>Send a no-op test ping to confirm your key works and the endpoint is reachable — no lead is created.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={testKey} onChange={(e) => setTestKey(e.target.value)} placeholder="Paste an API key (rt_live_…)"
            style={{ flex: 1, minWidth: 220, padding: "11px 13px", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff", color: "#000", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none" }} />
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={runTest} disabled={testing}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 18px", borderRadius: 10, border: "none", cursor: testing ? "wait" : "pointer", background: "linear-gradient(135deg, #0EA5E9, #0284C7)", color: "#fff", fontSize: 13, fontWeight: 800, boxShadow: "0 8px 20px rgba(14,165,233,0.35)" }}>
            {testing ? <><Loader2 size={14} className="animate-spin" /> Testing…</> : <><Send size={14} /> Send Test</>}
          </motion.button>
        </div>
        <AnimatePresence>
          {testResult && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}
              style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, padding: "11px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: testResult.ok ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${testResult.ok ? "#A7F3D0" : "#FECACA"}`, color: testResult.ok ? MONEY : "#DC2626" }}>
              {testResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {testResult.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Payload + curl */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 8 }}><Terminal size={16} color={SKY_600} /> JSON Payload</p>
          <CopyBtn text={payload} label="Copy JSON" />
        </div>
        <pre data-lenis-prevent="true" style={codeBox}>{payload}</pre>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 12px" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#000" }}>cURL example</p>
          <CopyBtn text={curl} label="Copy cURL" />
        </div>
        <pre data-lenis-prevent="true" style={{ ...codeBox, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{curl}</pre>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FCD34D" }}>
          <AlertTriangle size={15} color="#92400E" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#92400E", lineHeight: 1.55 }}>
            <strong>audio_url</strong> must be a publicly reachable link to the recording — we download it into your private bucket and run the full AI pipeline. Duplicate addresses are blocked unless the prior status was <strong>Disqualified</strong> or <strong>Error</strong> (those are revived &amp; re-analyzed).
          </p>
        </div>
      </div>
    </div>
  );
}
