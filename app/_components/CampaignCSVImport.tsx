"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Upload, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const NAVY = "#232B3A";
const TEAL = "#2F6BFF";
const SLATE = "#4B5563";

function parseCSV(text: string): Array<{ name: string; rules: string }> {
  const rows: string[][] = [];
  let cur: string[] = []; let field = ""; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }

  // Detect header row
  const first = rows[0]?.map(s => s.toLowerCase().trim()) || [];
  const hasHeader = first.includes("name") || first.includes("campaign") || first.includes("rules");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .filter(r => r.some(v => v.trim() !== ""))
    .map(r => ({ name: (r[0] || "").trim(), rules: (r[1] || "").trim() }))
    .filter(r => r.name);
}

export function CampaignCSVImport({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const download = () => {
    const csv = "Name,Rules\nMotivated Sellers,Qualify if owner mentions price flexibility and timeline under 6 months\nAbsentee Owners,Disqualify if owner lives in property — only target absentee owners\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "campaigns-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("No campaigns found in CSV");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let created = 0; let updated = 0;
      for (const r of rows) {
        const { data: existing } = await supabase
          .from("campaigns").select("id").eq("user_id", user.id).eq("name", r.name).maybeSingle();
        if (existing) {
          await supabase.from("campaigns").update({ rules: r.rules }).eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("campaigns").insert({ user_id: user.id, name: r.name, rules: r.rules, is_active: true });
          created++;
        }
      }
      setMsg({ type: "ok", text: `Imported: ${created} created, ${updated} updated.` });
      onImported?.();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div style={{
      padding: 18, borderRadius: 12,
      background: "#FFF", border: "1px solid rgba(35,43,58,0.08)",
      boxShadow: "0 2px 8px rgba(35,43,58,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Bulk Import Campaigns</h3>
          <p style={{ fontSize: 12, color: SLATE, marginTop: 3 }}>Upload a CSV with two columns: Name, Rules.</p>
        </div>
        <button onClick={download} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 12px", borderRadius: 8,
          background: "#F2F5F9", color: NAVY, border: "1px solid rgba(35,43,58,0.08)",
          fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>
          <Download size={12} /> Template
        </button>
      </div>

      {msg && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, marginBottom: 12,
          background: msg.type === "ok" ? "#ECFDF5" : "#FBEEE8",
          border: `1px solid ${msg.type === "ok" ? "#A7F3D0" : "#E7B8A6"}`,
          color: msg.type === "ok" ? "#059669" : "#DC2626",
          fontSize: 12, fontWeight: 600, display: "flex", gap: 8, alignItems: "center",
        }}>
          {msg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        style={{
          padding: 16, borderRadius: 10,
          border: `2px dashed ${TEAL}40`, background: "#EEF3FF",
          textAlign: "center", cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? <Loader2 size={20} className="animate-spin" style={{ color: TEAL, margin: "0 auto 6px" }} /> : <Upload size={20} color={TEAL} style={{ margin: "0 auto 6px" }} />}
        <p style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
          {busy ? "Importing..." : "Drop CSV or click to browse"}
        </p>
        <p style={{ fontSize: 10, color: SLATE, marginTop: 3 }}>Col A: Name · Col B: Rules</p>
        <input ref={inputRef} type="file" accept=".csv" onChange={handleUpload} style={{ display: "none" }} />
      </div>
    </div>
  );
}
