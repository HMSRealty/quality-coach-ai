"use client";

// Paste-into-Sheets export panel. Uses the workspace's webhook API key to
// authenticate live CSV pulls — Google Sheets refreshes via =IMPORTDATA().
// Owner picks which feed they want, copies the formula, pastes it into A1
// of a tab. Sheets re-fetches automatically every ~hour (or on edit).

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Sheet, Copy, Check, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";

const NAVY = "#15131D";
const SLATE = "#6B6880";
const MONEY = "#2563EB";
const SKY_600 = "#2563EB";

interface ApiKey { id: string; key_prefix: string; revoked: boolean; }

const FEEDS = [
  { id: "leads",         label: "Leads",          path: "/api/export/leads.csv",         desc: "Every lead with status, address, ask, ARV, MAO, recording URL, reason." },
  { id: "recordings",    label: "Call links",     path: "/api/export/recordings.csv",    desc: "One row per recording with a click-to-play link back into RealTrack." },
  { id: "dialer-hours",  label: "Dialer hours",   path: "/api/export/dialer-hours.csv",  desc: "Synced dialer hours, decimal hours, ready for SUM into payroll." },
];

export function SheetsExportPanel() {
  const [origin, setOrigin] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealKey, setRevealKey] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from("api_keys")
        .select("id, key_prefix, revoked")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setKeys((data || []) as ApiKey[]);
      setLoading(false);
    })();
  }, []);

  const activeKey = keys.find((k) => !k.revoked);

  const formulaFor = (path: string, token: string): string =>
    `=IMPORTDATA("${origin}${path}?key=${token}")`;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id); setTimeout(() => setCopied(null), 1600);
  };

  if (loading) return (
    <div style={{ padding: 30, textAlign: "center" }}>
      <Loader2 size={20} className="animate-spin" style={{ color: MONEY }} />
    </div>
  );

  const card: React.CSSProperties = {
    background: "#FFFFFF", border: "1px solid var(--border-2)",
    borderRadius: 14, padding: 22, boxShadow: "var(--shadow-sm)",
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(59,130,246,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sheet size={16} color={MONEY} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Pipe data into your spreadsheet</p>
          <p style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>
            Paste a formula into any sheet cell. Sheets pulls the CSV live — refreshes hourly, or whenever you edit the cell.
          </p>
        </div>
      </div>

      {!activeKey ? (
        <div style={{
          padding: 14, borderRadius: 10, background: "rgba(245,158,11,0.12)",
          border: "1px solid #FDE68A", color: "#F59E0B", fontSize: 13, display: "flex", gap: 9, alignItems: "flex-start",
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>You don&apos;t have an active webhook key yet. Generate one in the <strong>Webhook</strong> card above — Sheets needs it to authenticate.</span>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type={revealKey ? "text" : "password"}
              value={revealKey || `${activeKey.key_prefix}••••••••••••`}
              onChange={(e) => setRevealKey(e.target.value)}
              placeholder={`Paste full key (${activeKey.key_prefix}…) to generate formulas`}
              style={{
                flex: 1, minWidth: 240, padding: "9px 12px", borderRadius: 9,
                border: "1px solid var(--border-2)", background: "#FFFFFF", color: NAVY,
                fontSize: 12.5, fontFamily: "var(--font-mono)", outline: "none",
              }}
            />
            <p style={{ fontSize: 11, color: SLATE, flexBasis: "100%", marginTop: 2 }}>
              Sheets can&apos;t send Authorization headers, so the key goes in the URL. Treat these URLs like passwords — anyone with the link can read your data.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {FEEDS.map((f) => {
              const formula = revealKey
                ? formulaFor(f.path, revealKey)
                : `Paste your full key above to see the formula for ${f.label}.`;
              return (
                <div key={f.id} style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: "#F1F2F8", border: "1px solid var(--border-1)",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>{f.label}</p>
                    <p style={{ fontSize: 11.5, color: SLATE }}>{f.desc}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code style={{
                      flex: 1, fontSize: 11.5, fontFamily: "var(--font-mono)", color: NAVY,
                      background: "#FFFFFF", padding: "8px 10px", borderRadius: 7,
                      border: "1px solid var(--border-2)", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{formula}</code>
                    <button
                      onClick={() => revealKey && copy(formula, f.id)}
                      disabled={!revealKey}
                      title={revealKey ? "Copy formula" : "Paste your full key first"}
                      style={{
                        padding: "7px 11px", borderRadius: 8, border: "1px solid var(--border-2)",
                        background: "#FFFFFF", color: NAVY, cursor: revealKey ? "pointer" : "not-allowed",
                        opacity: revealKey ? 1 : 0.5,
                        fontSize: 11.5, fontWeight: 700,
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}>
                      {copied === f.id ? <><Check size={12} color={MONEY} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 9, background: "#F1F2F8", fontSize: 11.5, color: SLATE, lineHeight: 1.6 }}>
            <strong style={{ color: NAVY }}>Setup:</strong> open a new Google Sheet → click cell A1 → paste a formula above → hit Enter. Each feed lives on its own tab. Open <a href="https://docs.google.com/spreadsheets" target="_blank" rel="noreferrer" style={{ color: SKY_600, fontWeight: 700 }}>sheets.new <ExternalLink size={9} style={{ display: "inline" }} /></a> to start.
          </div>
        </>
      )}
    </div>
  );
}
