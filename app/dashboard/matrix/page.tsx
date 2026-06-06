"use client";

// Matrix — single page showing the full company at a glance: managers (owners),
// callers (agents), QA, Acquisitions, Trainers, Team Leaders.
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import {
  Crown, Users2, ShieldCheck, Briefcase, Flag, PhoneCall, Search, Loader2, Mail, Building2,
} from "lucide-react";

const NAVY = T.navy;
const SLATE = T.slate;

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  parent_user_id: string | null;
  shift_type: "part_time" | "full_time" | null;
  daily_target: number | null;
}
interface Agent {
  id: string; name: string; email: string | null; phone: string | null;
  team_id: string | null; shift_type: "part_time" | "full_time" | null; daily_target: number | null;
  is_active: boolean | null;
}
interface Team { id: string; name: string; leader_id: string | null }

const BUCKETS = [
  { key: "manager",      label: "Managers",       icon: Crown,        accent: "#D946EF" },
  { key: "team_leader",  label: "Team Leaders",   icon: Flag,         accent: "#F59E0B" },
  { key: "acquisitions", label: "Acquisitions",   icon: Building2,    accent: "#10B981" },
  { key: "qa",           label: "Quality (QA)",   icon: ShieldCheck,  accent: "#0284C7" },
  { key: "trainer",      label: "Trainers",       icon: Briefcase,    accent: "#7C3AED" },
  { key: "caller",       label: "Callers",        icon: PhoneCall,    accent: "#F2266F" },
] as const;
type BucketKey = (typeof BUCKETS)[number]["key"];

function bucketOf(p: Profile): BucketKey {
  const r = (p.role || "").toLowerCase();
  if (!p.parent_user_id || r === "owner" || r === "admin") return "manager";
  if (r === "team_leader" || r === "team leader") return "team_leader";
  if (r === "qa") return "qa";
  if (r === "acquisitions" || r === "acq") return "acquisitions";
  if (r === "trainer") return "trainer";
  return "caller";
}
const initials = (s: string) => (s || "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

export default function MatrixPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: me } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      const org = me?.organization_id as string | null;
      const pq = supabase.from("profiles").select("id, email, full_name, role, parent_user_id, shift_type, daily_target");
      const { data: p } = org ? await pq.eq("organization_id", org) : await pq;
      setProfiles((p || []) as Profile[]);

      const { data: ag } = await supabase.from("cold_callers")
        .select("id, name, email, phone, team_id, shift_type, daily_target, is_active")
        .eq("user_id", user.id);
      setAgents((ag || []) as Agent[]);

      const { data: t } = await supabase.from("teams").select("id, name, leader_id").eq("manager_id", user.id);
      setTeams((t || []) as Team[]);
      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const out: Record<BucketKey, Array<Profile & { _bucket: BucketKey }>> = {
      manager: [], team_leader: [], acquisitions: [], qa: [], trainer: [], caller: [],
    };
    for (const p of profiles) {
      const b = bucketOf(p);
      out[b].push({ ...p, _bucket: b });
    }
    // Add cold_callers as additional callers (they're real agents, not profiles).
    for (const a of agents) {
      out.caller.push({
        id: a.id, email: a.email || "", full_name: a.name, role: "caller",
        parent_user_id: "agent", shift_type: a.shift_type, daily_target: a.daily_target,
        _bucket: "caller",
      });
    }
    return out;
  }, [profiles, agents]);

  const filterFn = (s: string) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [s].some(() => false) || (s.toLowerCase().includes(q));
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>Company Matrix</h1>
          <p style={{ fontSize: 13, color: SLATE }}>
            Full org view: managers, callers, QA, acquisitions, trainers, team leaders — all in one snapshot.
          </p>
        </div>
        <div style={{ position: "relative", maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by name or email…"
            style={{
              padding: "9px 12px 9px 36px", borderRadius: 10,
              background: "var(--surface-1)", border: "1px solid var(--border-2)",
              fontSize: 13, color: "var(--text-1)", outline: "none", width: 280,
            }} />
        </div>
      </div>

      {/* Summary chips */}
      <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {BUCKETS.map((b) => {
          const Icon = b.icon;
          const count = grouped[b.key].length;
          return (
            <div key={b.key} style={{
              background: "var(--surface-1)", border: "1px solid var(--border-2)",
              borderRadius: 14, padding: 16, position: "relative", overflow: "hidden",
            }}>
              <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: b.accent }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${b.accent}22`, color: b.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}><Icon size={14} /></span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: SLATE, textTransform: "uppercase" }}>{b.label}</span>
              </div>
              <p style={{ fontSize: 28, fontWeight: 900, color: NAVY, lineHeight: 1 }}>{count}</p>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={24} className="animate-spin" style={{ color: NAVY }} /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {BUCKETS.map((b) => {
            const Icon = b.icon;
            const list = grouped[b.key].filter(p => filterFn((p.full_name || p.email || "")));
            return (
              <div key={b.key} className="reveal" style={{
                background: "var(--surface-1)", border: "1px solid var(--border-2)",
                borderRadius: 16, overflow: "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "14px 16px", borderBottom: "1px solid var(--border-1)",
                  background: `${b.accent}10`,
                }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 9,
                    background: b.accent, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}><Icon size={15} /></span>
                  <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, flex: 1 }}>{b.label}</p>
                  <span style={{ fontSize: 12, fontWeight: 800, color: b.accent, background: `${b.accent}22`, padding: "2px 9px", borderRadius: 999 }}>{list.length}</span>
                </div>
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                  {list.length === 0 ? (
                    <p style={{ fontSize: 12, color: T.text3 as string, textAlign: "center", padding: 14 }}>—</p>
                  ) : list.map((p) => (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 9, background: "var(--surface-3)",
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: b.accent, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, flexShrink: 0,
                      }}>{initials(p.full_name || p.email)}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.full_name || p.email}
                        </p>
                        {p.full_name && p.email && (
                          <p style={{ fontSize: 10.5, color: SLATE, display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                            <Mail size={9} /> {p.email}
                          </p>
                        )}
                      </div>
                      {p.daily_target != null && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: SLATE, background: "var(--surface-1)", padding: "2px 8px", borderRadius: 999 }}>
                          {p.daily_target}/d
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Teams */}
      {teams.length > 0 && (
        <div className="reveal" style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, padding: 18 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Users2 size={16} color={T.magenta as string} /> Teams ({teams.length})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {teams.map((t) => {
              const leader = profiles.find(p => p.id === t.leader_id);
              return (
                <div key={t.id} style={{ padding: 12, borderRadius: 12, background: "var(--surface-3)", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>{t.name}</p>
                  <p style={{ fontSize: 11, color: SLATE, marginTop: 4 }}>
                    Leader: {leader?.full_name || leader?.email || "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
