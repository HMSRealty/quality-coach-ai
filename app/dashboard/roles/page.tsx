"use client";

// Read-only RBAC matrix. Visualizes lib/rbac.ts, which mirrors the DB
// role_permissions table that RLS enforces. UI hides; RLS is the real boundary.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can, normalizeRole, ROLE_LABELS, type Role, type Permission } from "@/lib/rbac";
import { Check, Minus, ShieldCheck } from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.text1;
const SLATE = T.text2;

const ROLES: Role[] = ["owner", "admin", "qa", "team_leader", "trainer", "caller"];
const PERMS: { key: Permission; label: string; group: string }[] = [
  { key: "leads.view", label: "View leads", group: "Leads" },
  { key: "leads.edit", label: "Edit / submit leads", group: "Leads" },
  { key: "leads.delete", label: "Delete leads", group: "Leads" },
  { key: "lead.date.override", label: "Override submission date", group: "Leads" },
  { key: "calls.play", label: "Play recordings", group: "Calls" },
  { key: "calls.download", label: "Download recordings", group: "Calls" },
  { key: "calls.upload", label: "Upload recordings", group: "Calls" },
  { key: "users.manage", label: "Manage users & teams", group: "Admin" },
  { key: "org.manage", label: "Manage organization", group: "Admin" },
];

export default function RolesPage() {
  const [myRole, setMyRole] = useState<Role | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      setMyRole(normalizeRole(data?.role));
    })();
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Roles &amp; Access</h1>
        <p style={{ fontSize: 13, color: SLATE }}>
          What each role can do. Enforced in the database (Row Level Security) — not just the UI.
          {myRole && <> Your role: <strong style={{ color: NAVY }}>{ROLE_LABELS[myRole]}</strong>.</>}
        </p>
      </div>

      <div style={{ background: T.surface1, border: "1px solid rgba(35,43,58,0.08)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(35,43,58,0.04)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: T.surface3 }}>
                <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em" }}>Permission</th>
                {ROLES.map((r) => (
                  <th key={r} style={{ padding: "12px 10px", fontSize: 11, fontWeight: 800, color: r === myRole ? "#2F6BFF" : NAVY, textAlign: "center" }}>
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMS.map((p, i) => {
                const groupStart = i === 0 || PERMS[i - 1].group !== p.group;
                return (
                  <tr key={p.key} style={{ borderTop: groupStart ? "2px solid rgba(35,43,58,0.08)" : "1px solid rgba(35,43,58,0.04)" }}>
                    <td style={{ padding: "11px 16px", fontSize: 13, color: NAVY }}>
                      {groupStart && <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{p.group}</span>}
                      {p.label}
                    </td>
                    {ROLES.map((r) => {
                      const ok = can(r, p.key);
                      return (
                        <td key={r} style={{ textAlign: "center", padding: "11px 10px", background: r === myRole ? "rgba(47,107,255,0.05)" : "transparent" }}>
                          {ok
                            ? <Check size={16} color="#059669" style={{ display: "inline" }} />
                            : <Minus size={14} color="#CBD5E1" style={{ display: "inline" }} />}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: SLATE }}>
        <ShieldCheck size={14} color="#059669" />
        Changing a user&apos;s role updates these permissions everywhere — server routes and database policies included.
      </div>
    </div>
  );
}
