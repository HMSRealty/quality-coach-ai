"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { CampaignCSVImport } from "@/app/_components/CampaignCSVImport";
import { FolderCog, Loader2, Search, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { T } from "@/app/_components/tokens";

const NAVY = T.text1;
const SLATE = T.text2;

interface Campaign {
  id: string;
  name: string;
  rules: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
}

interface Owner { id: string; email: string; full_name?: string | null }

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").order("email");
    const all = (profiles || []) as Owner[];
    setOwners(all);
    const map: Record<string, string> = {};
    all.forEach((p) => { map[p.id] = p.full_name || p.email; });
    setUsers(map);

    const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
    setCampaigns((data || []) as Campaign[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reassign = async (campaignId: string, newOwnerId: string) => {
    if (!newOwnerId) return;
    setSavingId(campaignId);
    const { error } = await supabase.from("campaigns").update({ user_id: newOwnerId }).eq("id", campaignId);
    setSavingId(null);
    if (error) return showToast(false, error.message);
    setCampaigns((p) => p.map((c) => c.id === campaignId ? { ...c, user_id: newOwnerId } : c));
    showToast(true, `Assigned to ${users[newOwnerId] || "user"}`);
  };

  const toggleActive = async (c: Campaign) => {
    setSavingId(c.id);
    const next = !c.is_active;
    const { error } = await supabase.from("campaigns").update({ is_active: next }).eq("id", c.id);
    setSavingId(null);
    if (error) return showToast(false, error.message);
    setCampaigns((p) => p.map((x) => x.id === c.id ? { ...x, is_active: next } : x));
  };

  const filtered = campaigns.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (users[c.user_id] || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>All Campaigns</h1>
        <p style={{ fontSize: 13, color: SLATE }}>Owner view — every campaign across the workspace.</p>
      </div>

      <CampaignCSVImport onImported={load} />

      <div style={{ position: "relative", maxWidth: 380 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or owner..."
          style={{
            width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10,
            background: T.surface1, border: "1px solid rgba(35,43,58,0.10)",
            fontSize: 13, color: NAVY, outline: "none",
          }} />
      </div>

      {toast && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, display: "flex", gap: 8, alignItems: "center",
          background: toast.ok ? "#ECFDF5" : "#FBEEE8",
          color: toast.ok ? "#0a5f52" : "#DC2626",
          fontSize: 13, fontWeight: 600, border: `1px solid ${toast.ok ? "#A7F3D0" : "#FBCFBE"}`,
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}

      <Card padding={0}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(35,43,58,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Campaigns ({filtered.length})</h3>
          <p style={{ fontSize: 11, color: SLATE }}>Use the “Assign to” dropdown per row to reassign a campaign to any user.</p>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Loader2 size={22} className="animate-spin" style={{ color: NAVY, margin: "0 auto" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: SLATE }}>
            <FolderCog size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No campaigns.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.surface3 }}>
                {["Campaign", "Current owner", "Assign to", "Status", "Rules preview"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid rgba(35,43,58,0.05)" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: NAVY, fontWeight: 700 }}>{c.name}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: SLATE }}>{users[c.user_id] || c.user_id.slice(0, 8)}</td>
                  <td style={{ padding: "12px 16px", minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ArrowRight size={12} color={T.teal} />
                      <select
                        defaultValue=""
                        disabled={savingId === c.id}
                        onChange={(e) => reassign(c.id, e.target.value)}
                        style={{
                          flex: 1, padding: "7px 10px", borderRadius: 8,
                          background: T.surface1, border: `1px solid ${T.border2}`,
                          fontSize: 12, color: NAVY, outline: "none", cursor: "pointer",
                        }}>
                        <option value="">— pick a user —</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id} disabled={o.id === c.user_id}>
                            {o.full_name ? `${o.full_name} (${o.email})` : o.email}
                          </option>
                        ))}
                      </select>
                      {savingId === c.id && <Loader2 size={12} className="animate-spin" style={{ color: NAVY }} />}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button onClick={() => toggleActive(c)} disabled={savingId === c.id} style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: c.is_active ? "#ECFDF5" : T.surface3,
                      color: c.is_active ? "#0a5f52" : SLATE,
                      border: "none", cursor: "pointer",
                    }}>{c.is_active ? "Active" : "Paused"}</button>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: SLATE, maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.rules || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
