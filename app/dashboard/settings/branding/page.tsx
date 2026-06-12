"use client";

export const runtime = "edge";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Palette, Upload, Loader2, CheckCircle2, X, ImageIcon, Save } from "lucide-react";

const NAVY = "#0F172A";
const SLATE = "#475569";
const SKY_600 = "#0284C7";
const MONEY = "#059669";

const PRESET_COLORS = ["#0EA5E9", "#0284C7", "#7C3AED", "#EC4899", "#F59E0B", "#10B981", "#EF4444", "#0F172A"];

export default function BrandingPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#0284C7");
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      const id = profile?.organization_id as string | undefined;
      if (!id) { setLoading(false); return; }
      setOrgId(id);
      const { data: org } = await supabase.from("organizations").select("brand_name, brand_logo_url, brand_color").eq("id", id).maybeSingle();
      if (org) {
        setBrandName((org.brand_name as string) || "");
        setBrandColor((org.brand_color as string) || "#0284C7");
        setBrandLogoUrl((org.brand_logo_url as string) || null);
      }
      setLoading(false);
    })();
  }, []);

  const uploadLogo = async (file: File) => {
    if (!userId) return;
    setSaving(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `org/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("brand-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { alert(error.message); setSaving(false); return; }
    const { data: pub } = supabase.storage.from("brand-logos").getPublicUrl(path);
    setBrandLogoUrl(pub.publicUrl);
    setSaving(false);
  };

  const removeLogo = () => setBrandLogoUrl(null);

  // Save through the server route so the write isn't silently RLS-blocked.
  const persist = async (payload: { brand_name?: string | null; brand_logo_url?: string | null; brand_color?: string | null }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/branding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Save failed");
  };

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      await persist({
        brand_name: brandName.trim() || null,
        brand_logo_url: brandLogoUrl,
        brand_color: brandColor,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      alert(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("Reset all branding to RealTrack defaults?")) return;
    if (!orgId) return;
    try {
      await persist({ brand_name: null, brand_logo_url: null, brand_color: null });
    } catch (e: any) {
      alert(e?.message || "Reset failed");
      return;
    }
    setBrandName("");
    setBrandLogoUrl(null);
    setBrandColor("#0284C7");
    setTimeout(() => window.location.reload(), 200);
  };

  const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--border-2)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow-sm)" };
  const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff", color: NAVY, fontSize: 14, outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: SLATE, marginBottom: 7, display: "block" };

  if (loading) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: SKY_600 }} />
    </div>
  );

  if (!orgId) return (
    <div style={{ padding: 40, textAlign: "center", color: SLATE }}>
      <p style={{ fontSize: 14 }}>No organization linked to your account. Contact <a href="mailto:info@realtrack.app" style={{ color: SKY_600, fontWeight: 700 }}>info@realtrack.app</a>.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
          <Palette size={26} color={SKY_600} /> Branding
        </h1>
        <p style={{ fontSize: 14, color: SLATE, marginTop: 4 }}>
          Customize how RealTrack looks for your team. Logo and color apply to your dashboard and sub-user dashboards.
        </p>
      </div>

      {/* Live preview */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-1)", background: "var(--surface-3)", fontSize: 11, fontWeight: 700, color: SLATE, letterSpacing: "0.04em", textTransform: "uppercase" }}>Live Preview</div>
        <div style={{ padding: 22, display: "flex", alignItems: "center", gap: 14, background: "#fff" }}>
          {brandLogoUrl ? (
            <img src={brandLogoUrl} alt="" style={{ height: 36, maxWidth: 180, objectFit: "contain" }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <svg width={30} height={20} viewBox="0 0 40 24" fill="none">
                <path d="M2 22 L20 4 L38 22" stroke={NAVY} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 22 L20 11 L32 22" stroke={brandColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{brandName || "RealTrack"}</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${brandColor}dd, ${brandColor})`, color: "#fff", fontSize: 13, fontWeight: 800 }}>
            Sample button
          </button>
        </div>
      </div>

      {/* Workspace name */}
      <div style={card}>
        <label style={lbl}>Workspace name</label>
        <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Your company name (defaults to RealTrack)" style={inp} maxLength={40} />
        <p style={{ fontSize: 11.5, color: SLATE, marginTop: 6 }}>Shown next to the logo in the dashboard. Leave blank to use RealTrack.</p>
      </div>

      {/* Logo upload */}
      <div style={card}>
        <label style={lbl}>Logo</label>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{
            width: 100, height: 60, borderRadius: 10,
            background: "var(--surface-3)", border: "1px dashed var(--border-3)",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            flexShrink: 0,
          }}>
            {brandLogoUrl ? <img src={brandLogoUrl} alt="" style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} /> : <ImageIcon size={22} color="var(--text-3)" />}
          </div>
          <div style={{ flex: 1 }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => fileRef.current?.click()} disabled={saving} style={{
                padding: "9px 14px", borderRadius: 9, border: "1px solid var(--border-2)",
                background: "#fff", color: NAVY, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {brandLogoUrl ? "Replace logo" : "Upload logo"}
              </button>
              {brandLogoUrl && (
                <button onClick={removeLogo} style={{
                  padding: "9px 14px", borderRadius: 9, border: "1px solid #FECACA",
                  background: "#FEF2F2", color: "#DC2626", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <X size={12} /> Remove
                </button>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: SLATE, marginTop: 6 }}>PNG, JPG, or SVG. Transparent background recommended. Max 2 MB.</p>
          </div>
        </div>
      </div>

      {/* Accent color */}
      <div style={card}>
        <label style={lbl}>Accent color</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} style={{ width: 50, height: 44, borderRadius: 10, border: "1px solid var(--border-2)", cursor: "pointer", background: "none" }} />
          <input value={brandColor} onChange={e => setBrandColor(e.target.value)} style={{ ...inp, width: 130, fontFamily: "var(--font-mono)", textTransform: "uppercase" }} maxLength={7} />
          <div style={{ display: "flex", gap: 6 }}>
            {PRESET_COLORS.map((c) => (
              <button key={c} onClick={() => setBrandColor(c)}
                style={{ width: 28, height: 28, borderRadius: 8, background: c, border: brandColor === c ? "3px solid #fff" : "1px solid var(--border-2)", boxShadow: brandColor === c ? `0 0 0 2px ${c}` : "none", cursor: "pointer" }} />
            ))}
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: SLATE, marginTop: 10 }}>Used for primary buttons, active nav links, and highlights.</p>
      </div>

      {/* Save */}
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
        <button onClick={reset} style={{ padding: "11px 18px", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff", color: SLATE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Reset to defaults
        </button>
        <button onClick={save} disabled={saving} style={{
          padding: "11px 24px", borderRadius: 10, border: "none",
          background: saved ? MONEY : "linear-gradient(135deg, #0EA5E9, #0284C7)", color: "#fff",
          fontSize: 13, fontWeight: 800, cursor: saving ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {saving ? "Saving..." : saved ? "Saved" : "Save branding"}
        </button>
      </div>
    </div>
  );
}
