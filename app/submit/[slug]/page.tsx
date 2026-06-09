"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Send, Loader2, CheckCircle2, AlertCircle, Upload, Lock, X, FileAudio } from "lucide-react";
import { AddressAutocomplete } from "@/app/_components/AddressAutocomplete";
import { PipelineProgress } from "@/app/_components/PipelineProgress";
import { T } from "@/app/_components/tokens";

const NAVY = T.text1;
const TEAL = T.teal;
const SLATE = T.text2;

interface FormOwner {
  user_id: string;
  form_id: string;
  form_name: string;
  is_active: boolean;
  can_receive_leads: boolean;
  allow_call_uploads: boolean;
}
interface Caller { id: string; name: string; }
interface Campaign { id: string; name: string; }

export default function DynamicSubmitPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<FormOwner | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [callers, setCallers] = useState<Caller[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [callFiles, setCallFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [doneStatus, setDoneStatus] = useState<string | null>(null);
  const [zLookup, setZLookup] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" });
  // Resolved Zillow property data for the main address (carried into metadata)
  const [zData, setZData] = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared helper — fetch property data for one address (or Zillow URL).
  // Returns the full API response so callers can read normalized + warning.
  const fetchZillow = async (address: string, zillowUrl?: string) => {
    const params = new URLSearchParams();
    if (zillowUrl && zillowUrl.trim()) params.set("url", zillowUrl.trim());
    else params.set("address", address.trim());
    const res = await fetch(`/api/zillow?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || "Lookup failed");
    return json as { normalized: Record<string, unknown>; warning?: string };
  };

  // Get data for the MAIN address typed in the form.
  const lookupZillow = async () => {
    const addr = formData.property_address.trim();
    const link = formData.zillow_link.trim();
    if (!addr && !link) {
      setZLookup({ busy: false, msg: "Enter an address (or paste a Zillow link) first." });
      return;
    }
    setZLookup({ busy: true, msg: "Fetching property data…" });
    try {
      const resp = await fetchZillow(addr, link);
      const n = resp.normalized;
      setZData(n);
      const zest = n.zestimate as number | undefined;
      setForm(f => ({
        ...f,
        property_address: (n.address as string) || f.property_address,
        zestimate: zest ? String(zest) : f.zestimate,
        zillow_link: (n.zillow_url as string) || f.zillow_link,
      }));
      if (resp.warning) { setZLookup({ busy: false, msg: "⚠ " + resp.warning }); return; }
      const bits: string[] = [];
      if (zest) bits.push(`Zestimate $${zest.toLocaleString()}`);
      if (n.beds) bits.push(`${n.beds} bd`);
      if (n.baths) bits.push(`${n.baths} ba`);
      if (n.sqft) bits.push(`${(n.sqft as number).toLocaleString()} sqft`);
      setZLookup({ busy: false, msg: bits.length ? bits.join(" · ") : "Found — filled what we could." });
    } catch (e) {
      setZLookup({ busy: false, msg: e instanceof Error ? e.message : "Lookup failed." });
    }
  };

  const [formData, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    caller_id: "",
    campaign_id: "",
    owner_name: "",
    phone_number: "",
    property_address: "",
    zestimate: "",
    zillow_link: "",
    asking_price: "",
    reason: "",
  });

  // Optional extra properties the caller can append with the (+) button
  type Extra = {
    address: string; zestimate: string; asking_price: string;
    busy?: boolean; msg?: string;
    data?: Record<string, unknown> | null;
  };
  const [extraProps, setExtraProps] = useState<Array<Extra>>([]);
  const addProperty = () => setExtraProps(p => [...p, { address: "", zestimate: "", asking_price: "" }]);
  const removeProperty = (i: number) => setExtraProps(p => p.filter((_, idx) => idx !== i));
  const updateProperty = (i: number, key: "address" | "zestimate" | "asking_price", val: string) =>
    setExtraProps(p => p.map((row, idx) => idx === i ? { ...row, [key]: val } : row));

  // Run the Zillow lookup for one extra property row.
  const lookupExtra = async (i: number) => {
    const row = extraProps[i];
    if (!row?.address?.trim()) {
      setExtraProps(p => p.map((r, idx) => idx === i ? { ...r, msg: "Type an address first." } : r));
      return;
    }
    setExtraProps(p => p.map((r, idx) => idx === i ? { ...r, busy: true, msg: "Fetching…" } : r));
    try {
      const resp = await fetchZillow(row.address);
      const n = resp.normalized;
      const zest = n.zestimate as number | undefined;
      const bits: string[] = [];
      if (zest) bits.push(`Zestimate $${zest.toLocaleString()}`);
      if (n.beds) bits.push(`${n.beds} bd`);
      if (n.baths) bits.push(`${n.baths} ba`);
      if (n.sqft) bits.push(`${(n.sqft as number).toLocaleString()} sqft`);
      setExtraProps(p => p.map((r, idx) => idx === i ? {
        ...r,
        address: (n.address as string) || r.address,
        zestimate: zest ? String(zest) : r.zestimate,
        data: n, busy: false,
        msg: resp.warning ? "⚠ " + resp.warning : (bits.length ? bits.join(" · ") : "Found."),
      } : r));
    } catch (e) {
      setExtraProps(p => p.map((r, idx) => idx === i ? { ...r, busy: false, msg: e instanceof Error ? e.message : "Lookup failed." } : r));
    }
  };

  useEffect(() => {
    if (!slug) return;
    (async () => {
      // Load via a server route that uses the service-role key, so the form
      // works for ANY visitor with the link (no login / client-side RLS needed).
      try {
        const res = await fetch(`/api/public-form?slug=${encodeURIComponent(slug)}`);
        const j = await res.json().catch(() => ({}));
        if (!j.ok) { setBlocked(j.blocked || j.error || "This form is unavailable."); setLoading(false); return; }

        setOwner({
          user_id: j.form.user_id, form_id: j.form.form_id,
          form_name: j.form.form_name || "Submit a Lead",
          is_active: true,
          can_receive_leads: true,
          allow_call_uploads: !!j.form.allow_call_uploads,
        });
        setCallers(j.callers || []);
        setCampaigns(j.campaigns || []);
      } catch {
        setBlocked("Couldn't load this form. Please try again.");
      }
      setLoading(false);
    })();
  }, [slug]);

  const addFiles = (files: FileList | File[]) => {
    const out: File[] = [];
    const valid = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "video/mp4", "audio/x-m4a", "audio/m4a", "audio/webm"];
    for (const f of Array.from(files)) {
      if (f.size > 500 * 1024 * 1024) { setError(`${f.name} is over 500MB`); continue; }
      if (!valid.includes(f.type) && !/\.(mp3|wav|ogg|m4a|mp4|webm)$/i.test(f.name)) { setError(`${f.name} is not an audio/video file`); continue; }
      out.push(f);
    }
    if (out.length) { setCallFiles((p) => [...p, ...out]); setError(""); }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
  };
  const removeFile = (i: number) => setCallFiles((p) => p.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!owner) return;
    setSubmitting(true);
    setError("");
    setStatusMsg("Fetching property data…");

    // AUTO-FETCH property data + ARV (no Lookup button anymore).
    let auto: Record<string, unknown> | null = zData;
    let autoArv: { estimatedArv: number | null; confidence: number } | null = null;
    if (!auto && (formData.property_address.trim() || formData.zillow_link.trim())) {
      try {
        const params = new URLSearchParams();
        if (formData.zillow_link.trim()) params.set("url", formData.zillow_link.trim());
        else params.set("address", formData.property_address.trim());
        const r = await fetch(`/api/zillow?${params}`);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) {
          auto = j.normalized as Record<string, unknown>;
          try {
            const arvR = await fetch("/api/leads/arv", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ normalized: auto, comparables: j.comparables ?? [] }),
            });
            if (arvR.ok) autoArv = await arvR.json();
          } catch {}
        }
      } catch {}
    }
    setStatusMsg("Submitting…");

    try {
      // Insert through the server route (service-role) so it works for anyone
      // with the link, regardless of login state or region.
      const insertRes = await fetch("/api/public-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          lead: {
            caller_id: formData.caller_id || null,
            campaign_id: formData.campaign_id || null,
            date: formData.date,
            owner_name: formData.owner_name,
            phone_number: formData.phone_number,
            property_address: formData.property_address,
            zestimate: formData.zestimate || (auto?.zestimate as number | undefined)?.toString() || "",
            zillow_link: formData.zillow_link || (auto?.zillow_url as string | undefined) || "",
            asking_price: formData.asking_price,
            reason: formData.reason,
            // Full property data + ARV auto-resolved on submit.
            zillow_data: auto,
            arv: autoArv?.estimatedArv ?? null,
            arv_confidence: autoArv?.confidence ?? null,
            additional_properties: extraProps
              .filter(p => p.address || p.zestimate || p.asking_price)
              .map(p => ({
                address: p.address,
                zestimate: p.zestimate,
                asking_price: p.asking_price,
                zillow_data: p.data || null,
              })),
          },
        }),
      });
      const insertJson = await insertRes.json().catch(() => ({}));
      if (!insertRes.ok || !insertJson.ok) throw new Error(insertJson.error || "Submission failed");
      const lead = { id: insertJson.leadId as string };

      // High-volume safe: store recordings in-house, then ENQUEUE. The backend
      // worker analyzes queued leads strictly one-at-a-time in order — a burst of
      // simultaneous submissions never overloads the AI.
      if (callFiles.length) {
        setStatusMsg(`Uploading ${callFiles.length} recording${callFiles.length > 1 ? "s" : ""}…`);
        const fd = new FormData();
        fd.append("slug", slug);
        fd.append("leadId", lead.id);
        for (const f of callFiles) fd.append("files", f);
        const up = await fetch("/api/public-form/upload", { method: "POST", body: fd });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok || !upJson.ok) throw new Error(upJson.error || "Recording upload failed. Please try again.");
      }

      setStatusMsg("Adding your lead to the queue…");
      const qRes = await fetch(`/api/leads/${lead.id}/queue`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!qRes.ok) throw new Error("Could not queue the lead. Please try again.");

      // Success — the lead is accepted and pending in the ordered queue.
      setStatusMsg(null);
      setDoneStatus("Submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setStatusMsg(null);
    }
    setSubmitting(false);
  };

  const resetForNewLead = () => {
    setForm({
      date: new Date().toISOString().split("T")[0],
      caller_id: "", campaign_id: "",
      owner_name: "", phone_number: "",
      property_address: "", zestimate: "", zillow_link: "", asking_price: "", reason: "",
    });
    setExtraProps([]);
    setCallFiles([]);
    setError("");
    setStatusMsg(null);
    setDoneStatus(null);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F2F5F9" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: NAVY }} />
      </div>
    );
  }

  if (blocked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F2F5F9", padding: 24 }}>
        <div style={{
          maxWidth: 440, padding: 40, background: "#fff", borderRadius: 16,
          border: "1px solid rgba(35,43,58,0.08)", textAlign: "center",
          boxShadow: "0 12px 40px rgba(35,43,58,0.08)",
        }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#F1F4F9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <Lock size={28} color={SLATE} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Form Unavailable</h1>
          <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.6 }}>{blocked}</p>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 9,
    background: "#F2F5F9", border: "1px solid rgba(35,43,58,0.08)",
    fontSize: 13, color: NAVY, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #F2F5F9 0%, #FFF 100%)", padding: "40px 24px" }} className="animate-in">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <svg width={40} height={26} viewBox="0 0 40 24" fill="none">
              <path d="M2 22 L20 4 L38 22" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 22 L20 11 L32 22" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 20, fontWeight: 800, color: NAVY, letterSpacing: "0.04em" }}>RealTrack</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: NAVY, marginBottom: 8 }}>{owner?.form_name}</h1>
          <p style={{ fontSize: 13, color: SLATE }}>Submit a lead — AI evaluation runs automatically.</p>
        </div>

        {error && !doneStatus && (
          <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: "#FBEEE8", border: "1px solid #E7B8A6", display: "flex", alignItems: "center", gap: 10, color: "#DC2626", fontSize: 13, fontWeight: 600 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* ── SUCCESS SCREEN ── */}
        {doneStatus ? (
          <div style={{
            background: "#FFF", borderRadius: 16, padding: "40px 28px",
            border: "1px solid rgba(35,43,58,0.08)", boxShadow: "0 2px 12px rgba(35,43,58,0.06)",
            textAlign: "center",
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", background: "#ECFDF5",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
            }}>
              <CheckCircle2 size={36} color="#059669" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
              Lead submitted successfully!
            </h2>
            <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.6, marginBottom: 6 }}>
              Our AI has reviewed the call and verified this lead.
            </p>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 16px", borderRadius: 999, marginBottom: 28,
              background: ["Hot","Warm","Cold"].includes(doneStatus || "") ? "#ECFDF5" : doneStatus === "Disqualified" ? "#F1F4F9" : "#FFFBEB",
              color: ["Hot","Warm","Cold"].includes(doneStatus || "") ? "#059669" : doneStatus === "Disqualified" ? "#4B5563" : "#92400E",
              fontSize: 13, fontWeight: 800,
            }}>
              Verdict: {doneStatus}
            </div>
            <button onClick={resetForNewLead} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "14px 24px", borderRadius: 11,
              background: T.midnight, color: "#fff", fontSize: 14, fontWeight: 800,
              border: "none", cursor: "pointer", boxShadow: `0 6px 20px rgba(35,43,58,0.25)`,
            }}>
              <Send size={15} /> Submit New Lead
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} style={{ background: "#FFF", borderRadius: 14, padding: 24, border: "1px solid rgba(35,43,58,0.08)", boxShadow: "0 2px 12px rgba(35,43,58,0.06)", position: "relative" }}>
          {submitting && (() => {
            const m = (statusMsg || "").toLowerCase();
            const step = m.includes("verdict") ? 4
              : m.includes("review") || m.includes("verify") ? 3
              : m.includes("upload") ? 2
              : m.includes("property") || m.includes("fetch") ? 1
              : 0;
            return (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 14, zIndex: 5,
                background: "rgba(255,255,255,0.94)", backdropFilter: "blur(4px)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 16, padding: 24,
              }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{statusMsg || "Processing…"}</p>
                <div style={{ width: "100%", maxWidth: 460 }}>
                  <PipelineProgress current={step} />
                </div>
                <p style={{ fontSize: 12, color: SLATE, maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>
                  Keep this page open — the lead is saved only after the AI finishes verifying it.
                </p>
              </div>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <select value={formData.caller_id} onChange={e => setForm({ ...formData, caller_id: e.target.value })} required style={inputStyle}>
              <option value="">Select Cold Caller *</option>
              {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={formData.campaign_id} onChange={e => setForm({ ...formData, campaign_id: e.target.value })} required style={inputStyle}>
              <option value="">Select Campaign *</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <input type="date" value={formData.date} onChange={e => setForm({ ...formData, date: e.target.value })} required style={inputStyle} />
            <input type="tel" placeholder="Phone Number *" value={formData.phone_number} onChange={e => setForm({ ...formData, phone_number: e.target.value })} required style={inputStyle} />
          </div>
          <input type="text" placeholder="Owner Name *" value={formData.owner_name} onChange={e => setForm({ ...formData, owner_name: e.target.value })} required style={{ ...inputStyle, marginBottom: 14 }} />
          <AddressAutocomplete
            placeholder="Property Address (start typing — Google will suggest)"
            value={formData.property_address}
            onChange={(v) => setForm({ ...formData, property_address: v })}
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <p style={{ fontSize: 11, color: SLATE, marginBottom: 14 }}>
            Property details + ARV are fetched automatically when you submit.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <input type="text" placeholder="Zestimate (optional)" value={formData.zestimate} onChange={e => setForm({ ...formData, zestimate: e.target.value })} style={inputStyle} />
            <input type="number" placeholder="Asking Price (optional)" value={formData.asking_price} onChange={e => setForm({ ...formData, asking_price: e.target.value })} style={inputStyle} />
          </div>
          <input type="url" placeholder="Zillow Link (optional)" value={formData.zillow_link} onChange={e => setForm({ ...formData, zillow_link: e.target.value })} style={{ ...inputStyle, marginBottom: 14 }} />

          {/* Extra properties */}
          {extraProps.map((p, i) => (
            <div key={i} style={{ padding: 12, borderRadius: 10, background: "#F2F5F9", border: "1px solid rgba(35,43,58,0.08)", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: SLATE }}>Property #{i + 2}</span>
                <button type="button" onClick={() => removeProperty(i)} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Remove</button>
              </div>
              <input type="text" placeholder="Address" value={p.address} onChange={e => updateProperty(i, "address", e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
              <p style={{ fontSize: 10, color: SLATE, marginBottom: 10 }}>
                Auto-fetched on submit.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input type="text" placeholder="Zestimate" value={p.zestimate} onChange={e => updateProperty(i, "zestimate", e.target.value)} style={inputStyle} />
                <input type="number" placeholder="Asking Price" value={p.asking_price} onChange={e => updateProperty(i, "asking_price", e.target.value)} style={inputStyle} />
              </div>
            </div>
          ))}
          <button type="button" onClick={addProperty} style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14,
            padding: "8px 14px", borderRadius: 9, cursor: "pointer",
            background: "#E8EFFF", color: NAVY, border: "1px solid color-mix(in srgb, var(--magenta) 33%, transparent)",
            fontSize: 12, fontWeight: 700,
          }}>+ Add another property</button>
          <textarea placeholder="Notes / Reason for selling" rows={3} value={formData.reason} onChange={e => setForm({ ...formData, reason: e.target.value })} style={{ ...inputStyle, resize: "vertical", marginBottom: 14, fontFamily: "var(--font-sans)" }} />

          {owner?.allow_call_uploads && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
              style={{
                padding: 22, borderRadius: 14,
                border: `2px dashed ${dragOver ? TEAL : "color-mix(in srgb, var(--magenta) 31%, transparent)"}`,
                background: dragOver ? "#E8EFFF" : "#EEF3FF",
                textAlign: "center", cursor: "pointer", marginBottom: 14,
                transition: "all 180ms ease",
              }}>
              <Upload size={24} color={TEAL} style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                {dragOver ? "Drop files to upload" : callFiles.length ? "Add more recordings" : "Drag & drop recordings, or click to choose"}
              </p>
              <p style={{ fontSize: 11, color: SLATE, marginTop: 3 }}>
                Audio or video · up to 500MB each · multiple files OK
              </p>
              <input ref={fileInputRef} type="file" multiple accept="audio/*,video/mp4" onChange={handleFileSelect} style={{ display: "none" }} />
            </div>
          )}
          {callFiles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {callFiles.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 9, background: "#F2F5F9", border: "1px solid rgba(35,43,58,0.08)",
                }}>
                  <FileAudio size={14} color={TEAL} />
                  <p style={{ flex: 1, fontSize: 12, color: NAVY, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</p>
                  <span style={{ fontSize: 10, color: SLATE }}>{(f.size / 1_048_576).toFixed(1)} MB</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#DC2626", padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="submit" disabled={submitting} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "14px 24px", borderRadius: 11,
            background: submitting ? "#E5E9F0" : NAVY, color: submitting ? SLATE : "#fff",
            fontSize: 14, fontWeight: 800, border: "none", cursor: submitting ? "wait" : "pointer",
            boxShadow: submitting ? "none" : `0 6px 20px rgba(35,43,58,0.25)`,
          }}>
            {submitting ? <><Loader2 size={15} className="animate-spin" /> Processing...</> : <><Send size={15} /> Submit & Analyze</>}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
