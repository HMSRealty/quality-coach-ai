"use client";

export const runtime = "edge";

// PropyTrace — one-off skip trace inside RealTrack. Paid users can run a
// single lookup right here; everyone else gets nudged to the standalone
// PropyTrace site for bulk pricing.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { UserSearch, Loader2, Phone, Mail, CheckCircle2, ExternalLink, Lock, Search, Copy, AlertCircle } from "lucide-react";

const NAVY = "#0F172A";
const SLATE = "#475569";
const SKY_600 = "#0284C7";
const MONEY = "#059669";

const PROPYTRACE_SITE = "https://propytrace.pages.dev";

interface LookupResult {
  found: boolean;
  matchedName?: string;
  primaryPhone?: string;
  otherPhones?: string[];
  email?: string;
}

export default function PropyTracePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [paid, setPaid] = useState<boolean>(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", street: "", city: "", state: "", zip: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthed(false); return; }
      setAuthed(true);
      const { data } = await supabase.from("profiles")
        .select("is_approved, payment_status, plan_tier").eq("id", user.id).maybeSingle();
      const ok = data?.is_approved === true && (data?.payment_status === "paid" || (data?.plan_tier && data.plan_tier !== "free"));
      setPaid(!!ok);
    })();
  }, []);

  const run = async () => {
    setError(""); setResult(null);
    if (!form.firstName.trim() || !form.lastName.trim() || !form.city.trim() || !form.state.trim()) {
      setError("First name, last name, city and state are required."); return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/propytrace/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Lookup failed"); return; }
      setResult({
        found: !!j.found,
        matchedName: j.matchedName,
        primaryPhone: j.primaryPhone,
        otherPhones: j.otherPhones,
        email: j.email,
      });
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const copy = (s: string) => { try { navigator.clipboard.writeText(s); } catch {} };

  if (authed === null) {
    return <div style={{ padding: 80, textAlign: "center" }}><Loader2 size={28} className="animate-spin" style={{ color: SKY_600 }} /></div>;
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 9,
    border: "1px solid var(--border-2)", background: "#fff",
    color: "#000", fontSize: 14, outline: "none",
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.05em", color: "var(--text-3)", marginBottom: 5, display: "block",
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
          <UserSearch size={26} color={SKY_600} /> PropyTrace
        </h1>
        <p style={{ fontSize: 14, color: SLATE, marginTop: 4 }}>
          Type an owner&apos;s name and address &mdash; get back the best phone, matched name, and email. One lookup at a time.
        </p>
      </div>

      {!paid && (
        <div style={{
          background: "linear-gradient(135deg,#FEFCE8,#FEF9C3)", border: "1px solid #FDE68A",
          borderRadius: 14, padding: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Lock size={18} color="#854D0E" />
            <p style={{ fontSize: 15, fontWeight: 800, color: "#854D0E" }}>Upgrade to run lookups in RealTrack</p>
          </div>
          <p style={{ fontSize: 13, color: "#713F12", lineHeight: 1.6, marginBottom: 14 }}>
            PropyTrace lookups are a paid feature. You can still run them &mdash; and process bulk lists in CSV &mdash;
            over on the standalone PropyTrace site. Credits there never expire.
          </p>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <a href={PROPYTRACE_SITE} target="_blank" rel="noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 16px", borderRadius: 9, textDecoration: "none",
              background: "#854D0E", color: "#fff", fontSize: 13, fontWeight: 700,
            }}>
              <ExternalLink size={13} /> Open PropyTrace.app
            </a>
            <a href="mailto:info@realtrack.app?subject=Upgrade%20for%20PropyTrace%20access" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 16px", borderRadius: 9, textDecoration: "none",
              background: "#fff", color: "#854D0E", border: "1px solid #FDE68A",
              fontSize: 13, fontWeight: 700,
            }}>
              Contact us to upgrade
            </a>
          </div>
        </div>
      )}

      <div style={{
        background: "#fff", border: "1px solid var(--border-2)",
        borderRadius: 14, padding: 22, boxShadow: "var(--shadow-sm)",
        opacity: paid ? 1 : 0.6, pointerEvents: paid ? "auto" : "none",
      }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: "#000", marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Search size={15} color={SKY_600} /> Run a lookup
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <label style={lbl}>First name *</label>
            <input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="John" style={inp} />
          </div>
          <div>
            <label style={lbl}>Last name *</label>
            <input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Smith" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Street address</label>
            <input value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} placeholder="123 Main St" style={inp} />
          </div>
          <div>
            <label style={lbl}>City *</label>
            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Dallas" style={inp} />
          </div>
          <div>
            <label style={lbl}>State *</label>
            <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="TX" style={inp} />
          </div>
          <div>
            <label style={lbl}>ZIP</label>
            <input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="75201" style={inp} />
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 8,
            background: "#FEF2F2", border: "1px solid #FECACA",
            color: "#DC2626", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button onClick={run} disabled={loading || !paid} style={{
          marginTop: 16, padding: "11px 22px", borderRadius: 10, border: "none",
          background: loading ? "#64748B" : "linear-gradient(135deg,#0EA5E9,#0284C7)",
          color: "#fff", fontSize: 14, fontWeight: 800, cursor: loading ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 7,
        }}>
          {loading ? <><Loader2 size={14} className="animate-spin" /> Searching&hellip;</> : <><Search size={14} /> Find owner contact</>}
        </button>
      </div>

      {result && (
        <div style={{
          background: result.found ? "#F0FDF4" : "#F8FAFC",
          border: `1px solid ${result.found ? "#A7F3D0" : "var(--border-2)"}`,
          borderRadius: 14, padding: 22,
        }}>
          {result.found ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <CheckCircle2 size={18} color={MONEY} />
                <p style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>Match found</p>
              </div>
              {result.matchedName && (
                <p style={{ fontSize: 13, color: SLATE, marginBottom: 12 }}>
                  Matched name: <strong style={{ color: NAVY }}>{result.matchedName}</strong>
                </p>
              )}
              {result.primaryPhone && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 14px", borderRadius: 10,
                  background: "#fff", border: "1px solid var(--border-1)",
                  marginBottom: 8,
                }}>
                  <Phone size={16} color={MONEY} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: SLATE, letterSpacing: "0.05em", textTransform: "uppercase" }}>Primary phone</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, fontFamily: "var(--font-mono)" }}>{result.primaryPhone}</p>
                  </div>
                  <button onClick={() => copy(result.primaryPhone!)} style={{ background: "none", border: "none", cursor: "pointer", color: SKY_600, padding: 6 }}>
                    <Copy size={14} />
                  </button>
                </div>
              )}
              {result.otherPhones && result.otherPhones.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {result.otherPhones.map((p, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 12px", borderRadius: 8,
                      background: "#fff", border: "1px solid var(--border-1)",
                    }}>
                      <Phone size={13} color={SLATE} />
                      <p style={{ fontSize: 13, color: NAVY, fontFamily: "var(--font-mono)", flex: 1 }}>{p}</p>
                      <button onClick={() => copy(p)} style={{ background: "none", border: "none", cursor: "pointer", color: SKY_600, padding: 4 }}>
                        <Copy size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {result.email && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10,
                  background: "#fff", border: "1px solid var(--border-1)",
                  marginTop: 8,
                }}>
                  <Mail size={14} color={SLATE} />
                  <p style={{ fontSize: 12.5, color: NAVY, flex: 1, wordBreak: "break-all" }}>{result.email}</p>
                  <button onClick={() => copy(result.email!)} style={{ background: "none", border: "none", cursor: "pointer", color: SKY_600, padding: 4 }}>
                    <Copy size={12} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 6 }}>No match found</p>
              <p style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.6 }}>
                We couldn&apos;t find a confident match for that name + address combination. Double-check the spelling,
                or try the bulk skip-trace tool at <a href={PROPYTRACE_SITE} target="_blank" rel="noreferrer" style={{ color: SKY_600, fontWeight: 700 }}>propytrace.app</a> &mdash; it runs extra retry passes that often surface owners we miss here.
              </p>
            </>
          )}
        </div>
      )}

      <div style={{
        background: "#F8FAFC", border: "1px solid var(--border-1)",
        borderRadius: 12, padding: 16, fontSize: 12.5, color: SLATE, lineHeight: 1.6,
      }}>
        Need to trace a whole list at once? Bulk CSV skip-tracing lives on the standalone PropyTrace site &mdash;{" "}
        <a href={PROPYTRACE_SITE} target="_blank" rel="noreferrer" style={{ color: SKY_600, fontWeight: 700 }}>
          open it here <ExternalLink size={11} style={{ display: "inline", marginBottom: -1 }} />
        </a>.
      </div>
    </div>
  );
}
