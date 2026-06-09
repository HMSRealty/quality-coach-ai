"use client";

// Bulk import leads from CSV (owner, phone, address, asking, condition, closing,
// reason, + a call Google-Drive link). Each row becomes a lead and is queued for
// AI qualification straight from the Drive link.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Upload, X, Loader2, CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { Portal } from "@/app/_components/Portal";

const SKY = "#0EA5E9";
const MONEY = "#059669";

// RFC-ish CSV: respects quoted fields (addresses contain commas).
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
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(field); rows.push(cur); cur = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(c => c.trim()));
}

// Keywords associated with each logical field (substring match on header).
const HEADER_KW: Record<string, string[]> = {
  owner:     ["owner", "seller", "name", "contact name", "lead name"],
  phone:     ["phone", "mobile", "cell", "number", "tel", "contact"],
  address:   ["address", "property", "location", "street"],
  asking:    ["asking", "price", "amount", "offer", "list"],
  condition: ["condition", "repair", "rehab", "status"],
  closing:   ["closing", "timeline", "how soon", "when", "urgency"],
  reason:    ["reason", "motivation", "why", "note", "comment", "selling"],
  drive:     ["drive", "recording", "audio", "call", "link", "url", "media"],
};

// Content-pattern detectors — score a cell value for each field type.
function scoreCell(val: string): Record<string, number> {
  const v = val.trim();
  if (!v) return {};
  const scores: Record<string, number> = {};
  // Drive: any http URL, especially drive.google.com
  if (/^https?:\/\//i.test(v)) { scores.drive = v.includes("drive.google") ? 10 : 6; }
  // Phone: 7-15 digits with common separators
  if (/^\+?[\d\s\-().]{7,15}$/.test(v) && /\d{7,}/.test(v.replace(/\D/g, ""))) scores.phone = 8;
  // Asking price: dollar amount
  if (/^\$?[\d,]+(\.\d{1,2})?k?$/.test(v.replace(/\s/g, ""))) scores.asking = 6;
  // Address: has digits + letters, no http
  if (/\d/.test(v) && /[a-zA-Z]/.test(v) && !v.startsWith("http") && v.length > 8) scores.address = 4;
  // Owner name: 2-4 words, only letters/spaces
  if (/^[A-Za-z\s'-]{4,40}$/.test(v) && v.trim().split(/\s+/).length >= 2) scores.owner = 3;
  return scores;
}

function mapHeader(header: string[], dataRows: string[][]): Record<string, number> {
  const h = header.map(x => x.trim().toLowerCase());
  const fields = Object.keys(HEADER_KW);

  // Score each (field, column) pair by header keyword matches.
  const headerScore: number[][] = fields.map(field =>
    h.map(col => HEADER_KW[field].some(kw => col.includes(kw)) ? 5 : 0)
  );

  // Score each (field, column) pair by content of first 5 data rows.
  const contentScore: number[][] = fields.map(() => Array(h.length).fill(0));
  const sampleRows = dataRows.slice(0, 5);
  for (const row of sampleRows) {
    for (let c = 0; c < h.length; c++) {
      const cell = row[c] || "";
      const cs = scoreCell(cell);
      fields.forEach((field, fi) => {
        if (cs[field]) contentScore[fi][c] += cs[field];
      });
    }
  }

  // Combined score: header keyword match wins if strong; content breaks ties.
  const combined: number[][] = fields.map((_, fi) =>
    h.map((_, c) => headerScore[fi][c] * 3 + contentScore[fi][c])
  );

  // Greedy assignment: pick highest-score (field, column) pairs without reuse.
  const assigned: Record<string, number> = {};
  const usedCols = new Set<number>();
  // Sort all (field, col, score) triples by score desc.
  const triples: { fi: number; col: number; score: number }[] = [];
  fields.forEach((_, fi) => {
    h.forEach((_, col) => {
      if (combined[fi][col] > 0) triples.push({ fi, col, score: combined[fi][col] });
    });
  });
  triples.sort((a, b) => b.score - a.score);
  for (const { fi, col } of triples) {
    const field = fields[fi];
    if (assigned[field] !== undefined) continue; // already assigned
    if (usedCols.has(col)) continue;             // column taken
    assigned[field] = col;
    usedCols.add(col);
  }

  // Any unassigned field gets -1.
  const idx: Record<string, number> = {};
  for (const field of fields) idx[field] = assigned[field] ?? -1;
  return idx;
}

interface Campaign { id: string; name: string; }

export function ImportLeads({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
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
    setErr(""); setFileName(f.name);
    const grid = parseCsv(await f.text());
    if (grid.length < 2) { setErr("CSV needs a header row + at least one lead."); return; }
    const idx = mapHeader(grid[0], grid.slice(1));
    if (idx.address < 0 && idx.drive < 0) { setErr("Could not detect an address or call-link column. Rename your headers or check that values contain addresses and URLs."); return; }
    const mapped = grid.slice(1).map(cells => {
      const get = (k: string) => (idx[k] >= 0 ? (cells[idx[k]] || "").trim() : "");
      return { owner: get("owner"), phone: get("phone"), address: get("address"), asking: get("asking"), condition: get("condition"), closing: get("closing"), reason: get("reason"), drive: get("drive") };
    }).filter(r => r.address || r.drive);
    setRows(mapped);
  };

  const run = async () => {
    if (!campaignId) { setErr("Pick a campaign for these leads."); return; }
    if (!rows.length) { setErr("Upload a CSV first."); return; }
    setBusy(true); setErr(""); setProgress({ done: 0, total: rows.length });
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setBusy(false); return; }
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (prof?.organization_id as string) ?? null;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const asking = r.asking ? Number(r.asking.replace(/[^\d.]/g, "")) : null;
        const { data: lead } = await supabase.from("leads").insert({
          user_id: user.id, organization_id: orgId, campaign_id: campaignId,
          agent_name: r.owner || null, extracted_address: r.address || null,
          asking_price: asking != null && isFinite(asking) ? asking : null,
          status: "Processing",
          metadata: { owner_name: r.owner, phone_number: r.phone, reason: r.reason, condition: r.condition, closing: r.closing, source_audio_url: r.drive || null, submitted_via: "csv_import" },
        }).select("id").single();
        if (lead?.id && r.drive) {
          fetch("/api/leads/analyze", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: lead.id, audioUrls: [r.drive] }),
          }).catch(() => {});
        }
      } catch { /* skip a bad row */ }
      setProgress({ done: i + 1, total: rows.length });
    }
    setBusy(false);
    onDone();
  };

  const template = () => {
    const csv = 'Owner Name,Phone,Address,Asking Price,Condition,Closing,Reason,Call Drive Link\n"John Smith","+1 555-0100","123 Main St, Austin, TX 78701","250000","Needs roof","ASAP","Relocating","https://drive.google.com/file/d/FILEID/view?usp=sharing"';
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "leads-import-template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Portal>
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 30 }}
        style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(15,23,42,0.30)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: "#000", display: "inline-flex", alignItems: "center", gap: 9 }}><FileSpreadsheet size={18} color={SKY} /> Import Leads (CSV)</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 6 }}>Campaign</label>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff", color: "#000", fontSize: 13, outline: "none" }}>
              <option value="">Select campaign…</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <label style={{ border: "2px dashed color-mix(in srgb, #0EA5E9 35%, transparent)", borderRadius: 14, padding: "26px 18px", textAlign: "center", cursor: "pointer", background: "#F8FAFC", display: "block" }}>
            <input type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} style={{ display: "none" }} />
            <Upload size={28} color="#0284C7" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, fontWeight: 800, color: "#000" }}>{fileName || "Click to choose a CSV"}</p>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Any column order — columns are auto-detected by name and content</p>
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={template} className="btn-ghost" style={{ fontSize: 12 }}><Download size={12} /> Download template</button>
            {rows.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color: MONEY }}>{rows.length} lead{rows.length === 1 ? "" : "s"} parsed</span>}
          </div>

          {err && <p style={{ fontSize: 12.5, color: "#DC2626", fontWeight: 600 }}>{err}</p>}

          <AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "10px 14px", borderRadius: 10, background: "#F0F9FF", border: "1px solid #0EA5E9", fontSize: 13, fontWeight: 700, color: "#0369A1", display: "flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={14} className="animate-spin" /> Importing &amp; queuing AI… {progress.done}/{progress.total}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={run} disabled={busy || !rows.length || !campaignId}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "none", cursor: busy || !rows.length ? "not-allowed" : "pointer", background: rows.length && campaignId ? "linear-gradient(135deg, #0EA5E9, #0284C7)" : "#7DD3FC", color: "#fff", fontSize: 13, fontWeight: 800 }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Import &amp; Qualify
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-4)" }}>Columns are auto-detected by header name and cell content — no fixed order required. The call link should be a <strong>public</strong> Google Drive share link; the AI downloads it and qualifies the lead automatically.</p>
        </div>
      </motion.div>
    </div>
    </Portal>
  );
}
