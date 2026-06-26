"use client";

// Admin RBAC editor — view and edit role permissions.
// Changes here update the in-memory display and can be exported as a
// reference table. The real enforcement lives in Postgres RLS policies;
// this page acts as a configuration reference and documentation tool.
import { useState } from "react";
import { Shield, Check, X, Save } from "lucide-react";

type Role = "owner" | "admin" | "qa" | "trainer" | "team_leader" | "caller";
type Permission =
  | "leads.view" | "leads.edit" | "leads.delete"
  | "calls.play" | "calls.download" | "calls.upload"
  | "lead.date.override" | "users.manage" | "org.manage";

const ROLES: { key: Role; label: string }[] = [
  { key: "owner",       label: "Owner" },
  { key: "admin",       label: "Admin" },
  { key: "qa",          label: "QA Specialist" },
  { key: "trainer",     label: "Trainer" },
  { key: "team_leader", label: "Team Leader" },
  { key: "caller",      label: "Caller" },
];

const PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: "leads.view",          label: "View Leads",         group: "Leads" },
  { key: "leads.edit",          label: "Edit Leads",         group: "Leads" },
  { key: "leads.delete",        label: "Delete Leads",       group: "Leads" },
  { key: "lead.date.override",  label: "Date Override",      group: "Leads" },
  { key: "calls.play",          label: "Play Calls",         group: "Calls" },
  { key: "calls.download",      label: "Download Calls",     group: "Calls" },
  { key: "calls.upload",        label: "Upload Calls",       group: "Calls" },
  { key: "users.manage",        label: "Manage Users",       group: "Admin" },
  { key: "org.manage",          label: "Org Settings",       group: "Admin" },
];

const DEFAULT_MATRIX: Record<Role, Permission[]> = {
  owner:       ["leads.view","leads.edit","leads.delete","calls.play","calls.download","calls.upload","lead.date.override","users.manage","org.manage"],
  admin:       ["leads.view","leads.edit","leads.delete","calls.play","calls.download","calls.upload","lead.date.override","users.manage"],
  qa:          ["leads.view","leads.edit","calls.play","calls.download","calls.upload","lead.date.override"],
  trainer:     ["leads.view","calls.play"],
  team_leader: ["leads.view","leads.edit","calls.play"],
  caller:      ["leads.view","leads.edit","calls.play","calls.upload"],
};

// Build initial state as a flat map: "role:perm" → boolean
function buildState(matrix: Record<Role, Permission[]>): Record<string, boolean> {
  const s: Record<string, boolean> = {};
  for (const role of ROLES) {
    for (const perm of PERMISSIONS) {
      s[`${role.key}:${perm.key}`] = matrix[role.key].includes(perm.key);
    }
  }
  return s;
}

const SKY_600 = "#2563EB";
const MONEY = "#2563EB";

export default function AdminRbacPage() {
  const [matrix, setMatrix] = useState(() => buildState(DEFAULT_MATRIX));
  const [saved, setSaved] = useState(false);

  const toggle = (role: Role, perm: Permission) => {
    // Owner always keeps full access — don't allow removing from owner.
    if (role === "owner") return;
    setMatrix(m => ({ ...m, [`${role}:${perm}`]: !m[`${role}:${perm}`] }));
    setSaved(false);
  };

  const handleSave = () => {
    // In a full implementation this would persist to DB / environment.
    // For now, acknowledge the save visually.
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Group permissions by their group label.
  const groups = Array.from(new Set(PERMISSIONS.map(p => p.group)));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#F4F4FF", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <Shield size={22} color={SKY_600} /> RBAC Matrix
          </h1>
          <p style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>
            Role-Based Access Control — edit permissions per role. <strong>Owner</strong> permissions are locked.
          </p>
        </div>
        <button
          onClick={handleSave}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
            background: saved ? MONEY : SKY_600, color: "#fff",
            fontSize: 13, fontWeight: 800,
            boxShadow: `0 4px 14px color-mix(in srgb, ${saved ? MONEY : SKY_600} 40%, transparent)`,
            transition: "background 250ms ease",
          }}>
          {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      <div style={{ background: "#0A0A0E", border: "1px solid #22222c", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "#101018" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A9AB0", borderBottom: "2px solid #22222c", minWidth: 160 }}>
                  Permission
                </th>
                {ROLES.map(r => (
                  <th key={r.key} style={{ padding: "12px 16px", textAlign: "center", fontSize: 11, fontWeight: 800, color: "#F4F4FF", borderBottom: "2px solid #22222c", whiteSpace: "nowrap", minWidth: 100 }}>
                    {r.label}
                    {r.key === "owner" && <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>locked</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <>
                  <tr key={`g-${group}`}>
                    <td colSpan={ROLES.length + 1} style={{ padding: "10px 16px 4px", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: SKY_600, background: "#0d1626", borderTop: "1px solid #22222c", borderBottom: "1px solid #22222c" }}>
                      {group}
                    </td>
                  </tr>
                  {PERMISSIONS.filter(p => p.group === group).map((perm, pi) => (
                    <tr key={perm.key} style={{ borderBottom: "1px solid #101018", background: pi % 2 === 0 ? "#fff" : "#0A0A0E" }}>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: "#F4F4FF", fontWeight: 600 }}>
                        {perm.label}
                        <span style={{ display: "block", fontSize: 10, color: "#94A3B8", fontFamily: "var(--font-mono)", marginTop: 1 }}>{perm.key}</span>
                      </td>
                      {ROLES.map(role => {
                        const hasIt = matrix[`${role.key}:${perm.key}`];
                        const isLocked = role.key === "owner";
                        return (
                          <td key={role.key} style={{ padding: "11px 16px", textAlign: "center" }}>
                            <button
                              onClick={() => toggle(role.key, perm.key)}
                              disabled={isLocked}
                              title={isLocked ? "Owner permissions are locked" : `Toggle ${perm.label} for ${role.label}`}
                              style={{
                                width: 30, height: 30, borderRadius: 8, border: "none", cursor: isLocked ? "default" : "pointer",
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                background: hasIt ? (isLocked ? "#D1FAE5" : "color-mix(in srgb, #2563EB 15%, transparent)") : "#101018",
                                color: hasIt ? MONEY : "#33333f",
                                transition: "all 150ms ease",
                                opacity: isLocked ? 0.8 : 1,
                              }}>
                              {hasIt ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2} />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
        <strong style={{ color: "#9A9AB0" }}>Note:</strong> This matrix controls the UI experience. The authoritative security boundary is enforced by Postgres Row-Level Security policies. Update your <code style={{ background: "#101018", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>0002_rls.sql</code> migration to change RLS rules for real enforcement.
      </p>
    </div>
  );
}
