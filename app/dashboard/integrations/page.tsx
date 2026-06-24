"use client";

export const runtime = "edge";

// One-page integrations hub. Add your webhook key + your AI keys + your
// Zillow keys here. Each one has start / pause. Owners and admins only.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Plug, Lock, Loader2, Webhook, Sparkles, Home, Link as LinkIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GeminiKeysCard } from "@/app/_components/GeminiKeysCard";
import { ZillowKeysCard } from "@/app/_components/ZillowKeysCard";
import { ReadymodeConnectionCard } from "@/app/_components/ReadymodeConnectionCard";
import { AutoFetchToggle } from "@/app/_components/AutoFetchToggle";
import { SheetsExportPanel } from "@/app/_components/SheetsExportPanel";

const NAVY = "#15302e";
const SLATE = "#475569";
const SKY_600 = "#0a5f52";

interface ApiKey { id: string; label: string | null; key_prefix: string; last_used_at: string | null; revoked: boolean; created_at: string; }

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `rt_live_${hex}`;
}

export default function IntegrationsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [creating, setCreating] = useState(false);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthorized(false); return; }
      const { data } = await supabase.from("profiles").select("role, parent_user_id").eq("id", user.id).maybeSingle();
      const role = (data?.role as string) || "user";
      const isManager = role === "admin" || role === "owner" || (role === "user" && !data?.parent_user_id);
      setAuthorized(isManager);
      if (isManager) await loadKeys(user.id);
    })();
  }, []);

  const loadKeys = async (uid: string) => {
    const { data } = await supabase.from("api_keys")
      .select("id, label, key_prefix, last_used_at, revoked, created_at")
      .eq("user_id", uid).order("created_at", { ascending: false });
    setKeys((data || []) as ApiKey[]);
  };

  const createKey = async () => {
    setCreating(true);
    const raw = genKey();
    const hash = await sha256hex(raw);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreating(false); return; }
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    await supabase.from("api_keys").insert({
      user_id: user.id, organization_id: (prof?.organization_id as string) ?? null,
      label: "Webhook key", key_prefix: raw.slice(0, 12), key_hash: hash, revoked: false,
    });
    setShowKey(raw);
    await loadKeys(user.id);
    setCreating(false);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this key? Any dialer or system using it will stop working.")) return;
    await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadKeys(user.id);
  };

  if (authorized === null) return (
    <div style={{ padding: 80, textAlign: "center" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: SKY_600 }} />
    </div>
  );

  if (authorized === false) return <ReadOnlyIntegrationsView />;

  const webhookUrl = `${origin}/api/inbound/lead`;
  const activeKey = keys.find((k) => !k.revoked);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
          <Plug size={26} color={SKY_600} /> Integrations
        </h1>
        <p style={{ fontSize: 14, color: SLATE, marginTop: 4 }}>
          Connect everything in one place. Add multiple keys for each provider — pause or resume any time.
        </p>
      </div>

      {/* WEBHOOK URL + KEY */}
      <div style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 14, padding: 22, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Webhook size={16} color={SKY_600} /> Webhook
          </p>
          {!showKey && (
            <button onClick={createKey} disabled={creating} style={{
              padding: "7px 14px", borderRadius: 8, border: "none",
              background: "linear-gradient(135deg,#0e7c6b,#0a5f52)", color: "#fff",
              fontSize: 12, fontWeight: 800, cursor: creating ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              {creating ? <Loader2 size={13} className="animate-spin" /> : "+"} Generate new key
            </button>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 12 }}>
          Point your dialer or CRM at this URL with the key as a Bearer token. We accept JSON, form-urlencoded,
          and Readymode&apos;s native format.
        </p>
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 9, padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12.5, color: NAVY, overflowX: "auto", whiteSpace: "nowrap" }}>
          {webhookUrl}
        </div>

        {showKey && (
          <div style={{ marginTop: 14, background: "#FEFCE8", border: "1px solid #FDE68A", borderRadius: 9, padding: "12px 14px" }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#854D0E", marginBottom: 6 }}>
              <AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} />
              Copy this key now. We only show it once.
            </p>
            <code style={{ display: "block", fontSize: 12.5, fontFamily: "var(--font-mono)", color: NAVY, wordBreak: "break-all" }}>{showKey}</code>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => navigator.clipboard.writeText(showKey)} style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #FDE68A", background: "#fff", color: "#854D0E", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Copy</button>
              <button onClick={() => setShowKey(null)} style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: "#854D0E", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>I&apos;ve saved it</button>
            </div>
          </div>
        )}

        {!showKey && keys.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {keys.map((k) => (
              <div key={k.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 13px", borderRadius: 9,
                background: k.revoked ? "#FEF2F2" : "#F8FAFC",
                border: `1px solid ${k.revoked ? "#FECACA" : "var(--border-1)"}`,
                opacity: k.revoked ? 0.65 : 1,
              }}>
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: NAVY, flex: 1 }}>{k.key_prefix}••••</span>
                <span style={{ fontSize: 11, color: SLATE }}>
                  {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}
                </span>
                {k.revoked ? (
                  <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 800 }}>REVOKED</span>
                ) : (
                  <button onClick={() => revoke(k.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!showKey && !activeKey && keys.length === 0 && (
          <p style={{ fontSize: 13, color: SLATE, marginTop: 14 }}>No webhook key yet. Click <strong>Generate new key</strong> above to get started.</p>
        )}
      </div>

      {/* AUTO-FETCH TOGGLE */}
      <AutoFetchToggle />

      {/* AI / GEMINI KEYS */}
      <GeminiKeysCard />

      {/* ZILLOW / PROPERTY DATA KEYS */}
      <ZillowKeysCard />

      {/* DIALER CONNECTIONS */}
      <ReadymodeConnectionCard />

      {/* GOOGLE SHEETS LIVE EXPORTS */}
      <SheetsExportPanel />

    </div>
  );
}

