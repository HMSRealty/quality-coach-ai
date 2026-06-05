"use client";

// Persona & Kill List editor. Owners/admins customize how the AI qualifies
// leads. Defaults are baked into the analyze route; saving here OVERRIDES them
// for this organization only.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import { Card } from "@/app/_components/Card";
import { normalizeRole, can } from "@/lib/rbac";
import {
  Save, Loader2, RotateCcw, AlertCircle, CheckCircle2, Skull, Bot, Plus, Trash2, Lock,
} from "lucide-react";

const NAVY = T.navy;
const SLATE = T.slate;

interface Killer { id: string; label: string; rule: string; enabled: boolean }

const DEFAULT_PERSONA = `ROLE: You are an elite Real Estate Acquisitions Quality-Control Manager and Advanced AI Auditor.

CORE DIRECTIVES (CALL-ONLY MODE):
• Audio is the Single Source of Truth — extract everything from what is actually spoken.
• Contextual Deduction: read between the lines. "My house" / "I want to sell" = decision maker. "We can figure out a date later" = flexible.
• Flawless Timestamps: every extracted detail has a precise [MM:SS] timestamp.

PRICING MATRIX vs the LIVE Zillow Zestimate provided in context:
🔥 HOT  — spoken asking ≤ 70% of Zestimate (Deep Discount; overrides timeline/minor rules).
🟡 WARM — spoken asking ≤ 90% of Zestimate AND seller motivation is weak/passive ("you called me", "just seeing what I can get").
🔴 DEAD — spoken asking near or above 100% of Zestimate with no real motivation, OR no price + no motivation.

SAVIOR EXCEPTION: If the PRIMARY address hits a Kill rule but the seller volunteers a DIFFERENT off-market property, extract it and qualify the lead based on the volunteered property.`;

const DEFAULT_KILLERS: Killer[] = [
  { id: "K1", enabled: true, label: "Commercial / non-residential", rule: "Built retail/commercial/industrial spaces. EXCEPTION: vacant lots, raw land, Airbnbs, short-term rentals, multifamily and apartment complexes of any size are ACCEPTED." },
  { id: "K2", enabled: true, label: "Listed on MLS", rule: "Actively listed with a realtor, agent or broker. FSBO is accepted." },
  { id: "K3", enabled: true, label: "Under contract", rule: "In escrow, under contract, or accepting backup offers." },
  { id: "K4", enabled: true, label: "Timeline > 6 months", rule: "Seller explicitly will not sell for over 6 months, 'next year' or any vague far-future timeline." },
  { id: "K5", enabled: true, label: "Price-shopping", rule: "Seller is just testing the market with no actual intent to move." },
  { id: "K6", enabled: true, label: "Retail mindset / overpriced", rule: "Asking price is near or exceeds the Zillow Market Value." },
  { id: "K7", enabled: true, label: "Sarcastic bluffer", rule: "Mocking, not serious, or giving ridiculous numbers." },
  { id: "K8", enabled: true, label: "Conditional blockers", rule: "Waiting on an event that hasn't started yet (e.g., waiting to file for divorce, waiting to find a new house but hasn't started looking)." },
  { id: "K9", enabled: true, label: "Not decision maker", rule: "Speaker is a tenant, neighbor, or otherwise has no authority to sell." },
  { id: "K10", enabled: true, label: "Aggressive refusal", rule: "Hostile owner who aggressively refuses to provide any information. Politely declining to give a price is NOT a kill." },
  { id: "K11", enabled: true, label: "DNC request", rule: "Seller requests to be taken off the list, says 'Do Not Call', or threatens legal/workplace action." },
  { id: "K12", enabled: true, label: "100% Spanish", rule: "The entire conversation is in Spanish." },
  { id: "K13", enabled: true, label: "Rejected selling 2+ times", rule: "Seller repeatedly says 'no' to selling throughout the call." },
  { id: "K14", enabled: true, label: "No price + no motivation", rule: "Seller refuses to give a number AND has absolutely no actionable reason or distress for selling." },
];

