"use client";

// Lead Submission Form — Clean Enterprise (White / Sky / Emerald / Black).
// Big Google address autocomplete, drag-drop multi-file audio upload, agent +
// campaign selectors, and a sky "Submit & Analyze Lead" button with a
// framer-motion loading state. Wired to /api/leads/submit (smart duplicate
// bypass) -> /api/leads/[id]/upload -> /api/leads/analyze.
import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  Send, Loader2, CheckCircle2, AlertTriangle, MapPin, UploadCloud, X,
  Music, Link2, Copy, Check, ExternalLink,
} from "lucide-react";
import { AddressAutocomplete, type AddressParts } from "@/app/_components/AddressAutocomplete";

// RealTrack — SKY/SKY_600 var names retained so the existing inline
// styles keep working — the values shift to money-green + deeper money.
const SKY = "#3B82F6";
const SKY_600 = "#2563EB";
const MONEY = "#2563EB";
const SPRING = { type: "spring", stiffness: 460, damping: 32, mass: 0.7 } as const;

interface Campaign { id: string; name: string; }
interface ColdCaller { id: string; name: string; }
interface UserRow { id: string; email: string; }

const ACCEPT = ".mp3,.wav,.m4a,.mp4,audio/*,video/mp4";
const MAX_BYTES = 500 * 1024 * 1024;
const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#15131D", marginBottom: 6 };
const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 10,
  background: "#FFFFFF", border: "1px solid var(--border-2)",
  fontSize: 13.5, color: "#15131D", outline: "none",
};

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }

