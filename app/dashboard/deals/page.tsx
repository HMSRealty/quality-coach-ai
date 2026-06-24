"use client";

// Deals & Offers — Acquisitions pipeline of qualified leads (Hot/Warm) with
// quick MAO context. Clean Enterprise (white / sky / emerald / black).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Handshake, Loader2, MapPin, ArrowRight, DollarSign } from "lucide-react";

const SKY_600 = "#0a5f52";
const MONEY = "#0a5f52";
const money = (n: number) => `$${Math.round(Math.max(0, n)).toLocaleString()}`;

interface Lead {
  id: string; status: string; extracted_address: string | null;
  asking_price: number | null; agent_name: string | null;
  metadata: Record<string, unknown> | null;
}

// Hot stays red (universal urgency on floor), Warm stays amber.
const STATUS_C: Record<string, string> = { Hot: "#DC2626", Warm: "#EA580C" };

export default function DealsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("leads")
        .select("id, status, extracted_address, asking_price, agent_name, metadata")
        .eq("user_id", user.id)
        .in("status", ["Hot", "Warm"])
        .order("created_at", { ascending: false });
      setLeads((data || []) as Lead[]);
      setLoading(false);
    })();
  }, []);

  const arvOf = (l: Lead) => {
    const m = l.metadata as { arv?: number; zillow_data?: { zestimate?: number } } | null;
    return Number(m?.arv) || Number(m?.zillow_data?.zestimate) || 0;
  };
  const maoOf = (l: Lead) => { const arv = arvOf(l); return arv ? arv * 0.7 - 10000 : 0; };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(14,124,107,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Handshake size={19} color={SKY_600} />
        </span>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#000", letterSpacing: "-0.02em" }}>Hot Leads Alert</h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>Deals ready to close — {leads.length} on the table.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: SKY_600 }} /></div>
      ) : leads.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "#fff", border: "1px solid var(--border-2)", borderRadius: 16, boxShadow: "var(--shadow-sm)" }}>
          <Handshake size={34} color="#CBD5E1" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>No deals on the table</p>
          <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>The second a call comes back Hot or Warm, it lands here for offer prep.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {leads.map((l) => (
            <div key={l.id} onClick={() => router.push(`/dashboard/leads/${l.id}`)}
              style={{
                display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", alignItems: "center", gap: 16,
                background: "#fff", border: "1px solid var(--border-2)", borderRadius: 14, padding: "14px 18px",
                cursor: "pointer", boxShadow: "var(--shadow-sm)",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MapPin size={14} color={SKY_600} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.extracted_address || "Unknown address"}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-3)" }}>{l.agent_name || "Unassigned"} · Ask {l.asking_price ? money(l.asking_price) : "—"}</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Est. MAO</p>
                <p style={{ fontSize: 15, fontWeight: 900, color: MONEY, display: "inline-flex", alignItems: "center", gap: 2 }}><DollarSign size={13} />{maoOf(l) ? money(maoOf(l)).replace("$", "") : "—"}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ padding: "3px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: `color-mix(in srgb, ${STATUS_C[l.status] || SKY_600} 12%, transparent)`, color: STATUS_C[l.status] || SKY_600 }}>{l.status}</span>
                <ArrowRight size={16} color="var(--text-3)" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
