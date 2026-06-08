"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Search, RotateCcw, Loader2, PhoneCall, Download, CheckSquare, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { LeadsList, type LeadItem } from "@/app/_components/LeadsList";

interface Lead {
  id: string;
  campaign_id: string;
  user_id: string;
  status: string;
  extracted_address: string | null;
  asking_price: number | null;
  qualification_reason: string | null;
  agent_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  campaigns?: { name: string } | null;
}

const STATUS_OPTS = ["All", "Hot", "Warm", "Cold", "Call Back", "Disqualified", "Duplicate", "Error"];

function arvOf(l: Lead): number | null {
  const m = l.metadata as { arv?: number; zillow_data?: { zestimate?: number } } | null;
  return Number(m?.arv) || Number(m?.zillow_data?.zestimate) || null;
}
function toItem(l: Lead): LeadItem {
  return { id: l.id, address: l.extracted_address, status: l.status, asking: l.asking_price, arv: arvOf(l), agent: l.agent_name };
}

export default function CallsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [campaignFilter, setCampaignFilter] = useState("All");
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("leads")
      .select("*, campaigns(name)")
      .eq("user_id", user.id)
      .neq("status", "Processing")
      .order("created_at", { ascending: false });
    const rows = (data || []) as Lead[];
    rows.forEach(r => seen.current.add(r.id)); // initial load isn't "new"
    setLeads(rows);
    setCampaigns(Array.from(new Set(rows.map(r => r.campaigns?.name).filter(Boolean) as string[])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates — new decided leads slide in and glow.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const ch = supabase.channel(`leads-library-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      ch.on("postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const row = payload.new as Lead | null;
          const oldRow = payload.old as Lead | null;
          if (payload.eventType === "DELETE") { setLeads(prev => prev.filter(l => l.id !== oldRow?.id)); return; }
          if (!row) return;
          if (row.status === "Processing") { setLeads(prev => prev.filter(l => l.id !== row.id)); return; }
          const { data: enriched } = await supabase.from("leads").select("*, campaigns(name)").eq("id", row.id).maybeSingle();
          if (!enriched) return;
          setLeads(prev => {
            const exists = prev.some(l => l.id === enriched.id);
            if (exists) return prev.map(l => l.id === enriched.id ? (enriched as Lead) : l);
            if (!seen.current.has(enriched.id)) {
              seen.current.add(enriched.id);
              setNewIds(s => { const n = new Set(s); n.add(enriched.id); return n; });
              setTimeout(() => setNewIds(s => { const n = new Set(s); n.delete(enriched.id); return n; }), 2200);
            }
            return [enriched as Lead, ...prev];
          });
        }).subscribe();
      channel = ch;
    })();
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  const filtered = leads.filter(l => {
    if (statusFilter !== "All" && l.status !== statusFilter) return false;
    if (campaignFilter !== "All" && l.campaigns?.name !== campaignFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(l.extracted_address || "").toLowerCase().includes(q) && !(l.agent_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const deleteLead = async (leadId: string) => {
    if (!confirm("Delete this lead and its recordings? This cannot be undone.")) return;
    setLeads(prev => prev.filter(l => l.id !== leadId)); // optimistic
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`/api/leads/${leadId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session?.access_token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { alert("Delete failed: " + (j.error || "unknown")); load(); }
  };

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"} and their recordings? This cannot be undone.`)) return;
    setBulkBusy(true);
    setLeads(prev => prev.filter(l => !selected.has(l.id))); // optimistic
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { Authorization: `Bearer ${session?.access_token}` };
    const results = await Promise.allSettled(ids.map(id => fetch(`/api/leads/${id}`, { method: "DELETE", headers })));
    const failed = results.filter(r => r.status === "rejected").length;
    setSelected(new Set()); setSelectMode(false); setBulkBusy(false);
    if (failed) { alert(`${failed} deletion(s) failed.`); load(); }
  };

  const exportCSV = () => {
    const headers = ["Date", "Agent", "Address", "Status", "Campaign", "Price", "Reason"];
    const rows = filtered.map(l => [
      new Date(l.created_at).toISOString(), l.agent_name || "", l.extracted_address || "",
      l.status, l.campaigns?.name || "", l.asking_price?.toString() || "",
      (l.qualification_reason || "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const inputStyle = {
    padding: "9px 12px", borderRadius: 9,
    background: "var(--surface-3)", border: "1px solid var(--border-2)",
    fontSize: 13, color: "var(--text-1)", outline: "none",
  } as const;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 4 }}>Call Library</h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>
            {filtered.length} processed lead{filtered.length === 1 ? "" : "s"}. Click any card for full details.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setSelectMode(m => !m); setSelected(new Set()); }} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9,
            background: selectMode ? "#0EA5E9" : "var(--surface-1)", color: selectMode ? "#fff" : "var(--text-1)",
            border: `1px solid ${selectMode ? "#0EA5E9" : "var(--border-2)"}`, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}><CheckSquare size={13} /> {selectMode ? "Done" : "Select"}</button>
          <button onClick={exportCSV} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9,
            background: "var(--surface-1)", color: "var(--text-1)", border: "1px solid var(--border-2)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}><Download size={13} /> Export CSV</button>
          <button onClick={load} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9,
            background: "#0EA5E9", color: "#fff", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(14,165,233,0.30)",
          }}><RotateCcw size={13} /> Refresh</button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderRadius: 12, background: "#F0F9FF", border: "1px solid #0EA5E9", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#0369A1" }}>{selected.size} selected</span>
          <button onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id)))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#0284C7", fontSize: 12.5, fontWeight: 700 }}>
            {selected.size === filtered.length ? "Clear all" : "Select all"}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={bulkDelete} disabled={!selected.size || bulkBusy} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9,
            background: selected.size ? "#DC2626" : "#FCA5A5", color: "#fff", border: "none",
            fontSize: 12.5, fontWeight: 800, cursor: selected.size ? "pointer" : "not-allowed",
          }}>
            {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete selected
          </button>
        </div>
      )}

      <div style={{
        display: "flex", gap: 10, padding: 14, borderRadius: 12, flexWrap: "wrap",
        background: "var(--surface-1)", border: "1px solid var(--border-2)", boxShadow: "var(--shadow-sm)",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address or agent..."
            style={{ ...inputStyle, width: "100%", paddingLeft: 36 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} style={inputStyle}>
          <option value="All">All Campaigns</option>
          {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--brand-purple)", margin: "0 auto" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-2)", background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 14 }}>
          <PhoneCall size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>No leads found.</p>
        </div>
      ) : (
        <LeadsList leads={filtered.map(toItem)} newIds={newIds} onOpen={(id) => router.push(`/dashboard/leads/${id}`)} onDelete={deleteLead}
          selectable={selectMode} selectedIds={selected} onToggleSelect={toggleSelect} />
      )}
    </div>
  );
}
