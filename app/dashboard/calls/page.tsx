"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search, RotateCcw, Loader2, PhoneCall, Calendar, Zap, Download, ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface Lead {
  id: string;
  campaign_id: string;
  user_id: string;
  status: string;
  extracted_address: string | null;
  asking_price: number | null;
  qualification_reason: string | null;
  agent_name: string | null;
  created_at: string;
  campaigns?: { name: string } | null;
}

const NAVY = "#1A1A1A";
const SLATE = "#5B5249";

const STATUS_OPTS = ["All", "Hot", "Warm", "Cold", "Call Back", "Disqualified", "Duplicate", "Processing", "Error"];
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Hot:          { bg: "#FBEEE8", color: "#DC2626" },
  Warm:         { bg: "#FFF7ED", color: "#EA580C" },
  Cold:         { bg: "#F0F9FF", color: "#0284C7" },
  "Call Back":  { bg: "#FFFBEB", color: "#92400E" },
  Disqualified: { bg: "#F2EDE5", color: SLATE },
  Duplicate:    { bg: "#F3EADF", color: "#92400E" },
  Processing:   { bg: "#F2EDE5", color: SLATE },
  Error:        { bg: "#FBEEE8", color: "#DC2626" },
  Commercial:   { bg: "#F5F3FF", color: "#7C3AED" },
};

function AgentAvatar({ name }: { name: string | null }) {
  const initials = (name || "?").split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%",
      background: NAVY, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 800,
    }}>{initials}</div>
  );
}

