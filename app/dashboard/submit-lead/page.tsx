"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { Send, Loader2, CheckCircle2, Link2, Copy, Check, Users, ExternalLink } from "lucide-react";
import { AddressAutocomplete } from "@/app/_components/AddressAutocomplete";
import { PipelineProgress } from "@/app/_components/PipelineProgress";

import { T } from "@/app/_components/tokens";
const NAVY = T.text1;
const TEAL = T.teal;
const SLATE = T.text2;

interface Campaign { id: string; name: string; }
interface ColdCaller { id: string; name: string; }
interface UserRow { id: string; email: string; }

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  background: "#F2F5F9", border: "1px solid rgba(35,43,58,0.10)",
  fontSize: 13, color: NAVY, outline: "none",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 6,
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export default function SubmitLeadPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [callers, setCallers] = useState<ColdCaller[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; email: string; role: string } | null>(null);

  const [shareUserId, setShareUserId] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [zLookup, setZLookup] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" });
  const [zData, setZData] = useState<Record<string, unknown> | null>(null);

  // Fetch property data for the typed address (or Zillow link) via /api/zillow.
  const lookupZillow = async () => {
    const addr = formData.property_address.trim();
    const link = formData.zillow_link.trim();
    if (!addr && !link) { setZLookup({ busy: false, msg: "Enter an address (or Zillow link) first." }); return; }
    setZLookup({ busy: true, msg: "Fetching property data…" });
    try {
      const params = new URLSearchParams();
      if (link) params.set("url", link); else params.set("address", addr);
      const res = await fetch(`/api/zillow?${params.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setZLookup({ busy: false, msg: j.error || "Lookup failed." }); return; }
      const n = j.normalized as Record<string, unknown>;
      setZData(n);
      const zest = n.zestimate as number | undefined;
      setForm(f => ({
        ...f,
        property_address: (n.address as string) || f.property_address,
        zestimate: zest ? String(zest) : f.zestimate,
        zillow_link: (n.zillow_url as string) || f.zillow_link,
      }));
      if (j.warning) { setZLookup({ busy: false, msg: "⚠ " + j.warning }); return; }
      const bits: string[] = [];
      if (zest) bits.push(`Zestimate $${zest.toLocaleString()}`);
      if (n.beds) bits.push(`${n.beds} bd`);
      if (n.baths) bits.push(`${n.baths} ba`);
      if (n.sqft) bits.push(`${(n.sqft as number).toLocaleString()} sqft`);
      setZLookup({ busy: false, msg: bits.length ? bits.join(" · ") : "Found." });
    } catch (e) {
      setZLookup({ busy: false, msg: e instanceof Error ? e.message : "Lookup failed." });
    }
  };

  const [formData, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    owner_name: "",
    phone_number: "",
    property_address: "",
    zestimate: "",
    zillow_link: "",
    asking_price: "",
    reason: "",
    campaign_id: "",
    caller_id: "",
  });

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles").select("id, email, role").eq("id", user.id).maybeSingle();
      if (profile) setMe(profile);

      const [cRes, calRes] = await Promise.all([
        supabase.from("campaigns").select("id,name").eq("user_id", user.id),
        supabase.from("cold_callers").select("id,name").eq("user_id", user.id),
      ]);
      if (cRes.data) setCampaigns(cRes.data);
      if (calRes.data) setCallers(calRes.data);
      if (cRes.data?.length) setForm(f => ({ ...f, campaign_id: cRes.data![0].id }));

      if (profile?.role === "admin") {
        const { data: allUsers } = await supabase.from("profiles").select("id, email").order("email");
        if (allUsers) setUsers(allUsers);
      }
      setLoading(false);
    })();
  }, []);

  const generateLink = async () => {
    if (!me) return;
    setGenerating(true);
    setGeneratedLink("");

    const targetUserId = me.role === "admin" && shareUserId ? shareUserId : me.id;
    const targetEmail = me.role === "admin" && shareUserId
      ? users.find(u => u.id === shareUserId)?.email || "user"
      : me.email;

    const { data: existing } = await supabase
      .from("submission_forms").select("slug").eq("user_id", targetUserId).maybeSingle();

    let slug = existing?.slug;
    if (!slug) {
      const base = slugify(targetEmail.split("@")[0]) || `form-${targetUserId.slice(0, 6)}`;
      let candidate = base;
      let n = 1;
      while (true) {
        const { data: hit } = await supabase
          .from("submission_forms").select("id").eq("slug", candidate).maybeSingle();
        if (!hit) break;
        candidate = `${base}-${n++}`;
      }
      const { data: created, error } = await supabase
        .from("submission_forms")
        .insert({ user_id: targetUserId, slug: candidate, name: "Submit a Lead", is_active: true })
        .select("slug").single();
      if (error) {
        alert("Could not provision form: " + error.message);
        setGenerating(false);
        return;
      }
      slug = created?.slug;
    }
    setGeneratedLink(`${origin}/submit/${slug}`);
    setGenerating(false);
  };

  const copyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const selectedCaller = callers.find(c => c.id === formData.caller_id);

    // AUTO property fetch — no Lookup button anymore. We resolve the address to
    // full Zillow data + run ARV here, then persist everything into metadata
    // and let the AI analyzer use it during qualification.
    let auto: Record<string, unknown> | null = zData;
    let autoArv: { estimatedArv: number | null; confidence: number } | null = null;
    if (!auto && (formData.property_address.trim() || formData.zillow_link.trim())) {
      setSuccess("Fetching property data…");
      try {
        const params = new URLSearchParams();
        if (formData.zillow_link.trim()) params.set("url", formData.zillow_link.trim());
        else params.set("address", formData.property_address.trim());
        const r = await fetch(`/api/zillow?${params.toString()}`);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) {
          auto = j.normalized as Record<string, unknown>;
          // Run an ARV estimate from the comps the provider returned (or fallback).
          try {
            const arvRes = await fetch("/api/leads/arv", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ normalized: auto, comparables: j.comparables ?? [] }),
            });
            const arvJ = await arvRes.json().catch(() => ({}));
            if (arvRes.ok) autoArv = arvJ;
          } catch { /* arv is best-effort */ }
        }
      } catch { /* lookup is best-effort */ }
    }

    const leadData = {
      user_id: user.id,
      campaign_id: formData.campaign_id,
      caller_id: formData.caller_id || null,
      agent_name: selectedCaller?.name || null,
      extracted_address: formData.property_address,
      asking_price: formData.asking_price ? parseFloat(formData.asking_price) : null,
      status: "Processing",
      metadata: {
        date: formData.date,
        owner_name: formData.owner_name,
        phone_number: formData.phone_number,
        // Auto-populated from the provider (overrides empty form values)
        zestimate: formData.zestimate || (auto?.zestimate as number | undefined)?.toString() || "",
        zillow_link: formData.zillow_link || (auto?.zillow_url as string | undefined) || "",
        reason: formData.reason,
        zillow_data: auto,
        arv: autoArv?.estimatedArv ?? null,
        arv_confidence: autoArv?.confidence ?? null,
        submitted_via: "internal_form",
      },
    };

    const { data: inserted, error } = await supabase.from("leads").insert(leadData).select("id").single();

    if (error || !inserted) {
      alert("Failed to submit: " + (error?.message || "unknown"));
      setSubmitting(false);
      return;
    }

    setSuccess("Submitted. Analyzing call...");
    try {
      const res = await fetch("/api/leads/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: inserted.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setSuccess(`Done. Lead marked: ${json.status}`);
      else setSuccess(`Submitted. Review failed: ${json.error || "unknown"} — lead remains in Processing.`);
    } catch {
      setSuccess("Submitted. Review request failed — will retry.");
    }

    setForm({
      date: new Date().toISOString().split("T")[0],
      owner_name: "", phone_number: "",
      property_address: "", zestimate: "", zillow_link: "", asking_price: "", reason: "",
      campaign_id: campaigns[0]?.id || "", caller_id: "",
    });
    setSubmitting(false);
    setTimeout(() => setSuccess(null), 5000);
  };

  if (loading) return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto", color: NAVY }} />
    </div>
  );

  const isAdmin = me?.role === "admin";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Submit Lead</h1>
        <p style={{ fontSize: 13, color: SLATE }}>Submit a lead directly or share a public form link.</p>
      </div>

      <Card title="Shareable Submission Link">
        <p style={{ fontSize: 12, color: SLATE, marginBottom: 14, lineHeight: 1.6 }}>
          {isAdmin
            ? "Generate a public submission link for any user. Anyone with the link can submit leads on their behalf."
            : "Generate your own public submission link. Share it with anyone — submissions land in your dashboard."}
        </p>

        {isAdmin && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>
              <Users size={12} style={{ display: "inline", marginRight: 4, marginBottom: -1 }} />
              Generate link for which user?
            </label>
            <select value={shareUserId} onChange={e => setShareUserId(e.target.value)} style={inputStyle}>
              <option value="">— Myself —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
        )}

        <button type="button" onClick={generateLink} disabled={generating} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 18px", borderRadius: 10,
          background: T.midnight, color: "#fff",
          fontSize: 13, fontWeight: 700, border: "none",
          cursor: generating ? "wait" : "pointer",
          boxShadow: "0 4px 14px rgba(35,43,58,0.25)",
        }}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
          {generatedLink ? "Regenerate" : "Generate Link"}
        </button>

        {generatedLink && (
          <div style={{
            marginTop: 14, padding: "12px 14px", borderRadius: 10,
            background: "#E8EFFF", border: `1px solid ${TEAL}40`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <code style={{ flex: 1, fontSize: 12, color: NAVY, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {generatedLink}
            </code>
            <button onClick={copyLink} style={{ padding: 6, background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 7, cursor: "pointer", color: NAVY }}>
              {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
            </button>
            <a href={generatedLink} target="_blank" rel="noreferrer" style={{ padding: 6, background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 7, color: NAVY }}>
              <ExternalLink size={14} />
            </a>
          </div>
        )}
      </Card>

      {submitting && (() => {
        const m = (success || "").toLowerCase();
        const step = m.includes("done") || m.includes("marked") ? 4
          : m.includes("submitted") || m.includes("analyzing") ? 3
          : m.includes("fetching") || m.includes("property") ? 1
          : 0;
        return (
          <div style={{
            padding: 18, borderRadius: 14,
            background: "var(--surface-1)", border: "1px solid var(--border-2)",
            boxShadow: "var(--shadow-md)",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>{success || "Submitting…"}</p>
            <PipelineProgress current={step} />
          </div>
        );
      })()}

      {!submitting && success && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: "#ECFDF5", border: "1px solid #A7F3D0",
          display: "flex", alignItems: "center", gap: 10,
          color: "#059669", fontSize: 13, fontWeight: 600,
        }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card title="Quick Manual Entry">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={formData.date} onChange={e => setForm({ ...formData, date: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cold Caller *</label>
              <select value={formData.caller_id} onChange={e => setForm({ ...formData, caller_id: e.target.value })} required style={inputStyle}>
                <option value="">Select a caller...</option>
                {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Owner Name</label>
              <input type="text" value={formData.owner_name} onChange={e => setForm({ ...formData, owner_name: e.target.value })} placeholder="Property owner" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input type="tel" value={formData.phone_number} onChange={e => setForm({ ...formData, phone_number: e.target.value })} placeholder="+1 (555) 000-0000" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Property Address *</label>
            <AddressAutocomplete
              placeholder="Start typing — Google will autocomplete"
              value={formData.property_address}
              onChange={(v) => setForm({ ...formData, property_address: v })}
              required
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: SLATE, marginTop: 6 }}>
              Property details (Zestimate, beds, baths, sqft) and a local-comp ARV are fetched automatically when you submit.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Zestimate</label>
              <input type="text" value={formData.zestimate} onChange={e => setForm({ ...formData, zestimate: e.target.value })} placeholder="$275,000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Zillow Link</label>
              <input type="url" value={formData.zillow_link} onChange={e => setForm({ ...formData, zillow_link: e.target.value })} placeholder="https://zillow.com/..." style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Asking Price</label>
              <input type="number" value={formData.asking_price} onChange={e => setForm({ ...formData, asking_price: e.target.value })} placeholder="250000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Campaign *</label>
              <select value={formData.campaign_id} onChange={e => setForm({ ...formData, campaign_id: e.target.value })} required style={inputStyle}>
                <option value="">Select campaign...</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={formData.reason} onChange={e => setForm({ ...formData, reason: e.target.value })} placeholder="Reason for selling, motivation, follow-up timing..." rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-sans)" }} />
          </div>
        </Card>

        <button type="submit" disabled={submitting} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", padding: "14px 24px", borderRadius: 11,
          background: submitting ? "#E5E9F0" : NAVY,
          color: submitting ? SLATE : "#fff",
          fontSize: 14, fontWeight: 800, border: "none",
          cursor: submitting ? "wait" : "pointer",
          boxShadow: submitting ? "none" : "0 6px 20px rgba(35,43,58,0.25)",
        }}>
          {submitting ? <><Loader2 size={15} className="animate-spin" /> Analyzing...</> : <><Send size={15} /> Submit & Analyze</>}
        </button>
      </form>
    </div>
  );
}
