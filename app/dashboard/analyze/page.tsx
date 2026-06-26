"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import {
  UploadCloud, FileAudio, Loader2, CheckCircle2,
  AlertCircle, Zap, ArrowRight, FolderCog, RefreshCcw,
  PhoneCall,
} from "lucide-react";
import Link from "next/link";

interface Campaign { id: string; name: string; custom_rules: string; }
interface Result {
  status: string;
  address: string | null;
  price: number | null;
  reason: string | null;
  leadId: string;
}

export default function AnalyzePage() {
  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [selected, setSelected]       = useState("");
  const [file, setFile]               = useState<File | null>(null);
  const [dragging, setDragging]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [loadingCamps, setLoadingC]   = useState(true);
  const [result, setResult]           = useState<Result | null>(null);
  const [error, setError]             = useState("");
  const [step, setStep]               = useState<"idle" | "uploading" | "analyzing" | "saving">("idle");

  const STEPS: Record<string, string> = {
    uploading: "Uploading audio to Gemini...",
    analyzing: "AI analyzing call content...",
    saving:    "Saving results to database...",
  };

  useEffect(() => {
    (async () => {
      setLoadingC(true);
      const { data } = await supabase.from("campaigns").select("id, name, custom_rules").eq("is_active", true);
      if (data) { setCampaigns(data as Campaign[]); if (data.length > 0) setSelected(data[0].id); }
      setLoadingC(false);
    })();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("audio/")) { setFile(f); setError(""); setResult(null); }
    else setError("Please drop an audio file (MP3, WAV, M4A).");
  }, []);

  const analyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) { setError("Please select a campaign."); return; }
    if (!file)     { setError("Please upload an audio file."); return; }

    setLoading(true); setError(""); setResult(null); setStep("uploading");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated. Please sign in.");

      const form = new FormData();
      form.append("campaignId", selected);
      form.append("file", file);

      setStep("analyzing");

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });

      setStep("saving");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analysis failed");

      setResult({
        status: json.lead.status,
        address: json.lead.extracted_address,
        price: json.lead.asking_price,
        reason: json.lead.qualification_reason,
        leadId: json.lead.id,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    }

    setLoading(false);
    setStep("idle");
  };

  const reset = () => { setResult(null); setFile(null); setError(""); };

  const isQualified = result?.status === "Qualified" || result?.status === "Warm";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 4 }}>New Analysis</h1>
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>
          Upload a call recording and get instant AI-powered quality scoring.
        </p>
      </div>

      {/* Result card */}
      {result && (
        <div style={{
          padding: "22px 24px", borderRadius: "var(--r-xl)",
          background: isQualified ? "var(--emerald-dim)" : "var(--rose-dim)",
          border: `1px solid ${isQualified ? "rgba(59,130,246,0.25)" : "rgba(244,63,94,0.25)"}`,
          animation: "fadeIn var(--t-slow) var(--ease-out)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: isQualified ? "rgba(59,130,246,0.2)" : "rgba(244,63,94,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isQualified
                  ? <CheckCircle2 size={20} color="var(--emerald)" />
                  : <AlertCircle size={20} color="var(--rose-lt)" />
                }
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>
                  Lead {result.status}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>
                  {isQualified ? "This call meets your campaign criteria." : "This call does not meet your campaign criteria."}
                </p>
              </div>
            </div>
            <button onClick={reset} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: "var(--r-md)",
              background: "var(--surface-3)", border: "1px solid var(--border-2)",
              color: "var(--text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              <RefreshCcw size={12} /> New Analysis
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              ["Extracted Address", result.address ?? "Not identified"],
              ["Asking Price", result.price ? `$${result.price.toLocaleString()}` : "Not stated"],
            ].map(([k, v]) => (
              <div key={k} style={{
                padding: "12px 14px", borderRadius: "var(--r-md)",
                background: "var(--surface-2)", border: "1px solid var(--border-2)",
              }}>
                <p style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>{k}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{v}</p>
              </div>
            ))}
          </div>

          {result.reason && (
            <div style={{
              padding: "12px 14px", borderRadius: "var(--r-md)",
              background: "var(--surface-2)", border: "1px solid var(--border-2)",
            }}>
              <p style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 6 }}>
                AI Reasoning
              </p>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65 }}>{result.reason}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Link href="/dashboard/calls" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: "var(--r-md)",
              background: "var(--surface-2)", border: "1px solid var(--border-2)",
              color: "var(--text-2)", fontSize: 12, fontWeight: 600, textDecoration: "none",
            }}>
              <PhoneCall size={12} /> View in Call Library
            </Link>
          </div>
        </div>
      )}

      {/* Analysis form */}
      {!result && (
        <form onSubmit={analyze} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Campaign selector */}
          <Card style={{ padding: "20px 22px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 14 }}>
              Step 1 · Select Campaign
            </p>

            {loadingCamps ? (
              <div style={{ height: 44, borderRadius: "var(--r-md)" }} className="skeleton" />
            ) : campaigns.length === 0 ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: "var(--r-md)",
                background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.2)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AlertCircle size={16} style={{ color: "var(--amber)", flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: "var(--amber-lt)" }}>
                    No active campaigns. Create and activate one first.
                  </p>
                </div>
                <Link href="/dashboard/campaigns" style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "7px 12px", borderRadius: "var(--r-md)",
                  background: "var(--amber)", color: "#15131D",
                  fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
                }}>
                  <FolderCog size={12} /> Create Campaign <ArrowRight size={11} />
                </Link>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {campaigns.map(c => (
                  <label key={c.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "14px 16px", borderRadius: "var(--r-md)", cursor: "pointer",
                    background: selected === c.id ? "var(--brand-dim)" : "var(--surface-3)",
                    border: `1px solid ${selected === c.id ? "var(--border-brand)" : "var(--border-2)"}`,
                    transition: "all var(--t-fast)",
                  }}>
                    <input
                      type="radio"
                      name="campaign"
                      value={c.id}
                      checked={selected === c.id}
                      onChange={() => setSelected(c.id)}
                      style={{ marginTop: 2, accentColor: "var(--brand-500)" }}
                    />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: selected === c.id ? "var(--brand-300)" : "var(--text-1)", marginBottom: 3 }}>
                        {c.name}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
                        {c.custom_rules.split("\n")[0].trim().replace(/^[-·•]\s*/, "")}
                        {c.custom_rules.split("\n").filter(l => l.trim()).length > 1 && " ..."}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Card>

          {/* File upload */}
          <Card style={{ padding: "20px 22px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 14 }}>
              Step 2 · Upload Call Recording
            </p>

            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 12, padding: "40px 24px",
                borderRadius: "var(--r-lg)", cursor: "pointer",
                border: `2px dashed ${dragging ? "var(--brand-400)" : file ? "rgba(59,130,246,0.4)" : "var(--border-3)"}`,
                background: dragging ? "var(--brand-dim)" : file ? "var(--emerald-dim)" : "var(--surface-3)",
                transition: "all var(--t-base) var(--ease-out)",
              }}
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
            >
              <input
                type="file"
                accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a,audio/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(""); setResult(null); } }}
                style={{ display: "none" }}
              />

              {file ? (
                <>
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%",
                    background: "var(--emerald-dim)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <FileAudio size={24} color="var(--emerald)" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--emerald)" }}>{file.name}</p>
                    <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%",
                    background: "var(--surface-4)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <UploadCloud size={24} color="var(--text-3)" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: dragging ? "var(--brand-300)" : "var(--text-2)" }}>
                      {dragging ? "Drop it here" : "Drop audio file or click to browse"}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                      MP3, WAV, M4A supported · No size limit
                    </p>
                  </div>
                </>
              )}
            </label>
          </Card>

          {/* Error */}
          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", borderRadius: "var(--r-md)",
              background: "var(--rose-dim)", border: "1px solid rgba(244,63,94,0.25)",
              fontSize: 13, color: "var(--rose-lt)",
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || campaigns.length === 0}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "14px 24px", borderRadius: "var(--r-md)",
              background: loading ? "var(--brand-dim)" : "var(--brand-500)",
              color: loading ? "var(--brand-400)" : "#fff",
              fontSize: 15, fontWeight: 700, border: "none",
              cursor: loading || campaigns.length === 0 ? "not-allowed" : "pointer",
              opacity: campaigns.length === 0 ? 0.5 : 1,
              boxShadow: loading || campaigns.length === 0 ? "none" : "0 4px 16px var(--brand-glow)",
              transition: "all var(--t-base) var(--ease-out)",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {STEPS[step] ?? "Processing..."}
              </>
            ) : (
              <>
                <Zap size={16} />
                Run AI Analysis
                <ArrowRight size={15} />
              </>
            )}
          </button>

          {loading && (
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-3)", marginTop: -8 }}>
              This usually takes 15–45 seconds depending on call length.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
