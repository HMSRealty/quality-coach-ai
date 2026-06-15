"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Search, Link2, Copy, Check, ExternalLink, Power } from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.text1;
const TEAL = T.teal;
const SLATE = T.text2;

interface UserRow {
  id: string;
  email: string;
  role: string;
  can_receive_leads: boolean;
  allow_call_uploads: boolean;
  form_id?: string;
  form_slug?: string;
  form_is_active?: boolean;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export default function PermissionsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, role, can_receive_leads, allow_call_uploads");

    const { data: forms } = await supabase
      .from("submission_forms")
      .select("id, user_id, slug, is_active");

    const formByUser: Record<string, { id: string; slug: string; is_active: boolean }> = {};
    (forms || []).forEach(f => { formByUser[f.user_id] = { id: f.id, slug: f.slug, is_active: f.is_active }; });

    const rows: UserRow[] = (profiles || []).map(p => ({
      id: p.id,
      email: p.email,
      role: p.role || "user",
      can_receive_leads: p.can_receive_leads || false,
      allow_call_uploads: p.allow_call_uploads || false,
      form_id: formByUser[p.id]?.id,
      form_slug: formByUser[p.id]?.slug,
      form_is_active: formByUser[p.id]?.is_active,
    }));
    setUsers(rows);
    setLoading(false);
  };

  const toggleProfileFlag = async (user: UserRow, field: "can_receive_leads" | "allow_call_uploads") => {
    setSavingId(user.id);
    const newValue = !user[field];
    await supabase.from("profiles").update({ [field]: newValue }).eq("id", user.id);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, [field]: newValue } : u));
    setSavingId(null);
  };

  const toggleFormActive = async (user: UserRow) => {
    setSavingId(user.id);

    // Auto-provision the form if missing
    if (!user.form_id) {
      const baseSlug = slugify(user.email.split("@")[0]) || `form-${user.id.slice(0, 6)}`;
      let slug = baseSlug;
      let suffix = 1;
      // ensure unique slug
      while (true) {
        const { data: existing } = await supabase
          .from("submission_forms").select("id").eq("slug", slug).maybeSingle();
        if (!existing) break;
        slug = `${baseSlug}-${suffix++}`;
      }
      const { data: created } = await supabase
        .from("submission_forms")
        .insert({ user_id: user.id, slug, name: "Submit a Lead", is_active: true })
        .select("id, slug, is_active").single();
      if (created) {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, form_id: created.id, form_slug: created.slug, form_is_active: true } : u));
      }
    } else {
      const newVal = !user.form_is_active;
      await supabase.from("submission_forms").update({ is_active: newVal }).eq("id", user.form_id);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, form_is_active: newVal } : u));
    }
    setSavingId(null);
  };

  const copyLink = (user: UserRow) => {
    if (!user.form_slug) return;
    const url = `${origin}/submit/${user.form_slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(user.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div style={{ textAlign: "center", padding: "40px 24px" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", color: NAVY }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Form Permissions</h1>
        <p style={{ fontSize: 13, color: SLATE }}>
          Per-user submission forms. Flip one off and that user&apos;s intake stops accepting leads instantly.
        </p>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 320 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search users by email..."
          style={{
            width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10,
            background: T.surface1, border: "1px solid rgba(35,43,58,0.10)",
            fontSize: 13, color: NAVY, outline: "none",
          }}
        />
      </div>

      {/* Table */}
      <div style={{ background: T.surface1, border: "1px solid rgba(35,43,58,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.surface3, borderBottom: "1px solid rgba(35,43,58,0.08)" }}>
              {["User", "Role", "Form Link", "Form Active", "Can Receive Leads", "Allow Call Uploads"].map(h => (
                <th key={h} style={{
                  padding: "12px 16px", textAlign: "left", fontSize: 11,
                  fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} style={{ borderBottom: "1px solid rgba(35,43,58,0.05)" }}>
                <td style={{ padding: "12px 16px", fontSize: 13, color: NAVY, fontWeight: 600 }}>{u.email}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: u.role === "admin" ? "#EAF0FF" : "#F1F4F9",
                    color: u.role === "admin" ? "#92400E" : SLATE,
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {u.form_slug ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <code style={{ fontSize: 11, color: TEAL, background: "#E8EFFF", padding: "2px 6px", borderRadius: 4 }}>
                        /submit/{u.form_slug}
                      </code>
                      <button onClick={() => copyLink(u)} title="Copy link" style={{
                        padding: 4, background: "transparent", border: "none", cursor: "pointer", color: SLATE,
                      }}>
                        {copiedId === u.id ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                      </button>
                      <a href={`/submit/${u.form_slug}`} target="_blank" rel="noreferrer" title="Open" style={{ color: SLATE }}>
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: SLATE, fontStyle: "italic" }}>Not provisioned</span>
                  )}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Toggle
                    on={!!u.form_is_active}
                    onChange={() => toggleFormActive(u)}
                    busy={savingId === u.id}
                  />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Toggle
                    on={u.can_receive_leads}
                    onChange={() => toggleProfileFlag(u, "can_receive_leads")}
                    busy={savingId === u.id}
                  />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Toggle
                    on={u.allow_call_uploads}
                    onChange={() => toggleProfileFlag(u, "allow_call_uploads")}
                    busy={savingId === u.id}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", fontSize: 13, color: SLATE }}>No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div style={{
        padding: "14px 18px", borderRadius: 12,
        background: "linear-gradient(135deg, color-mix(in srgb, var(--text-1) 2%, transparent) 0%, color-mix(in srgb, var(--magenta) 6%, transparent) 100%)",
        border: "1px solid color-mix(in srgb, var(--magenta) 19%, transparent)", display: "flex", gap: 12, alignItems: "center",
      }}>
        <Power size={16} color={TEAL} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>How permissions work</p>
          <p style={{ fontSize: 11, color: SLATE, marginTop: 2, lineHeight: 1.5 }}>
            <strong>Form Active</strong> + <strong>Can Receive Leads</strong> must BOTH be on for a form to accept submissions.
            Toggling either off instantly blocks the public URL with a clean "not accepting submissions" message.
          </p>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, busy }: { on: boolean; onChange: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={busy}
      style={{
        position: "relative", width: 38, height: 22, borderRadius: 999,
        background: on ? TEAL : "#D8DEE9",
        border: "none", cursor: busy ? "wait" : "pointer", padding: 0,
        transition: "background 240ms cubic-bezier(0.16,1,0.30,1)",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 18, height: 18, borderRadius: "50%", background: T.surface1,
        boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
        transition: "left 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }} />
    </button>
  );
}