// Read-only view for end-users. Calls a tiny status endpoint to learn which
// providers their assigned keys cover — never sees the keys themselves.
function ReadOnlyIntegrationsView() {
  const [status, setStatus] = useState<{ gemini: number; zillow: number; readymode: number } | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/integrations/status", { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const j = await r.json().catch(() => ({}));
      setStatus({ gemini: j.gemini || 0, zillow: j.zillow || 0, readymode: j.readymode || 0 });
    })();
  }, []);

  const rows: { name: string; count: number; desc: string }[] = [
    { name: "AI provider (Gemini)", count: status?.gemini ?? 0, desc: "Powers call analysis and qualification." },
    { name: "Zillow / Property data", count: status?.zillow ?? 0, desc: "Pulls Zestimate, comps, and ARV." },
    { name: "Readymode dialer", count: status?.readymode ?? 0, desc: "Fetches your call recordings." },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
          <Plug size={24} color={SKY_600} /> Your Integrations
        </h1>
        <p style={{ fontSize: 13.5, color: SLATE, marginTop: 4 }}>
          RealTrack&apos;s admin team manages your API keys. You don&apos;t need to do anything &mdash; here&apos;s what&apos;s active on your account.
        </p>
      </div>

      {!status ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <Loader2 size={24} className="animate-spin" style={{ color: SKY_600 }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(r => {
            const integrated = r.count > 0;
            return (
              <div key={r.name} style={{
                background: "#fff", border: `1px solid ${integrated ? "#A7F3D0" : "var(--border-2)"}`,
                borderRadius: 12, padding: 18,
                display: "flex", alignItems: "center", gap: 14,
              }}>
                {integrated
                  ? <CheckCircle2 size={22} color="#0a5f52" />
                  : <AlertTriangle size={22} color="#92400E" />}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{r.name}</p>
                  <p style={{ fontSize: 12.5, color: SLATE, marginTop: 2 }}>{r.desc}</p>
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 800,
                  padding: "5px 11px", borderRadius: 999,
                  background: integrated ? "#ECFDF5" : "#FEF3C7",
                  color: integrated ? "#047857" : "#92400E",
                }}>
                  {integrated ? `Integrated · ${r.count} active` : "Not set up yet"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        background: "#F8FAFC", border: "1px solid var(--border-1)",
        borderRadius: 12, padding: 16, fontSize: 12.5, color: SLATE, lineHeight: 1.6,
      }}>
        Missing an integration? Email <a href="mailto:info@realtrack.app" style={{ color: SKY_600, fontWeight: 700 }}>info@realtrack.app</a> and we&apos;ll wire it up for you.
      </div>
    </div>
  );
}
