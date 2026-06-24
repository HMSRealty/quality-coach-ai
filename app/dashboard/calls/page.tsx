"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Search, RotateCcw, Loader2, PhoneCall, Download, CheckSquare, Trash2, Play, StopCircle, Webhook, Copy, Check, ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LeadsList, type LeadItem } from "@/app/_components/LeadsList";

// Big friendly empty state — gives a first-time user exactly one obvious
// next action. Three paths: get an API key, send a webhook, or just go to
// the setup wizard.
function EmptyCallLibrary({ hasFilter }: { hasFilter: boolean }) {
  const [copied, setCopied] = useState(false);
  const sample = "https://realtrack.app/api/inbound/lead?key=YOUR_API_KEY";
  if (hasFilter) {
    return (
      <div style={{ padding: 70, textAlign: "center", background: "#fff", borderRadius: 16, border: "1px solid var(--border-2)" }}>
        <Search size={28} style={{ margin: "0 auto 14px", opacity: 0.35, color: "var(--text-3)" }} />
        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>No leads match your filters</p>
        <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6 }}>Try clearing the search or filter selections above.</p>
      </div>
    );
  }
  return (
    <div style={{
      padding: "44px 28px", background: "#fff", borderRadius: 18,
      border: "1px solid var(--border-2)", textAlign: "center",
      boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: "linear-gradient(135deg, #0e7c6b, #0a5f52)",
        margin: "0 auto 18px",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <PhoneCall size={28} color="#fff" />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text-1)" }}>Nothing on the board yet</h2>
      <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 8, marginBottom: 24, lineHeight: 1.6, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        Point your dialer at this webhook — leads land here automatically and get graded in seconds.
        First time setting up? The wizard walks you through it.
      </p>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 14px", background: "#f3f4f1",
        border: "1px solid var(--border-2)", borderRadius: 11,
        marginBottom: 22, maxWidth: "100%",
      }}>
        <Webhook size={14} color="#0a5f52" />
        <code style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sample}</code>
        <button onClick={() => { navigator.clipboard.writeText(sample); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          title="Copy URL"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: copied ? "#0a5f52" : "var(--text-3)" }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/dashboard/onboarding" style={{
          padding: "11px 20px", borderRadius: 10,
          background: "linear-gradient(135deg, #0e7c6b, #0a5f52)", color: "#fff",
          fontSize: 13, fontWeight: 800, textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          Run the wizard <ArrowRight size={13} />
        </Link>
        <Link href="/dashboard/integrations" style={{
          padding: "11px 20px", borderRadius: 10,
          background: "#fff", color: "var(--text-1)",
          border: "1px solid var(--border-2)",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          Get my webhook key
        </Link>
      </div>
    </div>
  );
}

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

const STATUS_OPTS = ["All", "Pending", "Queued", "Needs Call", "Hot", "Warm", "Cold", "Call Back", "Disqualified", "Duplicate", "Error"];

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
  // Date filter: "all" | "today" | "7d" | "30d" | "90d" | "custom"
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7d" | "30d" | "90d" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState("All");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // "qualifying" = transient flag while we flip Pending→Queued and kick the chain.
  const [qualifying, setQualifying] = useState(false);

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
    setAgents(Array.from(new Set(rows.map(r => r.agent_name).filter(Boolean) as string[])).sort());
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

  // Resolve the active date-range filter into a [from, to] window in ms.
  // null on either side means "open-ended."
  const dateWindow = (() => {
    if (dateFilter === "all") return null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (dateFilter === "today") return { from: startOfToday, to: startOfToday + 86_400_000 };
    if (dateFilter === "7d")  return { from: now.getTime() - 7  * 86_400_000, to: now.getTime() };
    if (dateFilter === "30d") return { from: now.getTime() - 30 * 86_400_000, to: now.getTime() };
    if (dateFilter === "90d") return { from: now.getTime() - 90 * 86_400_000, to: now.getTime() };
    if (dateFilter === "custom") {
      // Custom from/to inputs are HTML date strings (YYYY-MM-DD), local-tz.
      const f = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : -Infinity;
      const t = dateTo   ? new Date(dateTo   + "T23:59:59").getTime() :  Infinity;
      return { from: f, to: t };
    }
    return null;
  })();

  const filtered = leads.filter(l => {
    if (statusFilter !== "All" && l.status !== statusFilter) return false;
    if (campaignFilter !== "All" && l.campaigns?.name !== campaignFilter) return false;
    if (agentFilter !== "All" && l.agent_name !== agentFilter) return false;
    if (dateWindow) {
      const ts = new Date(l.created_at).getTime();
      if (ts < dateWindow.from || ts > dateWindow.to) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(l.extracted_address || "").toLowerCase().includes(q) && !(l.agent_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendingLeads = leads.filter(l => l.status === "Pending");
  const queuedLeads = leads.filter(l => l.status === "Queued");

  // Start qualifying: flip the user's idle "Pending" leads to "Queued" and kick
  // the SERVER queue. The server processes them one-at-a-time in the background
  // (self-chaining), so it keeps running even if this tab is closed. The monitor
  // re-nudges the chain if it ever drops.
  const startQualifying = async () => {
    if (qualifying) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setQualifying(true);
    // Mark all idle Pending leads as Queued (user-initiated).
    await supabase.from("leads").update({ status: "Queued" }).eq("user_id", user.id).eq("status", "Pending");
    await load();
    // Kick the background chain.
    await fetch("/api/leads/process-next", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    }).catch(() => {});
    setQualifying(false);
  };

  const stopQualifying = async () => {
    // Park any not-yet-started Queued leads back to Pending. A lead already
    // Processing finishes; nothing new starts.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("leads").update({ status: "Pending" }).eq("user_id", user.id).eq("status", "Queued");
    await load();
  };

  const deleteLead = async (leadId: string) => {
    if (!confirm("Delete this lead and its recordings? This cannot be undone.")) return;
    setLeads(prev => prev.filter(l => l.id !== leadId)); // optimistic
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`/api/leads/${leadId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session?.access_token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { alert("Delete failed: " + (j.error || "unknown")); load(); }
  };

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Re-run AI analysis on every selected lead. Fires the analyze endpoint
  // in parallel (capped) so the queue runs through fast.
  const bulkAnalyze = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    const CONCURRENCY = 4;
    let i = 0;
    const runOne = async (id: string) => {
      await fetch("/api/leads/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id }),
      }).catch(() => {});
    };
    const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (i < ids.length) {
        const idx = i++;
        await runOne(ids[idx]);
      }
    });
    await Promise.all(workers);
    setSelected(new Set()); setSelectMode(false); setBulkBusy(false);
    await load();
  };

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

  const analyzeLead = async (leadId: string) => {
    await fetch("/api/leads/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    }).catch(() => {});
    await load();
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
            {filtered.length} call{filtered.length === 1 ? "" : "s"} graded. Tap any card for the verdict + transcript.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {pendingLeads.length > 0 && (
            <button onClick={startQualifying} disabled={qualifying} style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9,
              background: "linear-gradient(135deg, #0a5f52, #047857)", color: "#fff", border: "none",
              fontSize: 12.5, fontWeight: 800, cursor: qualifying ? "wait" : "pointer", boxShadow: "0 4px 14px rgba(10,95,82,0.32)", opacity: qualifying ? 0.7 : 1,
            }}>{qualifying ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start qualifying ({pendingLeads.length})</button>
          )}
          {queuedLeads.length > 0 && (
            <button onClick={stopQualifying} style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9,
              background: "#DC2626", color: "#fff", border: "none",
              fontSize: 12.5, fontWeight: 800, cursor: "pointer",
            }}><StopCircle size={14} /> Stop ({queuedLeads.length} queued)</button>
          )}
          <button onClick={() => { setSelectMode(m => !m); setSelected(new Set()); }} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9,
            background: selectMode ? "#0e7c6b" : "var(--surface-1)", color: selectMode ? "#fff" : "var(--text-1)",
            border: `1px solid ${selectMode ? "#0e7c6b" : "var(--border-2)"}`, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}><CheckSquare size={13} /> {selectMode ? "Done" : "Select"}</button>
          <button onClick={exportCSV} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9,
            background: "var(--surface-1)", color: "var(--text-1)", border: "1px solid var(--border-2)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}><Download size={13} /> Export CSV</button>
          <button onClick={load} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9,
            background: "#0e7c6b", color: "#fff", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(14,124,107,0.30)",
          }}><RotateCcw size={13} /> Refresh</button>
        </div>
      </div>

      {/* Background qualification banner */}
      {queuedLeads.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, background: "#ECFDF5", border: "1px solid #0a5f52", flexWrap: "wrap" }}>
          <Loader2 size={16} className="animate-spin" style={{ color: "#0a5f52" }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: "#047857" }}>
            Qualifying in the background · {queuedLeads.length} in queue
          </span>
          <span style={{ fontSize: 12.5, color: "#065F46" }}>
            Processing one lead at a time — you can leave this page, it keeps running.
          </span>
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderRadius: 12, background: "#F0F9FF", border: "1px solid #0e7c6b", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#084c42" }}>{selected.size} selected</span>
          <button onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id)))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#0a5f52", fontSize: 12.5, fontWeight: 700 }}>
            {selected.size === filtered.length ? "Clear all" : "Select all"}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={bulkAnalyze} disabled={!selected.size || bulkBusy} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9,
            background: selected.size ? "linear-gradient(135deg,#0e7c6b,#0a5f52)" : "#BAE6FD", color: "#fff", border: "none",
            fontSize: 12.5, fontWeight: 800, cursor: selected.size ? "pointer" : "not-allowed",
          }}>
            {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Analyze selected
          </button>
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
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} style={inputStyle}>
          <option value="All">All Agents</option>
          {agents.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value as typeof dateFilter)} style={inputStyle} title="Filter by date">
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="custom">Custom range…</option>
        </select>
        {dateFilter === "custom" && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              title="From" style={inputStyle} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              title="To" style={inputStyle} />
          </>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--brand-purple)", margin: "0 auto" }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyCallLibrary hasFilter={!!search || statusFilter !== "All" || campaignFilter !== "All" || agentFilter !== "All"} />
      ) : (
        <LeadsList leads={filtered.map(toItem)} newIds={newIds} onOpen={(id) => router.push(`/dashboard/leads/${id}`)} onDelete={deleteLead} onAnalyze={analyzeLead}
          selectable={selectMode} selectedIds={selected} onToggleSelect={toggleSelect} />
      )}

    </div>
  );
}
