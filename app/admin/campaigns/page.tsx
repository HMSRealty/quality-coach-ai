"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import { CampaignCSVImport } from "@/app/_components/CampaignCSVImport";
import { FolderCog, Loader2, Search } from "lucide-react";

const NAVY = "#0B0F19";
const SLATE = "#4B5563";

interface Campaign {
  id: string;
  name: string;
  rules: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("id, email");
    const map: Record<string, string> = {};
    (profiles || []).forEach((p: { id: string; email: string }) => { map[p.id] = p.email; });
    setUsers(map);

    const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
    setCampaigns((data || []) as Campaign[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
            background: "#FFF", border: "1px solid rgba(11,15,25,0.10)",
            fontSize: 13, color: NAVY, outline: "none",
          }} />
      </div>

      <Card padding={0}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(11,15,25,0.06)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Campaigns ({filtered.length})</h3>
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
              <tr style={{ background: "#F7F8FA" }}>
                {["Name", "Owner", "Status", "Rules Preview"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid rgba(11,15,25,0.05)" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: NAVY, fontWeight: 700 }}>{c.name}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: SLATE }}>{users[c.user_id] || c.user_id.slice(0, 8)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: c.is_active ? "#ECFDF5" : "#F1F4F9",
                      color: c.is_active ? "#059669" : SLATE,
                    }}>{c.is_active ? "Active" : "Paused"}</span>
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