export default function PersonaPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [persona, setPersona] = useState("");
  const [killers, setKillers] = useState<Killer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: prof } = await supabase
      .from("profiles").select("role, organization_id, parent_user_id").eq("id", user.id).maybeSingle();
    const role = normalizeRole(prof?.role);
    setCanEdit(can(role, "users.manage")); // owners + admins
    const org = (prof?.organization_id as string) ?? null;
    setOrgId(org);
    if (!org) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("organizations").select("qa_persona, qa_killers").eq("id", org).maybeSingle();
    if (error) {
      if (/qa_persona|qa_killers/i.test(error.message)) setUnavailable(true);
      setLoading(false); return;
    }
    setPersona((data?.qa_persona as string) ?? DEFAULT_PERSONA);
    const k = (data?.qa_killers as Killer[] | null);
    setKillers(k && k.length ? k : DEFAULT_KILLERS);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ qa_persona: persona, qa_killers: killers })
      .eq("id", orgId);
    setSaving(false);
    if (error) return showToast(false, error.message);
    showToast(true, "Persona & Kill List saved");
  };

  const resetDefaults = () => {
    if (!confirm("Reset persona and the entire Kill List to defaults?")) return;
    setPersona(DEFAULT_PERSONA); setKillers(DEFAULT_KILLERS);
  };

  const addKiller = () => {
    const nextId = `K${killers.length + 1}`;
    setKillers([...killers, { id: nextId, label: "New killer", rule: "Describe the deal-breaker condition.", enabled: true }]);
  };
  const updateKiller = (i: number, patch: Partial<Killer>) =>
    setKillers((p) => p.map((k, idx) => idx === i ? { ...k, ...patch } : k));
  const removeKiller = (i: number) =>
    setKillers((p) => p.filter((_, idx) => idx !== i));

  if (unavailable) {
    return (
      <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center", padding: 32, background: T.surface1, border: `1px solid ${T.border2}`, borderRadius: 14 }}>
        <AlertCircle size={28} color="#EA580C" style={{ margin: "0 auto 12px" }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>Persona editor not enabled yet</h2>
        <p style={{ fontSize: 13, color: SLATE, marginTop: 6 }}>Run migration 0006 to add the persona columns.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={20} color={T.teal} /> AI Persona &amp; Kill List
          </h1>
          <p style={{ fontSize: 13, color: SLATE }}>
            Customize how the AI qualifies every call for your workspace. Saved changes apply to the very next lead analyzed.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <button onClick={resetDefaults} disabled={saving} style={btnGhost}>
              <RotateCcw size={13} /> Reset defaults
            </button>
          )}
          {canEdit ? (
            <button onClick={save} disabled={saving || loading} style={btnPrimary}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", fontSize: 12, color: SLATE, background: T.surface3, borderRadius: 9 }}>
              <Lock size={12} /> Read-only — owners/admins only
            </span>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, display: "flex", gap: 8, alignItems: "center",
          background: toast.ok ? "#ECFDF5" : "#FBEEE8",
          color: toast.ok ? "#059669" : "#DC2626",
          fontSize: 13, fontWeight: 600, border: `1px solid ${toast.ok ? "#A7F3D0" : "#FBCFBE"}`,
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: NAVY }} /></div>
      ) : (
        <>
          {/* Persona */}
          <Card>
            <div style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>Persona / system prompt</h3>
                <span style={{ fontSize: 11, color: T.text3 }}>{persona.length.toLocaleString()} chars</span>
              </div>
              <textarea value={persona} onChange={(e) => setPersona(e.target.value)} readOnly={!canEdit}
                rows={14}
                style={{
                  width: "100%", padding: 14, borderRadius: 10, fontSize: 13, lineHeight: 1.6,
                  background: T.surface3, border: `1px solid ${T.border2}`,
                  color: NAVY, outline: "none", fontFamily: "var(--font-mono)",
                  resize: "vertical",
                }} />
              <p style={{ fontSize: 11, color: SLATE, marginTop: 8 }}>
                The analyze pipeline injects the live Zillow Zestimate + active Kill List underneath this text automatically — don&apos;t hardcode them here.
              </p>
            </div>
          </Card>

          {/* Kill List */}
          <Card>
            <div style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 6 }}>
                  <Skull size={14} color="#DC2626" /> Kill List ({killers.filter((k) => k.enabled).length} active / {killers.length})
                </h3>
                {canEdit && (
                  <button onClick={addKiller} style={btnGhost}>
                    <Plus size={13} /> Add killer
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {killers.map((k, i) => (
                  <div key={i} style={{
                    padding: 14, borderRadius: 10, background: k.enabled ? T.surface3 : T.surface1,
                    border: `1px solid ${k.enabled ? T.border2 : T.border1}`,
                    opacity: k.enabled ? 1 : 0.55,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: canEdit ? "pointer" : "default" }}>
                        <input type="checkbox" checked={k.enabled} disabled={!canEdit}
                          onChange={(e) => updateKiller(i, { enabled: e.target.checked })} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.text3, letterSpacing: "0.06em" }}>{k.id}</span>
                      </label>
                      <input value={k.label} readOnly={!canEdit}
                        onChange={(e) => updateKiller(i, { label: e.target.value })}
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 7, background: T.surface1, border: `1px solid ${T.border2}`, fontSize: 13, fontWeight: 700, color: NAVY, outline: "none" }} />
                      {canEdit && (
                        <button onClick={() => removeKiller(i)} title="Remove"
                          style={{ background: "transparent", border: "none", color: "#DC2626", cursor: "pointer", padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <textarea value={k.rule} readOnly={!canEdit}
                      onChange={(e) => updateKiller(i, { rule: e.target.value })}
                      rows={2}
                      style={{
                        width: "100%", padding: 10, borderRadius: 7, background: T.surface1, border: `1px solid ${T.border2}`,
                        fontSize: 12.5, color: NAVY, outline: "none", resize: "vertical", lineHeight: 1.5,
                      }} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px",
  borderRadius: 10, background: T.navy, color: "#fff", border: "none",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px",
  borderRadius: 9, background: T.surface1, color: T.navy,
  border: `1px solid ${T.border2}`, fontSize: 12, fontWeight: 700, cursor: "pointer",
};
