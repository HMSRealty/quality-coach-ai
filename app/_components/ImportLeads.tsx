"use client";

// Bulk import leads from CSV. Column order is irrelevant — detection is
// driven by header keywords (multi-keyword count) + cell content patterns.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Upload, X, Loader2, CheckCircle2, Download, FileSpreadsheet, Info } from "lucide-react";
import { Portal } from "@/app/_components/Portal";

const SKY = "#0e7c6b";
const MONEY = "#0a5f52";

// RFC-ish CSV parser: handles quoted fields (commas & newlines inside quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let field = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); rows.push(cur); cur = []; field = "";
      } else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(c => c.trim()));
}

// ── Field keyword tables ────────────────────────────────────────────────────
// Each entry: longer / more specific phrases FIRST (they score higher via count).
const FIELD_KW: Record<string, string[]> = {
  // Cold-caller / agent who made the call
  cc:          ["cold caller", "cold call name", "cc name", "agent name", "va name", "rep name", "caller name", "cc "],
  // Property owner / seller
  owner:       ["owner name", "seller name", "owner", "seller"],
  // Phone number
  phone:       ["owner number", "phone number", "contact number", "owner phone", "mobile", "cell", "phone", "tel", "number"],
  // Property address
  address:     ["property address", "property addr", "address", "location", "street"],
  // Asking price
  asking:      ["asking price", "list price", "asking", "offer price", "price"],
  // Property condition
  condition:   ["condition", "year built", "property condition", "repairs needed", "repair"],
  // Closing timeline
  closing:     ["closing timeline", "closing", "timeline", "how soon", "close date"],
  // Reason for selling
  reason:      ["reason for selling", "reason for sale", "reason", "motivation", "why sell"],
  // Zestimate / market value from Zillow column
  zestimate:   ["zestimate", "zillow estimate", "market value", "zillow value"],
  // Direct Zillow listing URL
  zillow_url:  ["zillow link", "zillow url", "zillow listing", "listing link", "zillow"],
  // Google Drive recording link
  drive:       ["call recording", "recording link", "drive link", "google drive", "audio link",
                 "recording", "audio", "drive", "link", "url"],
};

