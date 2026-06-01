"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, ToggleLeft, ToggleRight, FolderCog, Loader2, ChevronRight, Zap, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card } from "@/app/_components/Card";
import { CampaignCSVImport } from "@/app/_components/CampaignCSVImport";

interface Campaign {
  id: string;
  name: string;
  custom_rules: string;
  is_active: boolean;
  created_at: string;
  user_id: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  background: "var(--surface-3)", border: "1px solid var(--border-2)",
  borderRadius: "var(--r-md)", fontSize: 13, color: "var(--text-1)",
  fontFamily: "var(--font-sans)",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName]           = useState("");
  const [rules, setRules]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [expandedId, setExpanded] = useState<string | null>(null);
  const [currentUserId, setUserId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);

    // RLS will automatically scope this to the current user's campaigns
    // (including ones admin assigned to them via user_id match)
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setCampaigns(data as Campaign[]);
    setLoading(false);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Not authenticated."); setSaving(false); return; }

    const { error } = await supabase.from("campaigns").insert({
      user_id: user.id,
      name,
      custom_rules: rules,
      is_active: true,
    });

    if (error) {
      alert("Failed to create campaign: " + error.message);
    } else {
      setName("");
      setRules("");
      loadAll();
    }
    setSaving(false);
  };

  const toggle = async (id: string, cur: boolean) => {
    const { error } = await supabase
      .from("campaigns")
      .update({ is_active: !cur })
      .eq("id", id);
    if (error) { alert(error.message); return; }
    setCampaigns(p => p.map(c => c.id === id ? { ...c, is_active: !cur } : c));
  };

  const del = async (id: string) => {
    if (!confirm("Delete this campaign? Associated call data will remain.")) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setCampaigns(p => p.filter(c => c.id !== id));
  };

  const active   = campaigns.filter(c => c.is_active).length;
  const inactive = campaigns.filter(c => !c.is_active).length;
  // Campaigns where user_id !== currentUserId were assigned by admin
  const myOwn    = campaigns.filter(c => c.user_id === currentUserId);
  const assigned = campaigns.filter(c => c.user_id !== currentUserId);


  const CampaignCard = ({ c, isAssigned }: { c: Campaign; isAssigned: boolean }) => (
    <Card key={c.id}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: "var(--r-md)", flexShrink: 0,
          background: isAssigned
            ? "var(--violet-dim)"
            : (c.is_active ? "var(--brand-dim)" : "var(--surface-4)"),
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isAssigned
            ? <ShieldCheck size={16} color="var(--violet)" />
            : <FolderCog size={16} color={c.is_active ? "var(--brand-400)" : "var(--text-3)"} />
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{c.name}</p>

            {/* Active/paused badge */}
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: "var(--r-full)",
              background: c.is_active ? "var(--emerald-dim)" : "var(--surface-4)",
              color: c.is_active ? "var(--emerald)" : "var(--text-3)",
              fontSize: 10, fontWeight: 700,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor" }} />
              {c.is_active ? "Active" : "Paused"}
            </span>

            {/* Admin-assigned badge */}
            {isAssigned && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: "var(--r-full)",
                background: "var(--violet-dim)",
                color: "var(--violet)",
                fontSize: 10, fontWeight: 700,
              }}>
                <ShieldCheck size={9} /> Admin assigned
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-3)" }}>
            {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
            {c.custom_rules.split("\n").filter(l => l.trim()).length} rules
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link href="/dashboard/analyze" style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 10px", borderRadius: "var(--r-md)",
            background: "var(--brand-dim)", border: "1px solid var(--border-brand)",
            color: "var(--brand-300)", fontSize: 11, fontWeight: 600, textDecoration: "none",
          }}>
            <Zap size={11} /> Run
          </Link>
          <button
            onClick={() => toggle(c.id, c.is_active)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 10px", borderRadius: "var(--r-md)",
              background: "var(--surface-3)", border: "1px solid var(--border-2)",
              color: c.is_active ? "var(--rose-lt)" : "var(--emerald)",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            {c.is_active
              ? <><ToggleRight size={13} /> Pause</>
              : <><ToggleLeft size={13} /> Activate</>
            }
          </button>
          <button
            onClick={() => setExpanded(expandedId === c.id ? null : c.id)}
            style={{
              padding: "6px 8px", borderRadius: "var(--r-md)",
              background: "none", border: "1px solid var(--border-2)",
              color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center",
            }}
            title="View rules"
          >
            <ChevronRight size={13} style={{
              transform: expandedId === c.id ? "rotate(90deg)" : "none",
              transition: "transform 150ms",
            }} />
          </button>
          {/* Only allow deleting own campaigns */}
          {!isAssigned && (
            <button
              onClick={() => del(c.id)}
              style={{
                padding: "6px 8px", borderRadius: "var(--r-md)",
                background: "none", border: "1px solid var(--border-2)",
                color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--rose-dim)"; e.currentTarget.style.color = "var(--rose-lt)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-3)"; }}
              title="Delete campaign"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded rules */}
      {expandedId === c.id && (
        <div style={{
          margin: "0 16px 16px",
          padding: "14px 16px",
          background: "var(--surface-3)", borderRadius: "var(--r-md)",
          border: "1px solid var(--border-1)",
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
          }}>
            Qualification Rules
          </p>
          <p style={{
            fontSize: 12, color: "var(--text-2)", lineHeight: 1.75,
            fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap",
          }}>
            {c.custom_rules}
          </p>
        </div>
      )}
    </Card>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">

      <CampaignCSVImport onImported={loadAll} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 4 }}>Campaigns</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Define custom AI qualification rules for different call types.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: `${active} Active`,   color: "var(--emerald)" },
            { label: `${inactive} Paused`, color: "var(--text-3)" },
          ].map(({ label, color }) => (
            <span key={label} style={{
              padding: "5px 12px", borderRadius: "var(--r-full)",
              background: "var(--surface-3)", border: "1px solid var(--border-2)",
              fontSize: 12, fontWeight: 600, color,
            }}>{label}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>

        {/* ── Create form ── */}
        <Card style={{ padding: 22 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
            paddingBottom: 16, borderBottom: "1px solid var(--border-1)",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "var(--r-md)",
              background: "var(--brand-dim)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={16} color="var(--brand-400)" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>New Campaign</p>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>Define rules for AI scoring</p>
            </div>
          </div>

          <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-3)",
                marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                Campaign Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Texas Cash Buyer Leads"
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-3)",
                marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                AI Qualification Rules
              </label>
              <textarea
                value={rules}
                onChange={e => setRules(e.target.value)}
                placeholder={"- Mark as Hot Lead if seller must sell within 30 days\n- Asking price must be under $200,000\n- Flag if seller mentions bankruptcy or foreclosure\n- Disqualify if property is outside target market"}
                required
                rows={8}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7, minHeight: 160 } as React.CSSProperties}
              />
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                Plain English. One rule per line. The AI applies these exactly.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "11px 16px", borderRadius: "var(--r-md)",
                background: saving ? "var(--brand-dim)" : "var(--brand-500)",
                color: saving ? "var(--brand-400)" : "#fff",
                fontSize: 13, fontWeight: 600, border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: saving ? "none" : "0 2px 8px var(--brand-glow)",
                transition: "all 150ms",
              }}
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Creating...</>
                : <><Plus size={14} /> Create Campaign</>
              }
            </button>
          </form>
        </Card>

        {/* ── Campaign list ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} style={{ height: 80, borderRadius: "var(--r-lg)" }} className="skeleton" />
            ))
          ) : campaigns.length === 0 ? (
            <Card style={{ padding: "60px 32px", textAlign: "center" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--surface-4)", margin: "0 auto 18px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <FolderCog size={26} color="var(--text-3)" />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>
                No campaigns yet
              </p>
              <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.65, maxWidth: 320, margin: "0 auto" }}>
                Create your first campaign using the form, or ask your admin to assign one to you.
              </p>
            </Card>
          ) : (
            <>
              {/* Admin-assigned campaigns */}
              {assigned.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={13} color="var(--violet)" />
                    <p style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                      color: "var(--violet)", textTransform: "uppercase",
                    }}>
                      Assigned by Admin ({assigned.length})
                    </p>
                  </div>
                  {assigned.map(c => (
                    <CampaignCard key={c.id} c={c} isAssigned={true} />
                  ))}
                </div>
              )}

              {/* Divider if both sections exist */}
              {assigned.length > 0 && myOwn.length > 0 && (
                <div style={{ height: 1, background: "var(--border-1)", margin: "4px 0" }} />
              )}

              {/* My own campaigns */}
              {myOwn.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {assigned.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FolderCog size={13} color="var(--brand-400)" />
                      <p style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                        color: "var(--brand-400)", textTransform: "uppercase",
                      }}>
                        My Campaigns ({myOwn.length})
                      </p>
                    </div>
                  )}
                  {myOwn.map(c => (
                    <CampaignCard key={c.id} c={c} isAssigned={false} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
