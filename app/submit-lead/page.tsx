"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Send, Loader2, CheckCircle2, AlertCircle, Upload } from "lucide-react";

const NAVY = "var(--text-1)";
const TEAL = "#3B82F6";
const SLATE = "var(--text-2)";

interface Caller { id: string; name: string; team_id?: string; }
interface Campaign { id: string; name: string; }

// ─────────────────────────────────────────────────────────────
// IMPORTANT: All sub-components are defined at MODULE scope.
// Defining them inside the page component makes React see a
// brand-new component type on every render, which unmounts and
// remounts the subtree — causing inputs to lose focus on each
// keystroke. Keep them out here.
// ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  background: "#101018", border: "1px solid rgba(255,255,255,0.10)",
  fontSize: 13, color: NAVY, outline: "none",
  transition: "all 200ms cubic-bezier(0.16,1,0.30,1)",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 6,
};

function Card({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div style={{
      background: "#0A0A0E", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14,
      padding: "22px", marginBottom: 18,
      boxShadow: "0 2px 8px rgba(35,43,58,0.04)",
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 16 }}>{title}</h3>
      {children}
    </div>
  );
}

export default function PublicSubmitLeadPage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [allowCallUploads, setAllowCallUploads] = useState(false);
  const [callers, setCallers] = useState<Caller[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [callFile, setCallFile] = useState<File | null>(null);

  const [formData, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    caller_id: "",
    campaign_id: "",
    cc_name: "",
    owner_name: "",
    phone_number: "",
    property_address: "",
    asking_price: "",
    zestimate: "",
    zillow_link: "",
    occupancy: "",
    condition_year_ownership: "",
    repairs: "",
    beds_baths: "",
    sqft: "",
    property_type: "",
    listed: "",
    mortgage: "",
    closing: "",
    reason: "",
    call_back_time: "",
    team_name: "",
  });

  useEffect(() => {
    (async () => {
      const { data: callersData } = await supabase
        .from("cold_callers")
        .select("id, name, team_id")
        .order("name");

      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name")
        .order("name");

      if (callersData) setCallers(callersData);
      if (campaignsData) setCampaigns(campaignsData);

      const { data: adminData } = await supabase
        .from("profiles")
        .select("allow_call_uploads")
        .eq("role", "admin")
        .limit(1)
        .single();

      setAllowCallUploads(adminData?.allow_call_uploads || false);
    })();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) {
      setError("File size must be less than 500MB");
      return;
    }
    const validTypes = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "video/mp4"];
    if (!validTypes.includes(file.type)) {
      setError("Only audio and video files supported");
      return;
    }
    setCallFile(file);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const { data: adminData } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .limit(1)
        .single();

      const userId = adminData?.id;
      if (!userId) throw new Error("Unable to process submission");

      const selectedCaller = callers.find(c => c.id === formData.caller_id);

      const leadData: Record<string, unknown> = {
        user_id: userId,
        campaign_id: formData.campaign_id || null,
        extracted_address: formData.property_address,
        asking_price: formData.asking_price ? parseFloat(formData.asking_price) : null,
        status: "Processing",
      };

      const { data: leadResult, error: insertError } = await supabase
        .from("leads")
        .insert(leadData)
        .select("id")
        .single();

      if (insertError) throw insertError;

      if (callFile && allowCallUploads && leadResult) {
        const fileExt = callFile.name.split(".").pop();
        const filePath = `${userId}/${leadResult.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("call-uploads")
          .upload(filePath, callFile);

        if (!uploadError) {
          const { data: publicUrl } = supabase.storage
            .from("call-uploads")
            .getPublicUrl(filePath);

          await supabase.from("call_uploads").insert({
            lead_id: leadResult.id,
            user_id: userId,
            file_name: callFile.name,
            file_path: filePath,
            file_size_bytes: callFile.size,
            status: "uploaded",
            storage_url: publicUrl.publicUrl,
          });
        }
      }

      setSuccess(true);
      setForm({
        ...formData,
        cc_name: "", owner_name: "", phone_number: "", property_address: "",
        asking_price: "", zestimate: "", zillow_link: "", occupancy: "",
        condition_year_ownership: "", repairs: "", beds_baths: "", sqft: "",
        property_type: "", listed: "", mortgage: "", closing: "",
        reason: "", call_back_time: "", team_name: "",
      });
      setCallFile(null);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    }
    setSubmitting(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(180deg, #101018 0%, #000000 100%)`,
      padding: "40px 24px",
    }} className="animate-in">
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Logo + Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <img src="/ascendya-mark.svg" alt="Ascendyaa" style={{ height: 40, width: "auto", display: "block" }} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1, textAlign: "left" }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: NAVY, letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}>RealTrack</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", marginTop: 5, background: "linear-gradient(120deg,#6B3FA0,#3B82F6)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>by Ascendyaa</span>
            </span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, marginBottom: 10, letterSpacing: "-0.02em" }}>
            Submit a Lead
          </h1>
          <p style={{ fontSize: 14, color: SLATE, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
            Submit property details below. Our system will process and route the lead automatically.
          </p>
        </div>

        {success && (
          <div style={{
            padding: "14px 18px", borderRadius: 12, marginBottom: 18,
            background: "rgba(52,211,153,0.12)", border: "1px solid #A7F3D0",
            display: "flex", alignItems: "center", gap: 10,
            color: "#2563EB", fontSize: 13, fontWeight: 600,
          }}>
            <CheckCircle2 size={16} /> Lead submitted! Processing has started.
          </div>
        )}
        {error && (
          <div style={{
            padding: "14px 18px", borderRadius: 12, marginBottom: 18,
            background: "rgba(251,113,133,0.12)", border: "1px solid #E7B8A6",
            display: "flex", alignItems: "center", gap: 10,
            color: "#DC2626", fontSize: 13, fontWeight: 600,
          }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Routing */}
          <Card title="Submission Details">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Cold Caller *</label>
                <select
                  value={formData.caller_id}
                  onChange={e => setForm({ ...formData, caller_id: e.target.value })}
                  required
                  style={inputStyle}
                >
                  <option value="">Select a caller...</option>
                  {callers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Campaign *</label>
                <select
                  value={formData.campaign_id}
                  onChange={e => setForm({ ...formData, campaign_id: e.target.value })}
                  required
                  style={inputStyle}
                >
                  <option value="">Select a campaign...</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Call Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setForm({ ...formData, date: e.target.value })}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Team Name</label>
                <input
                  type="text"
                  value={formData.team_name}
                  onChange={e => setForm({ ...formData, team_name: e.target.value })}
                  placeholder="Optional"
                  style={inputStyle}
                />
              </div>
            </div>
            {callers.length === 0 && (
              <div style={{
                marginTop: 12, padding: "10px 12px", borderRadius: 8,
                background: "rgba(245,158,11,0.12)", border: "1px solid #FCD34D",
                fontSize: 12, color: "#92400E",
              }}>
                ⚠ No cold callers configured yet. Admins must upload a team CSV first.
              </div>
            )}
          </Card>

          {/* Owner / Property */}
          <Card title="Lead Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Owner Name</label>
                <input type="text" value={formData.owner_name} onChange={e => setForm({ ...formData, owner_name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input type="tel" value={formData.phone_number} onChange={e => setForm({ ...formData, phone_number: e.target.value })} placeholder="+1 (555) 000-0000" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Property Address *</label>
              <input type="text" value={formData.property_address} onChange={e => setForm({ ...formData, property_address: e.target.value })} placeholder="123 Main St, City, ST" required style={inputStyle} />
            </div>
          </Card>

          {/* Property */}
          <Card title="Property Details">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <input type="number" placeholder="Asking Price" value={formData.asking_price} onChange={e => setForm({ ...formData, asking_price: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="Zestimate" value={formData.zestimate} onChange={e => setForm({ ...formData, zestimate: e.target.value })} style={inputStyle} />
              <input type="url" placeholder="Zillow Link" value={formData.zillow_link} onChange={e => setForm({ ...formData, zillow_link: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <input type="text" placeholder="Occupancy?" value={formData.occupancy} onChange={e => setForm({ ...formData, occupancy: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="Condition & Year Built?" value={formData.condition_year_ownership} onChange={e => setForm({ ...formData, condition_year_ownership: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="Repairs Needed?" value={formData.repairs} onChange={e => setForm({ ...formData, repairs: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="Beds & Baths?" value={formData.beds_baths} onChange={e => setForm({ ...formData, beds_baths: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="SQFT?" value={formData.sqft} onChange={e => setForm({ ...formData, sqft: e.target.value })} style={inputStyle} />
              <input type="text" placeholder="Property Type?" value={formData.property_type} onChange={e => setForm({ ...formData, property_type: e.target.value })} style={inputStyle} />
            </div>
          </Card>

          {/* Call Upload (conditional) */}
          {allowCallUploads && (
            <Card title="Call Recording (Optional)">
              <p style={{ fontSize: 12, color: SLATE, marginBottom: 12 }}>
                Upload an audio or video recording. Max 500MB.
              </p>
              <div
                style={{
                  padding: "24px", borderRadius: 12,
                  border: `2px dashed ${TEAL}40`, background: "rgba(59,130,246,0.08)",
                  textAlign: "center", cursor: "pointer",
                  transition: "all 200ms",
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "rgba(59,130,246,0.12)"; }}
                onDragLeave={e => { e.currentTarget.style.background = "rgba(59,130,246,0.08)"; }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.style.background = "rgba(59,130,246,0.08)";
                  if (fileInputRef.current && e.dataTransfer.files[0]) {
                    fileInputRef.current.files = e.dataTransfer.files;
                    handleFileSelect(e as unknown as React.ChangeEvent<HTMLInputElement>);
                  }
                }}
              >
                <Upload size={26} style={{ margin: "0 auto 8px", color: TEAL }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 4 }}>
                  {callFile ? callFile.name : "Drop file or click to browse"}
                </p>
                <p style={{ fontSize: 11, color: SLATE }}>MP3, WAV, OGG, MP4 • Max 500MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,video/mp4"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
              </div>
              {callFile && (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(52,211,153,0.12)", borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>
                    ✓ Ready: {(callFile.size / (1024 * 1024)).toFixed(1)}MB
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Notes */}
          <Card title="Additional Notes">
            <textarea
              value={formData.reason}
              onChange={e => setForm({ ...formData, reason: e.target.value })}
              placeholder="Reason for selling, motivation, urgency, follow-up timing..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-sans)" }}
            />
          </Card>

          {/* Submit */}
          <button type="submit" disabled={submitting} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "16px 28px", borderRadius: 12,
            background: submitting ? "#E5E9F0" : NAVY,
            color: submitting ? SLATE : "#fff",
            fontSize: 15, fontWeight: 800, border: "none", cursor: "pointer",
            boxShadow: submitting ? "none" : `0 8px 24px rgba(35,43,58,0.30)`,
            transition: "all 240ms cubic-bezier(0.16,1,0.30,1)",
          }}
          onMouseEnter={e => { if (!submitting) e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { if (!submitting) e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><Send size={16} /> Submit Lead</>}
          </button>

          <p style={{ textAlign: "center", fontSize: 11, color: SLATE, marginTop: 20 }}>
            Powered by <strong style={{ color: NAVY }}>RealTrack</strong> • Secure submission
          </p>
        </form>
      </div>
    </div>
  );
}
