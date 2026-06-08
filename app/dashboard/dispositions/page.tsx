"use client";

// Dispositions — assign contracted deals to cash buyers / track assignments.
// Route prepared per the Acquisitions structure; lists Disqualified/closed-out
// leads as a starting dataset until the buyer-assignment model lands.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PackageCheck, Loader2, Building2, Plus } from "lucide-react";

const SKY_600 = "#0284C7";

interface Lead { id: string; extracted_address: string | null; status: string; agent_name: string | null; }

const STAGES = [
  { key: "Hot", label: "Under Contract", color: "#059669" },
  { key: "Warm", label: "Marketing to Buyers", color: "#0284C7" },
  { key: "Call Back", label: "Negotiating", color: "#EA580C" },
];

export default function DispositionsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("leads")
        .select("id, extracted_address, status, agent_name")
        .eq("user_id", user.id)
        .in("status", ["Hot", "Warm", "Call Back"])
        .order("created_at", { ascending: false });
      setLeads((data || []) as Lead[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(14,165,233,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PackageCheck size={19} color={SKY_600} />
          </span>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#000", letterSpacing: "-0.02em" }}>Cash Buyers</h1>
            <p style={{ fontSize: 13, color: "var(--text-2)" }}>Buyer pipeline &amp; dispositions — move contracted deals to cash buyers.</p>
          </div>
        </div>
        <button disabled style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, background: "#fff", color: SKY_600, border: `1px solid #0EA5E9`, fontSize: 13, fontWeight: 700, cursor: "not-allowed", opacity: 0.65 }}>
          <Plus size={14} /> Add Buyer
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: SKY_600 }} /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }} className="ci-grid">
          {STAGES.map((stage) => {
            const items = leads.filter(l => l.status === stage.key);
            return (
              <div key={stage.key} style={{ background: "#fff", border: "1px solid var(--border-2)", borderRadius: 16, boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border-1)", borderTop: `3px solid ${stage.color}` }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#000" }}>{stage.label}</p>
                  <span style={{ fontSize: 11, fontWeight: 800, color: stage.color, background: `color-mix(in srgb, ${stage.color} 12%, transparent)`, padding: "2px 9px", borderRadius: 999 }}>{items.length}</span>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                  {items.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "18px 0" }}>Nothing here yet.</p>
                  ) : items.map(l => (
                    <a key={l.id} href={`/dashboard/leads/${l.id}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 10, background: "#F8FAFC", border: "1px solid var(--border-1)" }}>
                      <Building2 size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.extracted_address || "Unknown address"}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