export default function CallsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filtered, setFiltered] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [campaignFilter, setCampaignFilter] = useState("All");
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [rerunId, setRerunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Hide leads still being analyzed by Gemini — only show decided leads
    const { data } = await supabase
      .from("leads")
      .select("*, campaigns(name)")
      .eq("user_id", user.id)
      .neq("status", "Processing")
      .order("created_at", { ascending: false });
    const rows = (data || []) as Lead[];
    setLeads(rows);
    setFiltered(rows);
    const cs = Array.from(new Set(rows.map(r => r.campaigns?.name).filter(Boolean) as string[]));
    setCampaigns(cs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates via Supabase Realtime — leads appear/update without refresh
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const ch = supabase.channel(`leads-library-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      ch
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
          async (payload) => {
            const row = payload.new as Lead | null;
            const oldRow = payload.old as Lead | null;

            if (payload.eventType === "DELETE") {
              setLeads(prev => prev.filter(l => l.id !== oldRow?.id));
              return;
            }
            if (!row) return;
            // Only show leads that have finished analysis
            if (row.status === "Processing") {
              // If this row was previously visible and just flipped TO Processing (re-run), keep it out
              setLeads(prev => prev.filter(l => l.id !== row.id));
              return;
            }

            const { data: enriched } = await supabase
              .from("leads")
              .select("*, campaigns(name)")
              .eq("id", row.id)
              .maybeSingle();
            if (!enriched) return;

            setLeads(prev => {
              const exists = prev.some(l => l.id === enriched.id);
              if (exists) return prev.map(l => l.id === enriched.id ? (enriched as Lead) : l);
              return [enriched as Lead, ...prev];
            });
          }
        )
        .subscribe();
      channel = ch;
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let result = leads;
    if (statusFilter !== "All") result = result.filter(l => l.status === statusFilter);
    if (campaignFilter !== "All") result = result.filter(l => l.campaigns?.name === campaignFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        (l.extracted_address || "").toLowerCase().includes(q) ||
        (l.agent_name || "").toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, statusFilter, campaignFilter, leads]);

  const rerun = async (lead: Lead) => {
    setRerunId(lead.id);
    await supabase.from("leads").update({ status: "Processing" }).eq("id", lead.id);
    await fetch("/api/leads/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id }),
    });
    setRerunId(null);
    load();
  };

  const exportCSV = () => {
    const headers = ["Date", "Agent", "Address", "Status", "Campaign", "Price", "Reason"];
    const rows = filtered.map(l => [
      new Date(l.created_at).toISOString(),
      l.agent_name || "",
      l.extracted_address || "",
      l.status,
      l.campaigns?.name || "",
      l.asking_price?.toString() || "",
      (l.qualification_reason || "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Call Library</h1>
          <p style={{ fontSize: 13, color: SLATE }}>All processed leads. Click any row for full details.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportCSV} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 14px", borderRadius: 9,
            background: "#FFF", color: NAVY, border: "1px solid rgba(26,26,26,0.10)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={load} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 14px", borderRadius: 9,
            background: NAVY, color: "#fff", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(26,26,26,0.25)",
          }}>
            <RotateCcw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div style={{
        display: "flex", gap: 10, padding: 14, borderRadius: 12,
        background: "#FFFFFF", border: "1px solid rgba(26,26,26,0.08)",
        boxShadow: "0 2px 8px rgba(26,26,26,0.04)",
      }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search address or agent..."
            style={{
              width: "100%", padding: "9px 12px 9px 36px", borderRadius: 9,
              background: "#FAF8F4", border: "1px solid rgba(26,26,26,0.08)",
              fontSize: 13, color: NAVY, outline: "none",
            }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
          padding: "9px 12px", borderRadius: 9,
          background: "#FAF8F4", border: "1px solid rgba(26,26,26,0.08)",
          fontSize: 13, color: NAVY, outline: "none",
        }}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} style={{
          padding: "9px 12px", borderRadius: 9,
          background: "#FAF8F4", border: "1px solid rgba(26,26,26,0.08)",
          fontSize: 13, color: NAVY, outline: "none",
        }}>
          <option value="All">All Campaigns</option>
          {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{
        background: "#FFFFFF", border: "1px solid rgba(26,26,26,0.08)",
        borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(26,26,26,0.04)",
      }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: NAVY, margin: "0 auto" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: SLATE }}>
            <PhoneCall size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>No leads found.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAF8F4" }}>
                {["Date", "Agent", "Address", "Status", "Campaign", "Reason", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const sc = STATUS_COLORS[lead.status] || { bg: "#F2EDE5", color: SLATE };
                return (
                  <tr key={lead.id}
                    style={{ borderTop: "1px solid rgba(26,26,26,0.05)", cursor: "pointer", transition: "background 120ms" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#FAF8F4"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={() => window.location.href = `/dashboard/leads/${lead.id}`}
                  >
                    <td style={{ padding: "12px 16px", fontSize: 12, color: SLATE }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Calendar size={11} />
                        {new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <AgentAvatar name={lead.agent_name} />
                        <span style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>{lead.agent_name || "Unassigned"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: NAVY, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.extracted_address || "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 999,
                        background: sc.bg, color: sc.color,
                        fontSize: 11, fontWeight: 700,
                      }}>{lead.status}</span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: SLATE }}>
                      {lead.campaigns?.name || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: SLATE, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lead.qualification_reason || ""}>
                      {lead.qualification_reason || "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link href={`/dashboard/leads/${lead.id}`} onClick={e => e.stopPropagation()} style={{
                          padding: "5px 10px", borderRadius: 7,
                          background: "#F2EDE5", color: NAVY, border: "1px solid rgba(26,26,26,0.08)",
                          fontSize: 11, fontWeight: 600, textDecoration: "none",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          <ExternalLink size={11} /> Open
                        </Link>
                        <button onClick={(e) => { e.stopPropagation(); rerun(lead); }} disabled={rerunId === lead.id} style={{
                          padding: "5px 10px", borderRadius: 7,
                          background: "#FFF", color: NAVY, border: "1px solid rgba(26,26,26,0.08)",
                          fontSize: 11, fontWeight: 600, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                          opacity: rerunId === lead.id ? 0.5 : 1,
                        }}>
                          {rerunId === lead.id ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                          Re-run
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
