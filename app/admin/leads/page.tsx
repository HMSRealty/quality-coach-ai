"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Download, Search, ExternalLink, Database } from "lucide-react";
import Link from "next/link";

const BG = "#F7F8FA";
const PANEL = "#FFFFFF";
const PANEL_2 = "#F7F8FA";
const TEAL = "#059669";
const TXT = "#0B0F19";
const MUTED = "#4B5563";

interface Lead {
  id: string;
  user_id: string;
  status: string;
  agent_name: string | null;
  extracted_address: string | null;
  asking_price: number | null;
  qualification_reason: string | null;
  ai_feedback: string | null;
  ai_coaching_points: string[] | null;
  ai_status_reason: string | null;
  bant_budget: string | null;
  bant_authority: string | null;
  bant_need: string | null;
  bant_timeline: string | null;
  created_at: string;
  campaigns?: { name: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  Hot: "#FF5C7C",
  Warm: "#FFAA00",
  Cold: "#5BA8FF",
  "Call Back": "#FFC857",
  Disqualified: "#8A97AB",
  Processing: MUTED,
  Duplicate: "#FFC857",
  Commercial: "#B58CFF",
  Error: "#FF5C7C",
};

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("id, email");
      const m: Record<string, string> = {};
      (profiles || []).forEach((p: { id: string; email: string }) => { m[p.id] = p.email; });
      setUsers(m);

      const { data } = await supabase
        .from("leads")
        .select("*, campaigns(name)")
        .order("created_at", { ascending: false })
        .limit(2000);
      setLeads((data || []) as Lead[]);
      setLoading(false);
    })();
  }, []);

  const filtered = leads.filter(l => {
    if (statusFilter !== "All" && l.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (l.extracted_address || "").toLowerCase().includes(q) ||
        (l.agent_name || "").toLowerCase().includes(q) ||
        (users[l.user_id] || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exportAll = () => {
    const headers = [
      "Lead ID", "Created", "Owner Email", "Agent", "Address", "Status",
      "Campaign", "Asking Price", "Reasoning", "AI Feedback", "Coaching Points",
      "Status Reason", "BANT Budget", "BANT Authority", "BANT Need", "BANT Timeline",
    ];
    const rows = leads.map(l => [
      l.id,
      new Date(l.created_at).toISOString(),
      users[l.user_id] || "",
      l.agent_name || "",
      l.extracted_address || "",
      l.status,
      l.campaigns?.name || "",
      l.asking_price?.toString() || "",
      l.qualification_reason || "",
      l.ai_feedback || "",
      Array.isArray(l.ai_coaching_points) ? l.ai_coaching_points.join(" | ") : "",
      l.ai_status_reason || "",
      l.bant_budget || "",
      l.bant_authority || "",
      l.bant_need || "",
      l.bant_timeline || "",
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hms-leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statuses = ["All", "Hot", "Warm", "Cold", "Call Back", "Disqualified", "Processing", "Duplicate", "Error"];

  return (
    <div style={{
      minHeight: "100vh", background: BG, color: TXT,
      margin: "-28px", padding: 28,
    }} className="animate-in">
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Database size={18} color={TEAL} />
              <h1 style={{ fontSize: 24, fontWeight: 900, color: TXT, letterSpacing: "-0.02em" }}>All Leads</h1>
            </div>
            <p style={{ fontSize: 13, color: MUTED }}>Workspace-wide lead database · {leads.length} total</p>
          </div>
          <button onClick={exportAll} style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 20px", borderRadius: 10,
            background: "#0B0F19", color: "#fff",
            fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer",
            boxShadow: `0 6px 22px rgba(11,15,25,0.25)`,
          }}>
            <Download size={14} /> Export All Leads
          </button>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search address, agent, or owner email..."
              style={{
                width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10,
                background: PANEL, color: TXT,
                border: "1px solid rgba(11,15,25,0.10)", outline: "none",
                fontSize: 13,
              }}
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
            padding: "10px 12px", borderRadius: 10,
            background: PANEL, color: TXT,
            border: "1px solid rgba(11,15,25,0.10)", outline: "none",
            fontSize: 13,
          }}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{
          borderRadius: 14, overflow: "hidden",
          background: PANEL, border: `1px solid rgba(11,15,25,0.08)`,
          boxShadow: `0 4px 16px rgba(0,0,0,0.30)`,
        }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <Loader2 size={24} className="animate-spin" style={{ color: TEAL, margin: "0 auto" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: MUTED }}>
              <Database size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
              <p style={{ fontSize: 13 }}>No leads found.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: PANEL_2 }}>
                    {["Date", "Owner Email", "Agent", "Address", "Status", "Campaign", ""].map(h => (
                      <th key={h} style={{
                        padding: "12px 14px", textAlign: "left",
                        fontSize: 10, fontWeight: 700, color: MUTED,
                        textTransform: "uppercase", letterSpacing: "0.08em",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} style={{ borderTop: "1px solid rgba(11,15,25,0.05)" }}>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>
                        {new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: TXT }}>
                        {users[l.user_id] || l.user_id.slice(0, 8)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: TXT, fontWeight: 600 }}>
                        {l.agent_name || "—"}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: TXT, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.extracted_address || "—"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: `${STATUS_COLOR[l.status] || MUTED}20`,
                          color: STATUS_COLOR[l.status] || MUTED,
                        }}>{l.status}</span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: MUTED }}>
                        {l.campaigns?.name || "—"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <Link href={`/dashboard/leads/${l.id}`} style={{
                          padding: "5px 10px", borderRadius: 7,
                          background: "#EEF1F6", color: "#0B0F19",
                          border: "1px solid rgba(11,15,25,0.12)",
                          fontSize: 11, fontWeight: 700, textDecoration: "none",
                          display: "inline-flex", alignItems: "center", gap: 4,
                        }}>
                          <ExternalLink size={11} /> Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
