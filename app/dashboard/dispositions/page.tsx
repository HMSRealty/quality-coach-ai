"use client";

// Cash Buyers CRM — buyer list with buy-box criteria, area targeting, and
// filtering (match a deal price/area against your buyers' criteria).
import { useEffect, useMemo, useState } from "react";
import { Portal } from "@/app/_components/Portal";
import { supabase } from "@/lib/supabase";
import {
  Users, Plus, Trash2, Loader2, Search, Building2, Phone, Mail, MapPin, X, Pencil, Filter,
} from "lucide-react";

const SKY = "#16A34A";
const SKY_600 = "#15803D";
const MONEY = "#15803D";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const toArr = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);

interface Buyer {
  id: string; name: string; company: string | null; phone: string | null; email: string | null;
  areas: string[]; property_types: string[]; min_price: number | null; max_price: number | null;
  notes: string | null; is_active: boolean;
}
const EMPTY = { name: "", company: "", phone: "", email: "", areas: "", property_types: "", min_price: "", max_price: "", notes: "" };

export default function CashBuyersPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [price, setPrice] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("cash_buyers").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setBuyers((data || []) as Buyer[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true); };
  const openEdit = (b: Buyer) => {
    setForm({ name: b.name, company: b.company ?? "", phone: b.phone ?? "", email: b.email ?? "", areas: (b.areas || []).join(", "), property_types: (b.property_types || []).join(", "), min_price: b.min_price?.toString() ?? "", max_price: b.max_price?.toString() ?? "", notes: b.notes ?? "" });
    setEditId(b.id); setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return; }
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const payload = {
      user_id: user.id, organization_id: (prof?.organization_id as string) ?? null,
      name: form.name.trim(), company: form.company.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null,
      areas: toArr(form.areas), property_types: toArr(form.property_types),
      min_price: form.min_price ? Number(form.min_price) : null, max_price: form.max_price ? Number(form.max_price) : null,
      notes: form.notes.trim() || null,
    };
    if (editId) await supabase.from("cash_buyers").update(payload).eq("id", editId);
    else await supabase.from("cash_buyers").insert(payload);
    setSaving(false); setShowForm(false); load();
  };
  const del = async (id: string) => { if (!confirm("Delete this buyer?")) return; await supabase.from("cash_buyers").delete().eq("id", id); setBuyers(p => p.filter(b => b.id !== id)); };

  const shown = useMemo(() => {
    const p = price ? Number(price) : null;
    const a = area.trim().toLowerCase();
    return buyers.filter(b => {
      if (q.trim()) { const t = q.toLowerCase(); if (!(b.name.toLowerCase().includes(t) || (b.company || "").toLowerCase().includes(t))) return false; }
      if (a && !(b.areas || []).some(x => x.toLowerCase().includes(a))) return false;
      if (p != null) { if (b.min_price != null && p < b.min_price) return false; if (b.max_price != null && p > b.max_price) return false; }
      return true;
    });
  }, [buyers, q, area, price]);

  const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-2)", background: "#fff", color: "#000", fontSize: 13, outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 5 };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(22,163,74,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={19} color={SKY_600} /></span>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#000", letterSpacing: "-0.02em" }}>Cash Buyers</h1>
            <p style={{ fontSize: 13, color: "var(--text-2)" }}>{buyers.length} buyer{buyers.length === 1 ? "" : "s"} on the bench. Match a deal to their buy-box in one click.</p>
          </div>
        </div>
        <button onClick={openNew} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, background: "linear-gradient(135deg, #16A34A, #15803D)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(22,163,74,0.35)" }}><Plus size={15} /> Add buyer</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 14, borderRadius: 12, background: "#fff", border: "1px solid var(--border-2)", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / company…" style={{ ...inp, paddingLeft: 36 }} />
        </div>
        <div style={{ position: "relative", minWidth: 150 }}>
          <MapPin size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input value={area} onChange={e => setArea(e.target.value)} placeholder="Filter by area" style={{ ...inp, paddingLeft: 36 }} />
        </div>
        <div style={{ position: "relative", minWidth: 150 }}>
          <Filter size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Match deal price" style={{ ...inp, paddingLeft: 36 }} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: SKY_600 }} /></div>
      ) : shown.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "#fff", border: "1px solid var(--border-2)", borderRadius: 16, boxShadow: "var(--shadow-sm)" }}>
          <Users size={34} color="#CBD5E1" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>{buyers.length ? "No buyers match your filters." : "No buyers on the bench yet"}</p>
          {!buyers.length && <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>Add buyers with their buy-box now. When a deal lands, you&apos;ll know who to call first.</p>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }} className="ci-grid">
          {shown.map(b => (
            <div key={b.id} style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 14, padding: 16, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#000" }}>{b.name}</p>
                  {b.company && <p style={{ fontSize: 12, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 4 }}><Building2 size={11} /> {b.company}</p>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => openEdit(b)} style={{ background: "none", border: "1px solid var(--border-2)", borderRadius: 8, padding: 6, cursor: "pointer", color: SKY_600, display: "flex" }}><Pencil size={13} /></button>
                  <button onClick={() => del(b.id)} style={{ background: "none", border: "1px solid var(--border-2)", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--text-3)", display: "flex" }}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-2)" }}>
                {b.phone && <a href={`tel:${b.phone}`} style={{ color: "var(--text-2)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {b.phone}</a>}
                {b.email && <a href={`mailto:${b.email}`} style={{ color: "var(--text-2)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><Mail size={11} /> {b.email}</a>}
              </div>
              {(b.min_price != null || b.max_price != null) && (
                <p style={{ fontSize: 13, fontWeight: 800, color: MONEY }}>{b.min_price != null ? money(b.min_price) : "—"} – {b.max_price != null ? money(b.max_price) : "—"}</p>
              )}
              {(b.areas?.length > 0 || b.property_types?.length > 0) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(b.areas || []).map(a => <span key={a} style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, #0EA5E9 12%, transparent)", color: SKY_600 }}>{a}</span>)}
                  {(b.property_types || []).map(p => <span key={p} style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-2)" }}>{p}</span>)}
                </div>
              )}
              {b.notes && <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{b.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <Portal>
        <div onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 560, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(15,23,42,0.30)", overflow: "hidden", animation: "modalIn 200ms cubic-bezier(0.16,1,0.3,1) both" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#000" }}>{editId ? "Edit buyer" : "Add cash buyer"}</p>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={18} /></button>
            </div>
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Company</label><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inp} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Min price</label><input type="number" value={form.min_price} onChange={e => setForm({ ...form, min_price: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Max price</label><input type="number" value={form.max_price} onChange={e => setForm({ ...form, max_price: e.target.value })} style={inp} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Target areas (comma separated)</label><input value={form.areas} onChange={e => setForm({ ...form, areas: e.target.value })} placeholder="Austin, 78701, Travis County" style={inp} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Property types (comma separated)</label><input value={form.property_types} onChange={e => setForm({ ...form, property_types: e.target.value })} placeholder="SFR, Multi-family, Land" style={inp} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inp, resize: "vertical", fontFamily: "var(--font-sans)" }} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 20px 20px" }}>
              <button onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "none", cursor: saving ? "wait" : "pointer", background: form.name.trim() ? "linear-gradient(135deg, #0EA5E9, #0284C7)" : "#7DD3FC", color: "#fff", fontSize: 13, fontWeight: 800 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {editId ? "Save" : "Add buyer"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