export default function SubmitLeadPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [callers, setCallers] = useState<ColdCaller[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [me, setMe] = useState<{ id: string; email: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    address: "", parts: null as AddressParts | null,
    ownerName: "", phone: "", askingPrice: "", zillowLink: "", reason: "", driveLink: "",
    campaignId: "", callerId: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type Result = { kind: "ok" | "dup" | "err"; msg: string };
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  // share link
  const [shareUserId, setShareUserId] = useState("");
  const [genLink, setGenLink] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("id, email, role").eq("id", user.id).maybeSingle();
      if (profile) setMe(profile);
      const [cRes, calRes] = await Promise.all([
        supabase.from("campaigns").select("id,name").eq("user_id", user.id),
        supabase.from("cold_callers").select("id,name").eq("user_id", user.id),
      ]);
      if (cRes.data) { setCampaigns(cRes.data); if (cRes.data[0]) setForm(f => ({ ...f, campaignId: cRes.data![0].id })); }
      if (calRes.data) setCallers(calRes.data);
      if (profile?.role === "admin") {
        const { data: allUsers } = await supabase.from("profiles").select("id, email").order("email");
        if (allUsers) setUsers(allUsers);
      }
      setLoading(false);
    })();
  }, []);

  // ── Dropzone ──
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f => {
      const ok = /\.(mp3|wav|m4a|mp4)$/i.test(f.name) || f.type.startsWith("audio/") || f.type === "video/mp4";
      return ok && f.size <= MAX_BYTES;
    });
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...arr.filter(f => !seen.has(f.name + f.size))];
    });
  }, []);
  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  // ── Submit ──
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.address.trim()) { setResult({ kind: "err", msg: "Property address is required." }); return; }
    if (!form.campaignId) { setResult({ kind: "err", msg: "Select a campaign." }); return; }

    setSubmitting(true); setResult(null); setPhase("Enriching property…");

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Best-effort property enrichment (Zillow + ARV) → metadata.
    let enriched: Record<string, unknown> | undefined;
    try {
      const params = new URLSearchParams();
      if (form.zillowLink.trim()) params.set("url", form.zillowLink.trim());
      else params.set("address", form.address.trim());
      const r = await fetch(`/api/zillow?${params.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        let arv: number | null = null, conf: number | null = null;
        try {
          const ar = await fetch("/api/leads/arv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ normalized: j.normalized, comparables: j.comparables ?? [] }) });
          const aj = await ar.json().catch(() => ({}));
          if (ar.ok) { arv = aj.estimatedArv ?? null; conf = aj.confidence ?? null; }
        } catch { /* best-effort */ }
        enriched = { zillow_data: j.normalized, arv, arv_confidence: conf };
      }
    } catch { /* best-effort */ }

    setPhase("Creating lead…");
    const agentName = callers.find(c => c.id === form.callerId)?.name || null;
    const metadata: Record<string, unknown> = {
      ...(form.parts ? { addr_street: form.parts.street, addr_city: form.parts.city, addr_state: form.parts.state, addr_zip: form.parts.zip } : {}),
      ...(enriched || {}),
      // call recording link — the analyzer downloads it (public link) and
      // qualifies from it, same as an uploaded file.
      ...(form.driveLink.trim() ? { source_audio_url: form.driveLink.trim() } : {}),
    };

    const subRes = await fetch("/api/leads/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        campaignId: form.campaignId, callerId: form.callerId || null, agentName,
        address: form.address.trim(), askingPrice: form.askingPrice || null,
        ownerName: form.ownerName, phone: form.phone, reason: form.reason,
        zillowLink: form.zillowLink || (enriched?.zillow_data as { zillow_url?: string } | undefined)?.zillow_url || null,
        zestimate: (enriched?.zillow_data as { zestimate?: number } | undefined)?.zestimate?.toString() || null,
        metadata,
      }),
    });
    const subJson = await subRes.json().catch(() => ({}));

    if (subRes.status === 409 && subJson.duplicate) {
      setSubmitting(false);
      setResult({ kind: "dup", msg: subJson.error || "This address already exists." });
      return;
    }
    if (!subRes.ok || !subJson.ok) {
      setSubmitting(false);
      setResult({ kind: "err", msg: subJson.error || "Submission failed." });
      return;
    }
    const leadId: string = subJson.leadId;
    const revived = subJson.mode === "revived";

    // Upload recordings (private bucket) if any — stored in-house so the queue
    // can analyze them locally.
    if (files.length) {
      setPhase(`Uploading ${files.length} recording${files.length === 1 ? "" : "s"}…`);
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      await fetch(`/api/leads/${leadId}/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    }

    // Qualify RIGHT HERE — the browser drives the AI review and waits for the
    // result (reliable, no dependence on background workers). If anything hiccups
    // (e.g. a transient API spike), we silently fall back to the ordered queue so
    // the user NEVER sees an error — the lead still gets reviewed shortly.
    setPhase("Running AI analysis…");
    let resultMsg = revived ? "Revived a previously-disqualified lead — review running." : "Lead submitted — review running.";
    try {
      const res = await fetch("/api/leads/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.status) resultMsg = `Lead reviewed — marked ${j.status}.`;
      else {
        await fetch(`/api/leads/${leadId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => {});
        resultMsg = "Lead submitted — review will finish shortly.";
      }
    } catch {
      await fetch(`/api/leads/${leadId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => {});
      resultMsg = "Lead submitted — review will finish shortly.";
    }

    setSubmitting(false);
    setResult({ kind: "ok", msg: resultMsg });
    setForm(f => ({ ...f, address: "", parts: null, ownerName: "", phone: "", askingPrice: "", zillowLink: "", reason: "", driveLink: "" }));
    setFiles([]);
    setTimeout(() => setResult(null), 6000);
  };

  // ── Share link ──
  const generateLink = async () => {
    if (!me) return;
    setGenerating(true); setGenLink("");
    const targetUserId = me.role === "admin" && shareUserId ? shareUserId : me.id;
    const targetEmail = me.role === "admin" && shareUserId ? (users.find(u => u.id === shareUserId)?.email || "user") : me.email;
    const { data: existing } = await supabase.from("submission_forms").select("slug").eq("user_id", targetUserId).maybeSingle();
    let slug = existing?.slug;
    if (!slug) {
      const base = slugify(targetEmail.split("@")[0]) || `form-${targetUserId.slice(0, 6)}`;
      let candidate = base, n = 1;
      while (true) {
        const { data: hit } = await supabase.from("submission_forms").select("id").eq("slug", candidate).maybeSingle();
        if (!hit) break; candidate = `${base}-${n++}`;
      }
      const { data: created, error } = await supabase.from("submission_forms").insert({ user_id: targetUserId, slug: candidate, name: "Submit a Lead", is_active: true }).select("slug").single();
      if (error) { alert("Could not provision form: " + error.message); setGenerating(false); return; }
      slug = created?.slug;
    }
    setGenLink(`${origin}/submit/${slug}`); setGenerating(false);
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: SKY }} /></div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#15131D", letterSpacing: "-0.02em" }}>Submit a Lead</h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>Drop the property, attach the call. The floor gets the verdict back in seconds.</p>
      </div>

      {/* Result banner */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700,
              background: result.kind === "ok" ? "rgba(52,211,153,0.12)" : result.kind === "dup" ? "rgba(245,158,11,0.12)" : "rgba(251,113,133,0.12)",
              border: `1px solid ${result.kind === "ok" ? "#A7F3D0" : result.kind === "dup" ? "#FCD34D" : "#FECACA"}`,
              color: result.kind === "ok" ? MONEY : result.kind === "dup" ? "#F59E0B" : "#DC2626",
            }}>
            {result.kind === "ok" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {result.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN FORM CARD ── */}
      <form onSubmit={submit}>
        <div style={{ background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Address — large prominent */}
          <div>
            <label style={labelStyle}><MapPin size={12} style={{ display: "inline", marginRight: 5, marginBottom: -1, color: SKY_600 }} />Property Address *</label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => setForm(f => ({ ...f, address: v }))}
              onSelect={(parts) => setForm(f => ({ ...f, address: parts.formatted, parts }))}
              placeholder="Start typing an address — Google will autocomplete"
              required
              style={{ ...fieldStyle, padding: "16px 16px", fontSize: 16, fontWeight: 600, borderColor: SKY, boxShadow: "0 0 0 3px rgba(59,130,246,0.10)" }}
            />
            {form.parts && (form.parts.city || form.parts.state) && (
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                Parsed: {[form.parts.street, form.parts.city, form.parts.state, form.parts.zip].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          {/* Dropzone */}
          <div>
            <label style={labelStyle}>Call Recordings (multiple OK)</label>
            <motion.div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
              animate={{ borderColor: dragOver ? SKY : "rgba(59,130,246,0.35)", backgroundColor: dragOver ? "rgba(59,130,246,0.08)" : "#F1F2F8" }}
              transition={{ duration: 0.15 }}
              style={{
                border: "2px dashed", borderRadius: 14, padding: "30px 20px", textAlign: "center", cursor: "pointer",
              }}>
              <motion.div animate={{ y: dragOver ? -3 : 0 }}>
                <UploadCloud size={34} color={SKY_600} style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: 14, fontWeight: 800, color: "#15131D" }}>{dragOver ? "Drop to attach" : "Drag & drop audio here"}</p>
                <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>or click to browse · MP3, WAV, M4A, MP4</p>
              </motion.div>
              <input ref={fileInputRef} type="file" multiple accept={ACCEPT} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            </motion.div>

            {/* File list */}
            <AnimatePresence initial={false}>
              {files.map((f, i) => (
                <motion.div key={f.name + f.size} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={SPRING}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginTop: 8, borderRadius: 10, background: "#F1F2F8", border: "1px solid var(--border-2)" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(59,130,246,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Music size={14} color={SKY_600} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: "#15131D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</p>
                    <p style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtSize(f.size)}</p>
                  </div>
                  <button type="button" onClick={() => removeFile(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", padding: 4 }} title="Remove">
                    <X size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* OR: paste a call recording link (shared with "anyone with the link") */}
            <div style={{ marginTop: 10 }}>
              <label style={{ ...labelStyle, fontSize: 11 }}>Or paste a call recording link</label>
              <input type="url" value={form.driveLink}
                onChange={e => setForm(f => ({ ...f, driveLink: e.target.value }))}
                placeholder="https://drive.google.com/file/d/…  (anyone with the link)"
                style={fieldStyle} />
            </div>
          </div>

          {/* Agent + Campaign */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="ci-grid">
            <div>
              <label style={labelStyle}>Cold Caller (Agent)</label>
              <select value={form.callerId} onChange={e => setForm(f => ({ ...f, callerId: e.target.value }))} style={fieldStyle}>
                <option value="">{me ? `— Me (${me.email.split("@")[0]}) —` : "Select…"}</option>
                {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Campaign *</label>
              <select value={form.campaignId} onChange={e => setForm(f => ({ ...f, campaignId: e.target.value }))} required style={fieldStyle}>
                <option value="">Select campaign…</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Owner + Asking */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="ci-grid">
            <div><label style={labelStyle}>Owner Name</label>
              <input value={form.ownerName} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} placeholder="Property owner" style={fieldStyle} /></div>
            <div><label style={labelStyle}>Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" style={fieldStyle} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="ci-grid">
            <div><label style={labelStyle}>Asking Price</label>
              <input type="number" value={form.askingPrice} onChange={e => setForm(f => ({ ...f, askingPrice: e.target.value }))} placeholder="250000" style={fieldStyle} /></div>
            <div><label style={labelStyle}>Listing Link</label>
              <input type="url" value={form.zillowLink} onChange={e => setForm(f => ({ ...f, zillowLink: e.target.value }))} placeholder="https://zillow.com/…" style={fieldStyle} /></div>
          </div>
          <div><label style={labelStyle}>Notes</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason for selling, motivation, follow-up timing…" rows={3} style={{ ...fieldStyle, resize: "vertical", fontFamily: "var(--font-sans)" }} /></div>

          {/* Submit button — framer-motion loading state */}
          <motion.button type="submit" disabled={submitting}
            whileHover={submitting ? undefined : { scale: 1.01 }} whileTap={submitting ? undefined : { scale: 0.99 }}
            animate={{ background: submitting ? "#86EFAC" : "linear-gradient(135deg, #3B82F6, #2563EB)" }}
            style={{
              width: "100%", padding: "16px 24px", borderRadius: 12, border: "none",
              color: "#fff", fontSize: 15, fontWeight: 800, cursor: submitting ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              boxShadow: "0 12px 28px rgba(59,130,246,0.40)", marginTop: 4, overflow: "hidden",
            }}>
            <AnimatePresence mode="wait" initial={false}>
              {submitting ? (
                <motion.span key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                  <Loader2 size={17} className="animate-spin" /> {phase || "Working…"}
                </motion.span>
              ) : (
                <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                  <Send size={17} /> Submit &amp; Grade
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </form>

      {/* ── SHARE LINK ── */}
      <div style={{ background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 18, padding: 20, boxShadow: "var(--shadow-sm)" }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: "#15131D", marginBottom: 4 }}>Shareable Submission Link</p>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 14 }}>
          {me?.role === "admin" ? "Generate a public form link for any user." : "Generate a public form link — submissions land in your dashboard."}
        </p>
        {me?.role === "admin" && (
          <select value={shareUserId} onChange={e => setShareUserId(e.target.value)} style={{ ...fieldStyle, marginBottom: 12 }}>
            <option value="">— Myself —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        )}
        <button type="button" onClick={generateLink} disabled={generating} style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10,
          background: "#FFFFFF", color: SKY_600, border: `1px solid ${SKY}`, fontSize: 13, fontWeight: 700, cursor: generating ? "wait" : "pointer",
        }}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} {genLink ? "Regenerate" : "Generate Link"}
        </button>
        {genLink && (
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "#F1F2F8", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 10 }}>
            <code style={{ flex: 1, fontSize: 12, color: "#15131D", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{genLink}</code>
            <button onClick={() => { navigator.clipboard.writeText(genLink); setCopied(true); setTimeout(() => setCopied(false), 1600); }} style={{ padding: 6, background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 7, cursor: "pointer", color: "#15131D" }}>
              {copied ? <Check size={14} color={MONEY} /> : <Copy size={14} />}
            </button>
            <a href={genLink} target="_blank" rel="noreferrer" style={{ padding: 6, background: "#FFFFFF", border: "1px solid var(--border-2)", borderRadius: 7, color: "#15131D" }}><ExternalLink size={14} /></a>
          </div>
        )}
      </div>
    </div>
  );
}
