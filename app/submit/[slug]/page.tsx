"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Send, Loader2, CheckCircle2, AlertCircle, Upload, Lock } from "lucide-react";

const NAVY = "#232B3A";
const TEAL = "#2F6BFF";
const SLATE = "#4B5563";

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
  const [callFile, setCallFile] = useState<File | null>(null);
  const [doneStatus, setDoneStatus] = useState<string | null>(null);
  const [zLookup, setZLookup] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pull property data from Zillow scraper (uses address; or Zillow URL if provided)
  const lookupZillow = async () => {
    const useUrl = !!formData.zillow_link.trim();
    const q = useUrl ? formData.zillow_link.trim() : formData.property_address.trim();
    if (!q) {
      setZLookup({ busy: false, msg: "Enter an address (or paste a Zillow link) first." });
      return;
    }
    setZLookup({ busy: true, msg: "Looking up on Zillow…" });
    try {
      const params = new URLSearchParams({ type: useUrl ? "url" : "address", q });
      const res = await fetch(`/api/zillow?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setZLookup({ busy: false, msg: json.error || "Lookup failed." });
        return;
      }
      // Try common fields the scraper returns. Shape varies by endpoint.
      const d = json.data || {};
      const first = Array.isArray(d?.results) ? d.results[0] : (Array.isArray(d) ? d[0] : d);
      const zestimate = first?.zestimate || first?.priceEstimate || first?.estimate || first?.price || "";
      const address = first?.address?.streetAddress
        ? `${first.address.streetAddress}, ${first.address.city || ""} ${first.address.state || ""} ${first.address.zipcode || ""}`.replace(/\s+/g, " ").trim()
        : first?.fullAddress || first?.address || "";
      const link = first?.url || first?.detailUrl || first?.hdpUrl ? `https://zillow.com${first.hdpUrl || first.detailUrl}` : "";

      setForm(f => ({
        ...f,
        property_address: address || f.property_address,
        zestimate: zestimate ? String(zestimate) : f.zestimate,
        zillow_link: useUrl ? f.zillow_link : (link || f.zillow_link),
      }));
      setZLookup({ busy: false, msg: zestimate ? `Zestimate $${Number(String(zestimate).replace(/\D/g, "")).toLocaleString()}` : "Found — filled what we could." });
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
  const [extraProps, setExtraProps] = useState<Array<{ address: string; zestimate: string; asking_price: string }>>([]);
  const addProperty = () => setExtraProps(p => [...p, { address: "", zestimate: "", asking_price: "" }]);
  const removeProperty = (i: number) => setExtraProps(p => p.filter((_, idx) => idx !== i));
  const updateProperty = (i: number, key: "address" | "zestimate" | "asking_price", val: string) =>
    setExtraProps(p => p.map((row, idx) => idx === i ? { ...row, [key]: val } : row));

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: formData } = await supabase
        .from("submission_forms").select("id, user_id, name, is_active, slug")
        .eq("slug", slug).maybeSingle();

      if (!formData) { setBlocked("This form does not exist."); setLoading(false); return; }
      if (!formData.is_active) { setBlocked("This form is currently not accepting submissions."); setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles").select("can_receive_leads, allow_call_uploads")
        .eq("id", formData.user_id).maybeSingle();

      if (!profile?.can_receive_leads) {
        setBlocked("This form is currently not accepting submissions.");
        setLoading(false); return;
      }

      setOwner({
        user_id: formData.user_id, form_id: formData.id,
        form_name: formData.name || "Submit a Lead",
        is_active: formData.is_active,
        can_receive_leads: profile.can_receive_leads,
        allow_call_uploads: profile.allow_call_uploads || false,
      });

      const { data: callerData } = await supabase
        .from("cold_callers").select("id, name").eq("user_id", formData.user_id).order("name");
      const { data: campaignData } = await supabase
        .from("campaigns").select("id, name").eq("user_id", formData.user_id).order("name");
      setCallers(callerData || []);
      setCampaigns(campaignData || []);
      setLoading(false);
    })();
  }, [slug]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) return setError("Max 500MB");
    const valid = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "video/mp4"];
    if (!valid.includes(file.type)) return setError("Audio/video files only");
    setCallFile(file);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!owner) return;
    setSubmitting(true);
    setError("");
    setStatusMsg("Submitting...");

    try {
      const selectedCaller = callers.find(c => c.id === formData.caller_id);

      const { data: lead, error: insertError } = await supabase
        .from("leads")
        .insert({
          user_id: owner.user_id,
          campaign_id: formData.campaign_id || null,
          caller_id: formData.caller_id || null,
          agent_name: selectedCaller?.name || null,
          extracted_address: formData.property_address,
          asking_price: formData.asking_price ? parseFloat(formData.asking_price) : null,
          status: "Processing",
          metadata: {
            date: formData.date,
            owner_name: formData.owner_name,
            phone_number: formData.phone_number,
            zestimate: formData.zestimate,
            zillow_link: formData.zillow_link,
            reason: formData.reason,
            additional_properties: extraProps.filter(p => p.address || p.zestimate || p.asking_price),
            submitted_via: "public_form",
          },
        })
        .select("id").single();

      if (insertError) throw insertError;
      if (!lead) throw new Error("Insert failed");

      // Best-effort: store the recording for playback/library (needs the
      // 'call-uploads' bucket). If the bucket is missing this silently skips —
      // analysis still runs because we send the file bytes directly below.
      if (callFile && owner.allow_call_uploads) {
        setStatusMsg("Uploading recording...");
        const ext = callFile.name.split(".").pop();
        const path = `${owner.user_id}/${lead.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("call-uploads").upload(path, callFile);
        if (!upErr) {
          const { data: pub } = supabase.storage.from("call-uploads").getPublicUrl(path);
          await supabase.from("call_uploads").insert({
            lead_id: lead.id, user_id: owner.user_id,
            file_name: callFile.name, file_path: path,
            file_size_bytes: callFile.size, storage_url: pub.publicUrl, status: "uploaded",
          });
          await supabase.from("leads").update({
            call_recording_url: pub.publicUrl, audio_size_bytes: callFile.size,
          }).eq("id", lead.id);
        }
      }

      setStatusMsg(callFile ? "Reviewing the call & verifying the lead..." : "Verifying the lead...");

      // Send the audio DIRECTLY to the analyzer (multipart) so it works even
      // if storage is unavailable. Falls back to JSON when there's no file.
      let res: Response;
      if (callFile) {
        const fd = new FormData();
        fd.append("leadId", lead.id);
        fd.append("file", callFile);
        res = await fetch("/api/leads/analyze", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/leads/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id }),
        });
      }
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Analysis failed — surface the error, keep the form so they can retry
        throw new Error(json.error || "Verification failed. Please try again.");
      }

      // Success — show the dedicated confirmation screen
      setStatusMsg(null);
      setDoneStatus(json.status || "Submitted");
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
    setCallFile(null);
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
              background: NAVY, color: "#fff", fontSize: 14, fontWeight: 800,
              border: "none", cursor: "pointer", boxShadow: `0 6px 20px rgba(35,43,58,0.25)`,
            }}>
              <Send size={15} /> Submit New Lead
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} style={{ background: "#FFF", borderRadius: 14, padding: 24, border: "1px solid rgba(35,43,58,0.08)", boxShadow: "0 2px 12px rgba(35,43,58,0.06)", position: "relative" }}>
          {submitting && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 14, zIndex: 5,
              background: "rgba(255,255,255,0.92)", backdropFilter: "blur(2px)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
            }}>
              <Loader2 size={34} className="animate-spin" style={{ color: NAVY }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{statusMsg || "Processing..."}</p>
              <p style={{ fontSize: 12, color: SLATE, maxWidth: 320, textAlign: "center", lineHeight: 1.5 }}>
                Please keep this page open — the lead is added only after the AI finishes verifying it.
              </p>
            </div>
          )}
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
          <input type="text" placeholder="Property Address (optional)" value={formData.property_address} onChange={e => setForm({ ...formData, property_address: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button type="button" onClick={lookupZillow} disabled={zLookup.busy} style={{
              padding: "8px 14px", borderRadius: 8, cursor: zLookup.busy ? "wait" : "pointer",
              background: NAVY, color: "#fff", border: "none",
              fontSize: 12, fontWeight: 700,
            }}>{zLookup.busy ? "Looking up…" : "Lookup from Zillow"}</button>
            {zLookup.msg && <span style={{ fontSize: 11, color: SLATE }}>{zLookup.msg}</span>}
          </div>
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
              <input type="text" placeholder="Address" value={p.address} onChange={e => updateProperty(i, "address", e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input type="text" placeholder="Zestimate" value={p.zestimate} onChange={e => updateProperty(i, "zestimate", e.target.value)} style={inputStyle} />
                <input type="number" placeholder="Asking Price" value={p.asking_price} onChange={e => updateProperty(i, "asking_price", e.target.value)} style={inputStyle} />
              </div>
            </div>
          ))}
          <button type="button" onClick={addProperty} style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14,
            padding: "8px 14px", borderRadius: 9, cursor: "pointer",
            background: "#E8EFFF", color: NAVY, border: `1px solid ${TEAL}55`,
            fontSize: 12, fontWeight: 700,
          }}>+ Add another property</button>
          <textarea placeholder="Notes / Reason for selling" rows={3} value={formData.reason} onChange={e => setForm({ ...formData, reason: e.target.value })} style={{ ...inputStyle, resize: "vertical", marginBottom: 14, fontFamily: "var(--font-sans)" }} />

          {owner?.allow_call_uploads && (
            <div onClick={() => fileInputRef.current?.click()} style={{ padding: 18, borderRadius: 10, border: `2px dashed ${TEAL}40`, background: "#EEF3FF", textAlign: "center", cursor: "pointer", marginBottom: 18 }}>
              <Upload size={20} color={TEAL} style={{ margin: "0 auto 6px" }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{callFile?.name || "Upload call recording (optional)"}</p>
              <input ref={fileInputRef} type="file" accept="audio/*,video/mp4" onChange={handleFileSelect} style={{ display: "none" }} />
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