// Content-pattern scoring — how strongly does a cell value suggest each field?
function scoreCell(val: string): Record<string, number> {
  const v = val.trim();
  if (!v || v.toLowerCase() === "na" || v === "—" || v === "-") return {};
  const scores: Record<string, number> = {};
  // Drive: http URL; big bonus for drive.google.com
  if (/^https?:\/\//i.test(v)) {
    scores.drive = v.toLowerCase().includes("drive.google") || v.toLowerCase().includes("drive.") ? 12 : 5;
    if (v.toLowerCase().includes("zillow.com")) scores.zillow_url = 10;
  }
  // Phone: looks like a phone number (7-15 digits after stripping separators)
  if (/^\+?[\d\s\-().]{7,18}$/.test(v) && v.replace(/\D/g, "").length >= 7) scores.phone = 9;
  // Asking / price: a clean dollar amount (no long text after)
  if (/^\$?[\d,]+(\.\d{1,2})?k?$/i.test(v.replace(/\s+/g, ""))) scores.asking = 7;
  // Zestimate cell: number that may be prefixed with $ and followed by "Zestimate"/"Redfin"
  if (/\$[\d,]+/.test(v) && /zestimate|redfin|zillow/i.test(v)) scores.zestimate = 10;
  // Address: has a leading street number + letters, no http
  if (/^\d+\s+[A-Za-z]/.test(v) && v.length > 6 && !v.startsWith("http")) scores.address = 8;
  // Owner / seller name: 2-5 words, only letters, spaces, hyphens, apostrophes
  if (/^[A-Za-z\s'\-]{4,50}$/.test(v) && v.trim().split(/\s+/).length >= 2 && v.trim().split(/\s+/).length <= 5) scores.owner = 4;
  return scores;
}

// Count how many keywords from the list are substrings of col (longer keywords
// first in the list so they contribute more to the count).
function kwCount(col: string, kws: string[]): number {
  return kws.filter(kw => col.includes(kw)).length;
}

type MappedRow = Record<string, string>;

function mapHeader(header: string[], dataRows: string[][]): Record<string, number> {
  const h = header.map(x => x.trim().toLowerCase());
  const fields = Object.keys(FIELD_KW);
  const sampleRows = dataRows.slice(0, 8);

  // Header scores: count of matching keywords × 6 (larger than single content-match).
  const hScore = fields.map(f => h.map(col => kwCount(col, FIELD_KW[f]) * 6));

  // Content scores: accumulated over sample rows.
  const cScore = fields.map(() => Array(h.length).fill(0));
  for (const row of sampleRows) {
    for (let c = 0; c < h.length; c++) {
      const cs = scoreCell(row[c] || "");
      fields.forEach((f, fi) => { if (cs[f]) cScore[fi][c] += cs[f]; });
    }
  }

  // Combined = header dominates (×3 weight) + content breaks ties.
  const combined = fields.map((_, fi) => h.map((_, c) => hScore[fi][c] * 3 + cScore[fi][c]));

  // Greedy assignment — highest (field, col) score first, no column reuse.
  const triples: { fi: number; col: number; score: number }[] = [];
  fields.forEach((_, fi) => h.forEach((_, col) => {
    if (combined[fi][col] > 0) triples.push({ fi, col, score: combined[fi][col] });
  }));
  triples.sort((a, b) => b.score - a.score);

  const assigned: Record<string, number> = {};
  const usedCols = new Set<number>();
  for (const { fi, col } of triples) {
    const field = fields[fi];
    if (assigned[field] !== undefined || usedCols.has(col)) continue;
    assigned[field] = col;
    usedCols.add(col);
  }
  const idx: Record<string, number> = {};
  for (const f of fields) idx[f] = assigned[f] ?? -1;
  return idx;
}

// Parse a dollar amount out of messy strings like "$273,500 Zestimate®" or "$459,600 Redfin".
function parseMoneyStr(s: string): number | null {
  if (!s || /^na$/i.test(s.trim()) || s.trim() === "--" || s.trim() === "$--") return null;
  const m = s.replace(/,/g, "").match(/\$?([\d]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) && n > 0 ? n : null;
}

interface Campaign { id: string; name: string; }

export function ImportLeads({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [detected, setDetected] = useState<Record<string, string>>({}); // field → header name
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
      const { data } = await supabase.from("campaigns").select("id,name").eq("user_id", user.id);
      if (data) { setCampaigns(data); if (data[0]) setCampaignId(data[0].id); }
    })();
  }, []);

  const onFile = async (f: File) => {
    setErr(""); setFileName(f.name); setRows([]); setDetected({});
    const grid = parseCsv(await f.text());
    if (grid.length < 2) { setErr("CSV needs a header row + at least one data row."); return; }
    const header = grid[0];
    const dataGrid = grid.slice(1);
    const idx = mapHeader(header, dataGrid);

    // Build human-readable detection map for the preview.
    const det: Record<string, string> = {};
    for (const [field, col] of Object.entries(idx)) {
      if (col >= 0) det[field] = header[col]?.trim() || `col ${col + 1}`;
    }
    setDetected(det);

    if (idx.address < 0 && idx.drive < 0) {
      setErr("Could not detect an address or call-link column. Check that your CSV has an address column and/or a Google Drive link column.");
      return;
    }

    const get = (cells: string[], k: string) => idx[k] >= 0 ? (cells[idx[k]] || "").trim() : "";
    const mapped = dataGrid.map(cells => ({
      cc:          get(cells, "cc"),
      owner:       get(cells, "owner"),
      phone:       get(cells, "phone"),
      address:     get(cells, "address"),
      asking:      get(cells, "asking"),
      condition:   get(cells, "condition"),
      closing:     get(cells, "closing"),
      reason:      get(cells, "reason"),
      zestimate:   get(cells, "zestimate"),
      zillow_url:  get(cells, "zillow_url"),
      drive:       get(cells, "drive"),
    })).filter(r => r.address || r.drive);
    setRows(mapped);
  };

  const run = async () => {
    if (!campaignId) { setErr("Pick a campaign for these leads."); return; }
    if (!rows.length) { setErr("Upload a CSV first."); return; }
    setBusy(true); setErr(""); setProgress({ done: 0, total: rows.length });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (prof?.organization_id as string) ?? null;

    try {
      // Single server-side call — lead creation + analyze firing all happen on
      // the server. Safe to navigate away immediately; analysis continues in the
      // background as independent Vercel function invocations.
      const res = await fetch("/api/leads/import-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, campaignId, userId: user.id, orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setProgress({ done: data.imported || rows.length, total: rows.length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    }

    setBusy(false);
    onDone();
  };

  const template = () => {
    const csv = [
      "CC Name,Owner Name,Owner Number,Property Address,Asking Price,Zestimate,Zillow Link,Condition,Closing,Reason,Call Recording Link",
      '"JULIA","William Peyton","501-658-3698","1313 Washington St, Little Rock, AR 72204","42000","$42586 Zestimate","https://www.zillow.com/homedetails/.../","Good","ASAP","Relocating","https://drive.google.com/open?id=XXXX"',
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "leads-import-template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const FIELD_LABELS: Record<string, string> = {
    cc: "Cold Caller", owner: "Owner Name", phone: "Phone", address: "Address",
    asking: "Asking Price", zestimate: "Zestimate", zillow_url: "Zillow Link",
    condition: "Condition", closing: "Closing", reason: "Reason", drive: "Recording Link",
  };

  return (
    <Portal>
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 30 }}
        style={{ width: "100%", maxWidth: 660, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(15,23,42,0.30)", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 9 }}><FileSpreadsheet size={18} color={SKY} /> Import Leads (CSV)</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 6 }}>Campaign</label>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff", color: "#000", fontSize: 13, outline: "none" }}>
              <option value="">Select campaign…</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <label style={{ border: "2px dashed color-mix(in srgb, #0e7c6b 35%, transparent)", borderRadius: 14, padding: "22px 18px", textAlign: "center", cursor: "pointer", background: "#F8FAFC", display: "block" }}>
            <input type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} style={{ display: "none" }} />
            <Upload size={26} color="#0a5f52" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, fontWeight: 800, color: "#000" }}>{fileName || "Click to choose a CSV"}</p>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Any column order — headers are auto-detected by name and cell content</p>
          </label>

          {/* Detected column mapping preview */}
          {Object.keys(detected).length > 0 && (
            <div style={{ borderRadius: 12, border: "1px solid #0e7c6b33", background: "#F0F9FF", padding: "12px 14px" }}>
              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#0a5f52", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Info size={11} /> Detected columns
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(FIELD_LABELS).map(([field, label]) => {
                  const col = detected[field];
                  if (!col) return null;
                  return (
                    <span key={field} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: "#fff", border: "1px solid #0e7c6b55", color: "#084c42", fontWeight: 700 }}>
                      {label} → <span style={{ color: "#000" }}>{col}</span>
                    </span>
                  );
                })}
              </div>
              {rows.length > 0 && (
                <p style={{ fontSize: 12, fontWeight: 700, color: MONEY, marginTop: 8 }}>
                  {rows.length} lead{rows.length === 1 ? "" : "s"} ready · {rows.filter(r => r.drive).length} with recording
                </p>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={template} className="btn-ghost" style={{ fontSize: 12 }}><Download size={12} /> Download template</button>
          </div>

          {err && <p style={{ fontSize: 12.5, color: "#DC2626", fontWeight: 600 }}>{err}</p>}

          <AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "10px 14px", borderRadius: 10, background: "#F0F9FF", border: "1px solid #0e7c6b", fontSize: 13, fontWeight: 700, color: "#084c42", display: "flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={14} className="animate-spin" /> Importing &amp; queuing AI… {progress.done}/{progress.total}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={run} disabled={busy || !rows.length || !campaignId}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "none", cursor: busy || !rows.length ? "not-allowed" : "pointer", background: rows.length && campaignId ? "linear-gradient(135deg, #0e7c6b, #0a5f52)" : "#7DD3FC", color: "#fff", fontSize: 13, fontWeight: 800 }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Import &amp; Qualify
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-4)" }}>
            Leads with a recording link are sent for AI analysis. Leads without a recording stay as <strong>Processing</strong> — you can upload a recording later to trigger analysis.
          </p>
        </div>
      </motion.div>
    </div>
    </Portal>
  );
}
