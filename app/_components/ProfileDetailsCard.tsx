"use client";

// Editable onboarding/profile details (Phase 4 §1). Saves the columns the CRM
// migration added: full_name, username, phone, website.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { Save, Loader2, CheckCircle2, AlertCircle, UserCircle } from "lucide-react";

type Fields = { full_name: string; username: string; phone: string; website: string };

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: "var(--r-md)",
  background: "var(--surface-3)", border: "1px solid var(--border-2)",
  fontSize: 13, color: "var(--text-1)", outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10, color: "var(--text-3)", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, display: "block",
};

export function ProfileDetailsCard() {
  const [f, setF] = useState<Fields>({ full_name: "", username: "", phone: "", website: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setId(user.id);
      const { data, error } = await supabase
        .from("profiles").select("full_name, username, phone, website").eq("id", user.id).maybeSingle();
      if (error) { setUnavailable(true); setLoading(false); return; }
      setF({
        full_name: data?.full_name ?? "", username: data?.username ?? "",
        phone: data?.phone ?? "", website: data?.website ?? "",
      });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: f.full_name || null, username: f.username || null,
      phone: f.phone || null, website: f.website || null,
    }).eq("id", id);
    setToast(error ? { ok: false, msg: error.message } : { ok: true, msg: "Details saved." });
    setTimeout(() => setToast(null), 3000);
    setSaving(false);
  };

  if (unavailable) return null;

  const field = (key: keyof Fields, label: string, placeholder: string, type = "text") => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={f[key]} placeholder={placeholder}
        onChange={(e) => setF({ ...f, [key]: e.target.value })} style={inputStyle} />
    </div>
  );

  return (
    <Card>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <UserCircle size={16} style={{ color: "var(--text-1)" }} />
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>Your Details</h3>
        </div>

        {loading ? (
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>Loading…</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {field("full_name", "Full name", "Jane Doe")}
              {field("username", "Username", "jane")}
              {field("phone", "Phone", "(305) 555-0199", "tel")}
              {field("website", "Website (optional)", "https://…", "url")}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <button onClick={save} disabled={saving} style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px",
                borderRadius: "var(--r-md)", background: "var(--navy)", color: "#fff", border: "none",
                fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer",
              }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save details
              </button>
              {toast && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: toast.ok ? "var(--emerald)" : "#DC2626" }}>
                  {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {toast.msg}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
