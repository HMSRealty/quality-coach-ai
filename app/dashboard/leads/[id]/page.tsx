"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, MapPin, DollarSign, User, Calendar, Phone, FileText,
  CheckCircle2, XCircle, Clock, Loader2, Sparkles, Target,
  MessageSquare, TrendingUp, AlertTriangle, RefreshCw, Upload, Download,
} from "lucide-react";

const NAVY = "#0A1E3F";
const TEAL = "#0DAFAF";
const GOLD = "#C8A24B";
const SLATE = "#475569";

interface Lead {
  id: string;
  status: string;
  user_id: string;
  caller_id: string | null;
  extracted_address: string | null;
  asking_price: number | null;
  agent_name: string | null;
  created_at: string;
  qualification_reason: string | null;
  ai_feedback: string | null;
  ai_coaching_points: string[] | null;
  ai_status_reason: string | null;
  ai_model: string | null;
  ai_processed_at: string | null;
  bant_budget: string | null;
  bant_authority: string | null;
  bant_need: string | null;
  bant_timeline: string | null;
  call_recording_url: string | null;
  rejection_reason: string | null;
  audio_duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  campaigns?: { name: string } | null;
}

interface ExtractedItem {
  id?: string; label?: string; status?: string;
  question_asked?: string; seller_answer?: string;
  start_time?: string; end_time?: string; is_deal_breaker?: boolean;
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; icon: typeof CheckCircle2 }> = {
  Hot:          { bg: "#FEF2F2", color: "#DC2626", icon: CheckCircle2 },
  Warm:         { bg: "#FFF7ED", color: "#EA580C", icon: CheckCircle2 },
  Cold:         { bg: "#F0F9FF", color: "#0284C7", icon: CheckCircle2 },
  Disqualified: { bg: "#F1F4F9", color: "#475569", icon: XCircle },
  "Call Back":  { bg: "#FFFBEB", color: "#92400E", icon: Phone },
  Processing:   { bg: "#F1F4F9", color: "#475569", icon: Clock },
  Duplicate:    { bg: "#FAF4E4", color: "#92400E", icon: AlertTriangle },
  Commercial:   { bg: "#F5F3FF", color: "#7C3AED", icon: AlertTriangle },
  Error:        { bg: "#FEF2F2", color: "#DC2626", icon: AlertTriangle },
};

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*, campaigns(name)")
      .eq("id", id)
      .maybeSingle();
    setLead(data as Lead | null);
    setLoading(false);
  };

  const reanalyze = async () => {
    setReanalyzing(true);
    await fetch("/api/leads/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id }),
    });
    await load();
    setReanalyzing(false);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lead) return;
    if (file.size > 500 * 1024 * 1024) return alert("Max 500MB");

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${lead.user_id}/${lead.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("call-uploads").upload(path, file);
    if (upErr) { alert("Upload failed: " + upErr.message); setUploading(false); return; }

    const { data: pub } = supabase.storage.from("call-uploads").getPublicUrl(path);
    const audioUrl = pub.publicUrl;

    await supabase.from("call_uploads").insert({
      lead_id: lead.id, user_id: lead.user_id,
      file_name: file.name, file_path: path,
      file_size_bytes: file.size, storage_url: audioUrl, status: "uploaded",
    });
    await supabase.from("leads").update({
      call_recording_url: audioUrl,
      audio_size_bytes: file.size,
      status: "Processing",
    }).eq("id", lead.id);

    await fetch("/api/leads/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, audioUrl }),
    });
    await load();
    setUploading(false);
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <Loader2 size={28} className="animate-spin" style={{ color: NAVY, margin: "0 auto" }} />
    </div>
  );

  if (!lead) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <p style={{ color: SLATE }}>Lead not found.</p>
    </div>
  );

  const status = STATUS_CONFIG[lead.status] || STATUS_CONFIG.Processing;
  const StatusIcon = status.icon;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <button onClick={() => router.back()} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 0", background: "none", border: "none",
        color: SLATE, fontSize: 13, fontWeight: 600, cursor: "pointer",
        alignSelf: "flex-start",
      }}>
        <ArrowLeft size={14} /> Back
      </button>

      {/* Header */}
      <div style={{
        padding: 28, borderRadius: 18,
        background: `linear-gradient(135deg, ${NAVY} 0%, #142850 100%)`,
        color: "#fff", boxShadow: "0 12px 40px rgba(10,30,63,0.30)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: "0.12em", marginBottom: 8 }}>LEAD #{lead.id.slice(0, 8)}</p>
            <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em" }}>
              {lead.extracted_address || "Unknown address"}
            </h1>
            {lead.campaigns?.name && (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
                Campaign: <strong style={{ color: GOLD }}>{lead.campaigns.name}</strong>
              </p>
            )}
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 999,
            background: status.bg, color: status.color,
            fontSize: 13, fontWeight: 800,
          }}>
            <StatusIcon size={15} /> {lead.status}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginTop: 14 }}>
          <HeaderStat icon={DollarSign} label="Asking Price" value={lead.asking_price ? `$${lead.asking_price.toLocaleString()}` : "—"} />
          <HeaderStat icon={User} label="Agent" value={lead.agent_name || "—"} />
          <HeaderStat icon={Calendar} label="Submitted" value={new Date(lead.created_at).toLocaleDateString()} />
          <HeaderStat icon={Sparkles} label="Reviewed" value={lead.ai_processed_at ? new Date(lead.ai_processed_at).toLocaleDateString() : "Pending"} />
        </div>
      </div>

      {(lead.ai_status_reason || lead.rejection_reason) && (
        <div style={{
          padding: "14px 18px", borderRadius: 12,
          background: `linear-gradient(135deg, ${status.bg} 0%, #FFF 100%)`,
          border: `1px solid ${status.color}40`,
          display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <StatusIcon size={18} color={status.color} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: status.color, marginBottom: 4 }}>
              Why this status?
            </p>
            <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6 }}>
              {lead.ai_status_reason || lead.rejection_reason}
            </p>
          </div>
        </div>
      )}

      {/* ── LEAD FORM ── */}
      {(() => {
        const m = (lead.metadata || {}) as Record<string, unknown>;
        const ms = (k: string) => { const v = m[k]; return v ? String(v) : ""; };
        const rows: Array<[string, string]> = [
          ["Campaign", lead.campaigns?.name || "—"],
          ["Date", ms("date") || new Date(lead.created_at).toLocaleDateString()],
          ["Cold Caller", lead.agent_name || "—"],
          ["Owner Name", ms("owner_name") || "—"],
          ["Phone Number", ms("phone_number") || "—"],
          ["Address", lead.extracted_address || "—"],
          ["Zestimate", ms("zestimate") || "—"],
          ["Asking Price", lead.asking_price ? `$${lead.asking_price.toLocaleString()}` : "—"],
          ["Reason for Selling", ms("reason") || "—"],
        ];
        const zillow = ms("zillow_link");
        return (
          <Section icon={FileText} title="Lead Form" accent={NAVY}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {rows.map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</p>
                  <p style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{value}</p>
                </div>
              ))}
              {zillow && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Zillow Link</p>
                  <a href={zillow} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: TEAL, fontWeight: 600, wordBreak: "break-all" }}>Open ↗</a>
                </div>
              )}
            </div>
            {(() => {
              const extra = (m.additional_properties as Array<{ address?: string; zestimate?: string; asking_price?: string }> | undefined) || [];
              if (!extra.length) return null;
              return (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(10,30,63,0.06)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Additional Properties</p>
                  {extra.map((p, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: NAVY, padding: "6px 0", borderBottom: i < extra.length - 1 ? "1px solid rgba(10,30,63,0.05)" : "none" }}>
                      <strong>{p.address || "—"}</strong>
                      {(p.zestimate || p.asking_price) && (
                        <span style={{ color: SLATE }}> · Zestimate {p.zestimate || "—"} · Asking {p.asking_price ? `$${Number(p.asking_price).toLocaleString()}` : "—"}</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            <p style={{ fontSize: 11, color: SLATE, marginTop: 14, fontStyle: "italic" }}>
              Property condition, repairs, beds/baths, SQFT, occupancy, mortgage, listing status & closing timeline are captured from the call below.
            </p>
          </Section>
        );
      })()}

      {/* ── CALL SUMMARY ── */}
      {(() => {
        const summary = ((lead.metadata || {}) as Record<string, unknown>).call_summary as string | undefined;
        if (!summary) return null;
        return (
          <Section icon={MessageSquare} title="What Happened on the Call" accent="#7C3AED">
            <p style={{ fontSize: 13.5, color: NAVY, lineHeight: 1.8 }}>{summary}</p>
          </Section>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Section icon={MessageSquare} title="Agent Performance Feedback" accent={TEAL}>
          {lead.ai_feedback ? (
            <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.7 }}>{lead.ai_feedback}</p>
          ) : (
            <Empty text="No feedback yet." />
          )}
        </Section>

        <Section icon={FileText} title="Qualification Reasoning" accent={GOLD}>
          {lead.qualification_reason ? (
            <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.7 }}>{lead.qualification_reason}</p>
          ) : (
            <Empty text="Pending analysis." />
          )}
        </Section>
      </div>

      <Section icon={Target} title="Coaching Points" accent={NAVY}>
        {Array.isArray(lead.ai_coaching_points) && lead.ai_coaching_points.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {lead.ai_coaching_points.map((pt, i) => (
              <li key={i} style={{
                padding: "12px 14px", borderRadius: 10,
                background: "#F4F7FB", border: "1px solid rgba(10,30,63,0.06)",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: NAVY, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800,
                }}>{i + 1}</div>
                <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6 }}>{pt}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No coaching points yet." />
        )}
      </Section>

      {(lead.bant_budget || lead.bant_authority || lead.bant_need || lead.bant_timeline) && (
        <Section icon={TrendingUp} title="Qualifiers" accent={TEAL}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <BantBlock label="Budget" value={lead.bant_budget} />
            <BantBlock label="Authority" value={lead.bant_authority} />
            <BantBlock label="Need" value={lead.bant_need} />
            <BantBlock label="Timeline" value={lead.bant_timeline} />
          </div>
        </Section>
      )}

      {/* ── FULL CALL DETAILS (from metadata) ── */}
      {(() => {
        const m = (lead.metadata || {}) as Record<string, unknown>;
        const template = (m.lead_template as string) || "";
        const items = (m.extracted_items as ExtractedItem[]) || [];
        const compliance = (m.compliance_check as string) || "";
        const compliancePassed = m.compliance_passed === true;
        const tone = (m.tone as string) || "";
        const category = (m.lead_category as string) || "";
        const marketValue = (m.spoken_market_value as string) || "";
        const regen = (m.regeneration_steps as string) || "";
        const anyDetails = template || items.length || compliance || tone || category || regen;
        if (!anyDetails) return null;

        return (
          <>
            {/* Lead template */}
            {template && (
              <Section icon={FileText} title="Lead Template (extracted from call)" accent={NAVY}>
                <pre style={{
                  margin: 0, padding: 16, borderRadius: 10, background: "#F4F7FB",
                  border: "1px solid rgba(10,30,63,0.06)", whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-mono)", fontSize: 12.5, color: NAVY, lineHeight: 1.7,
                }}>{template}</pre>
              </Section>
            )}

            {/* Quick facts row */}
            {(tone || category || marketValue) && (
              <Section icon={MessageSquare} title="Call Signals" accent={TEAL}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <BantBlock label="Tone of Voice" value={tone || null} />
                  <BantBlock label="Seller Type" value={category ? category.replace(/_/g, " ").toUpperCase() : null} />
                  <BantBlock label="Market Value (spoken)" value={marketValue && marketValue !== "None" ? marketValue : null} />
                </div>
              </Section>
            )}

            {/* Q&A indicators with timestamps */}
            {items.length > 0 && (
              <Section icon={Target} title={`Extracted Q&A Indicators (${items.length})`} accent={GOLD}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.map((it, i) => (
                    <div key={i} style={{
                      padding: 14, borderRadius: 10,
                      background: it.is_deal_breaker ? "#FEF2F2" : "#F4F7FB",
                      border: `1px solid ${it.is_deal_breaker ? "#FCA5A5" : "rgba(10,30,63,0.06)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: it.is_deal_breaker ? "#DC2626" : NAVY }}>
                          {it.is_deal_breaker ? "⛔ " : "■ "}{it.label || it.id || "Indicator"}
                          {it.status ? ` · ${it.status}` : ""}
                        </span>
                        {(it.start_time || it.end_time) && (
                          <span style={{ fontSize: 11, color: SLATE, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                            [{it.start_time || "N/A"} – {it.end_time || "N/A"}]
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.6, margin: "0 0 4px 0" }}>
                        <strong style={{ color: NAVY }}>Q:</strong> {it.question_asked || "N/A"}
                      </p>
                      <p style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.6, margin: 0 }}>
                        <strong style={{ color: NAVY }}>A:</strong> {it.seller_answer || "N/A"}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Compliance */}
            {compliance && (
              <Section icon={compliancePassed ? CheckCircle2 : XCircle} title="Compliance Check" accent={compliancePassed ? "#059669" : "#DC2626"}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10,
                  padding: "4px 12px", borderRadius: 999,
                  background: compliancePassed ? "#ECFDF5" : "#FEF2F2",
                  color: compliancePassed ? "#059669" : "#DC2626", fontSize: 12, fontWeight: 800,
                }}>
                  {compliancePassed ? "PASSED" : "FAILED"}
                </div>
                <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.7 }}>{compliance}</p>
              </Section>
            )}

            {/* Next steps */}
            {regen && regen !== "No steps generated." && (
              <Section icon={TrendingUp} title="Recommended Next Steps" accent="#7C3AED">
                <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.7 }}>{regen}</p>
              </Section>
            )}
          </>
        );
      })()}

      <Section icon={Phone} title="Call Recording" accent={NAVY}>
        {lead.call_recording_url ? (
          <>
            <audio controls src={lead.call_recording_url} style={{ width: "100%" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              {lead.audio_duration_seconds ? (
                <p style={{ fontSize: 11, color: SLATE }}>
                  Duration: {Math.floor(lead.audio_duration_seconds / 60)}m {lead.audio_duration_seconds % 60}s
                </p>
              ) : <span />}
              <a href={lead.call_recording_url} download target="_blank" rel="noreferrer" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                background: "#F4F7FB", color: NAVY, border: "1px solid rgba(10,30,63,0.10)",
                fontSize: 12, fontWeight: 700, textDecoration: "none",
              }}>
                <Download size={13} /> Download Call
              </a>
            </div>
          </>
        ) : (
          <div style={{
            padding: 20, borderRadius: 10,
            background: "#F4F7FB", border: "2px dashed rgba(10,30,63,0.10)",
            textAlign: "center",
          }}>
            <Upload size={24} color={SLATE} style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 12, color: SLATE, marginBottom: 10 }}>
              No recording on file. Upload one to run the review.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4"
              onChange={handleAudioUpload}
              style={{ display: "none" }}
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 9,
              background: TEAL, color: "#fff", border: "none",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? "Uploading & analyzing..." : "Upload Audio"}
            </button>
          </div>
        )}
      </Section>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={reanalyze} disabled={reanalyzing} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "11px 18px", borderRadius: 10,
          background: NAVY, color: "#fff",
          fontSize: 13, fontWeight: 700, border: "none",
          cursor: reanalyzing ? "wait" : "pointer",
          boxShadow: "0 4px 14px rgba(10,30,63,0.25)",
        }}>
          {reanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Re-run Review
        </button>
      </div>
    </div>
  );
}

function HeaderStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <Icon size={11} color="rgba(255,255,255,0.7)" />
        <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, accent, children }: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#FFFFFF", border: "1px solid rgba(10,30,63,0.08)",
      borderRadius: 14, padding: 22, boxShadow: "0 2px 8px rgba(10,30,63,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${accent}20` }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${accent}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={accent} />
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 12, color: SLATE, fontStyle: "italic" }}>{text}</p>;
}

function BantBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: value ? "#E0F7F7" : "#F4F7FB",
      border: `1px solid ${value ? `${TEAL}30` : "rgba(10,30,63,0.06)"}`,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: value ? TEAL : SLATE, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 12, color: value ? NAVY : SLATE, lineHeight: 1.5 }}>{value || "Not extracted"}</p>
    </div>
  );
}
