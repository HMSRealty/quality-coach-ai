"use client";

// Bulk import leads from CSV (owner, phone, address, asking, condition, closing,
// reason, + a call Google-Drive link). Each row becomes a lead and is queued for
// AI qualification straight from the Drive link.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Upload, X, Loader2, CheckCircle2, Download, FileSpreadsheet } from "lucide-react";

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

const COLS: Record<string, string[]> = {
  owner:     ["owner name", "owner", "seller name", "seller", "name"],
  phone:     ["phone", "phone number", "contact", "number"],
  address:   ["address", "property address", "property"],
  asking:    ["asking price", "asking", "price"],
  condition: ["condition", "property condition"],
  closing:   ["closing", "closing timeline", "how soon", "timeline"],
  reason:    ["reason", "reason for selling", "motivation", "notes"],
  // Drive column: match by substring so "Call Drive Link", "Drive Link URL",
  // "Recording URL", "Google Drive Link", etc. all resolve correctly.
  drive:     ["drive", "recording", "audio", "call link"],
};
function mapHeader(header: string[]) {
  const h = header.map(x => x.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const key of Object.keys(COLS)) {
    if (key === "drive") {
      // Substring match: first column whose header contains any keyword wins.
      idx[key] = h.findIndex(col => COLS[key].some(kw => col.includes(kw)));
    } else {
      idx[key] = h.findIndex(col => COLS[key].includes(col));
    }
  }
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
    const idx = mapHeader(grid[0]);
    if (idx.address < 0 && idx.drive < 0) { setErr('CSV must include at least an "Address" column and a column containing "drive", "recording", or "audio" for the call link.'); return; }
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
        if (lead?.id) {
          fetch("/api/leads/analyze", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: lead.id, ...(r.drive ? { audioUrls: [r.drive] } : {}) }),
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
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} data-lenis-prevent="true"
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto", overscrollBehavior: "contain" }}>
      <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
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
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Owner · Phone · Address · Asking · Condition · Closing · Reason · Call Drive Link</p>
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
          <p style={{ fontSize: 11, color: "var(--text-4)" }}>The call link must be a <strong>public</strong> Google Drive share link. The AI downloads it and qualifies the lead automatically.</p>
        </div>
      </motion.div>
    </div>
  );
}
