"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LeadTimeline } from "@/app/_components/LeadTimeline";
import { GongPlayer } from "@/app/_components/GongPlayer";
import { HandoffBrief } from "@/app/_components/HandoffBrief";
import { DealCalculator } from "@/app/_components/DealCalculator";
import { ExportWebhookButton } from "@/app/_components/ExportWebhookButton";
import { AgentScorecard } from "@/app/_components/AgentScorecard";
import { TranscriptCard } from "@/app/_components/TranscriptCard";
import Link from "next/link";
import {
  ArrowLeft, MapPin, DollarSign, User, Calendar, Phone, FileText,
  CheckCircle2, XCircle, Clock, Loader2, Sparkles, Target,
  MessageSquare, TrendingUp, AlertTriangle, RefreshCw, Upload, Download,
} from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.text1;
const TEAL = T.teal;
const GOLD = T.teal;
const SLATE = T.text2;

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
  transcript: string | null;
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
  Hot:          { bg: "#FBEEE8", color: "#DC2626", icon: CheckCircle2 },
  Warm:         { bg: "#FFF7ED", color: "#EA580C", icon: CheckCircle2 },
  Cold:         { bg: "#F0F9FF", color: "#0284C7", icon: CheckCircle2 },
  Disqualified: { bg: "#F1F4F9", color: "#4B5563", icon: XCircle },
  "Call Back":  { bg: "#FFFBEB", color: "#92400E", icon: Phone },
  Processing:   { bg: "#F1F4F9", color: "#4B5563", icon: Clock },
  Duplicate:    { bg: "#EAF0FF", color: "#92400E", icon: AlertTriangle },
  Commercial:   { bg: "#F5F3FF", color: "#7C3AED", icon: AlertTriangle },
  Error:        { bg: "#FBEEE8", color: "#DC2626", icon: AlertTriangle },
};

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [recordings, setRecordings] = useState<Array<{ id: string; file_name: string | null; storage_url: string | null; file_size_bytes: number | null; created_at: string }>>([]);
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
    // Pull every recording attached to this lead so we can play them all.
    const { data: ups } = await supabase
      .from("call_uploads")
      .select("id, file_name, storage_url, file_size_bytes, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: true });
    setRecordings((ups || []) as typeof recordings);
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
    const files = Array.from(e.target.files || []);
    if (!files.length || !lead) return;
    for (const f of files) if (f.size > 500 * 1024 * 1024) return alert("Each file must be under 500MB");

    setUploading(true);
    // Upload through the server (service role) so it works even when the
    // current user isn't the lead owner — storage RLS would otherwise block it.
    const { data: { session } } = await supabase.auth.getSession();
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const upRes = await fetch(`/api/leads/${lead.id}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: fd,
    });
    const upJson = await upRes.json().catch(() => ({}));
    if (!upRes.ok || !upJson.ok) {
      alert("Upload failed: " + (upJson.error || "unknown"));
      setUploading(false);
      return;
    }
    const uploadedUrls: string[] = upJson.urls || [];

    await fetch("/api/leads/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, audioUrls: uploadedUrls }),
    });
    await load();
    setUploading(false);
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <Loader2 size={28} className="animate-spin" style={{ color: "var(--text-1)", margin: "0 auto" }} />
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
      <Link href="/dashboard/calls" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 0", background: "none", border: "none",
        color: SLATE, fontSize: 12, fontWeight: 700, cursor: "pointer",
        alignSelf: "flex-start", textDecoration: "none",
        textTransform: "uppercase", letterSpacing: "0.05em",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--magenta)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--slate)")}
      >
        <ArrowLeft size={13} /> Call Library
      </Link>

      {/* Header hero — midnight panel with magenta glow */}
      <div style={{
        position: "relative", overflow: "hidden",
        padding: 30, borderRadius: 22,
        background: "linear-gradient(135deg, #0B0F1F 0%, #161C36 100%)",
        color: "#fff", boxShadow: "0 24px 60px rgba(11,15,31,0.45)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ position: "absolute", top: -120, right: -60, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(242,38,111,0.22), transparent 70%)", filter: "blur(12px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", marginBottom: 8, background: T.gradPrimary, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>LEAD #{lead.id.slice(0, 8)}</p>
            <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {lead.extracted_address || "Unknown address"}
            </h1>
            {lead.campaigns?.name && (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
                Campaign: <strong style={{ color: "#FF4F92" }}>{lead.campaigns.name}</strong>
              </p>
            )}
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 999,
            background: status.bg, color: status.color,
            fontSize: 14, fontWeight: 800,
            boxShadow: `0 8px 24px ${status.color}33`,
          }}>
            <StatusIcon size={16} /> {lead.status}
          </div>
        </div>

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
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
            <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6 }}>
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
                  <p style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>{value}</p>
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
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(35,43,58,0.06)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Additional Properties</p>
                  {extra.map((p, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: "var(--text-1)", padding: "6px 0", borderBottom: i < extra.length - 1 ? "1px solid rgba(35,43,58,0.05)" : "none" }}>
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
            <p style={{ fontSize: 13.5, color: "var(--text-1)", lineHeight: 1.8 }}>{summary}</p>
          </Section>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Section icon={MessageSquare} title="Agent Performance Feedback" accent={TEAL}>
          {lead.ai_feedback ? (
            <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.7 }}>{lead.ai_feedback}</p>
          ) : (
            <Empty text="No feedback yet." />
          )}
        </Section>

        <Section icon={FileText} title="Qualification Reasoning" accent={GOLD}>
          {lead.qualification_reason ? (
            <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.7 }}>{lead.qualification_reason}</p>
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
                background: "#F2F5F9", border: "1px solid rgba(35,43,58,0.06)",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: T.midnight, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800,
                }}>{i + 1}</div>
                <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6 }}>{pt}</p>
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
                  margin: 0, padding: 16, borderRadius: 10, background: "#F2F5F9",
                  border: "1px solid rgba(35,43,58,0.06)", whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-1)", lineHeight: 1.7,
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
                      background: it.is_deal_breaker ? "#FBEEE8" : "#F2F5F9",
                      border: `1px solid ${it.is_deal_breaker ? "#E7B8A6" : "rgba(35,43,58,0.06)"}`,
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
                        <strong style={{ color: "var(--text-1)" }}>Q:</strong> {it.question_asked || "N/A"}
                      </p>
                      <p style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.6, margin: 0 }}>
                        <strong style={{ color: "var(--text-1)" }}>A:</strong> {it.seller_answer || "N/A"}
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
                  background: compliancePassed ? "#ECFDF5" : "#FBEEE8",
                  color: compliancePassed ? "#059669" : "#DC2626", fontSize: 12, fontWeight: 800,
                }}>
                  {compliancePassed ? "PASSED" : "FAILED"}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.7 }}>{compliance}</p>
              </Section>
            )}

            {/* Next steps */}
            {regen && regen !== "No steps generated." && (
              <Section icon={TrendingUp} title="Recommended Next Steps" accent="#7C3AED">
                <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.7 }}>{regen}</p>
              </Section>
            )}
          </>
        );
      })()}

      <Section icon={Phone} title={`Call Recordings${recordings.length > 1 ? ` (${recordings.length})` : ""}`} accent={NAVY}>
        {recordings.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {recordings.map((rec, i) => (
              <GongPlayer key={rec.id}
                recordingId={rec.id}
                src={rec.storage_url || undefined}
                leadId={lead.id}
                title={`Recording ${i + 1}${rec.file_name ? " · " + rec.file_name : ""}`}
              />
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-ghost" style={{ fontSize: 12 }}>
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {uploading ? "Uploading…" : "Add another recording"}
              </button>
              <input ref={fileInputRef} type="file" multiple accept="audio/*,video/mp4" onChange={handleAudioUpload} style={{ display: "none" }} />
            </div>
          </div>
        ) : lead.call_recording_url ? (
          <GongPlayer src={lead.call_recording_url} downloadUrl={lead.call_recording_url} leadId={lead.id} title="Call Recording" />
        ) : (
          <div style={{
            padding: 20, borderRadius: 10,
            background: "#F2F5F9", border: "2px dashed rgba(35,43,58,0.10)",
            textAlign: "center",
          }}>
            <Upload size={24} color={SLATE} style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 12, color: SLATE, marginBottom: 10 }}>
              No recording on file. Upload one to run the review.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
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
              {uploading ? "Uploading & analyzing..." : "Upload Recordings (multiple OK)"}
            </button>
          </div>
        )}
      </Section>

      {/* Handoff brief / Deal calculator — read from metadata extracted by the AI */}
      {(() => {
        const md = (lead.metadata || {}) as Record<string, unknown>;
        const zillow = (md.zillow_data as { zestimate?: number } | undefined) || {};
        const arvNum = Number(md.arv) || Number(zillow.zestimate) || 0;
        const repairs = Array.isArray(md.repairs_mentioned) ? (md.repairs_mentioned as string[]) : [];
        const rehab = Number(md.rehab_cost_estimate) || 0;
        const owner = String(md.owner_name ?? "") || null;
        return (
          <>
            <TranscriptCard transcript={lead.transcript} />
            <HandoffBrief
              personality={(md.seller_personality as string) ?? null}
              painPoint={(md.seller_pain_point as string) ?? null}
              bottomLine={(md.seller_bottom_line as string) ?? null}
            />
            <DealCalculator
              leadId={lead.id}
              ownerName={owner}
              propertyAddress={lead.extracted_address}
              arv={arvNum}
              defaultRehab={rehab}
              repairsMentioned={repairs}
            />
            <AgentScorecard agentName={lead.agent_name} />
          </>
        );
      })()}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={reanalyze} disabled={reanalyzing} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "11px 18px", borderRadius: 10,
          background: T.midnight, color: "#fff",
          fontSize: 13, fontWeight: 700, border: "none",
          cursor: reanalyzing ? "wait" : "pointer",
          boxShadow: "0 4px 14px rgba(35,43,58,0.25)",
        }}>
          {reanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Re-run Review
        </button>
        <ExportWebhookButton leadId={lead.id} />
      </div>

      <LeadTimeline leadId={lead.id} />
    </div>
  );
}

function HeaderStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <Icon size={11} color="#FF4F92" />
        <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      </div>
      <p style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, accent, children }: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface-1)", border: "1px solid var(--border-2)",
      borderRadius: 18, padding: 22, boxShadow: "var(--shadow-md)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${accent}20` }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${accent}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={accent} />
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>{title}</h3>
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
      background: value ? "#E8EFFF" : "#F2F5F9",
      border: `1px solid ${value ? `${TEAL}30` : "rgba(35,43,58,0.06)"}`,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: value ? TEAL : SLATE, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 12, color: value ? NAVY : SLATE, lineHeight: 1.5 }}>{value || "Not extracted"}</p>
    </div>
  );
}
