// lib/rbac.ts
// ---------------------------------------------------------------------------
// Single source of truth for the permission matrix on the CLIENT/SERVER (TS).
// It MIRRORS public.role_permissions in the database (0001_schema.sql).
// Rule of thumb:
//   • RLS in Postgres is the real security boundary (cannot be bypassed by a
//     crafted client).
//   • This matrix drives the UI (hide buttons) and server-route guards, so the
//     experience matches what RLS will allow. Keep the two in sync.
// ---------------------------------------------------------------------------

export type Role = "owner" | "admin" | "qa" | "trainer" | "team_leader" | "caller";

export type Permission =
  | "leads.view"
  | "leads.edit"
  | "leads.delete"
  | "calls.play"
  | "calls.download"
  | "calls.upload"
  | "lead.date.override"
  | "users.manage"
  | "org.manage";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  qa: "QA Specialist",
  trainer: "Trainer",
  team_leader: "Team Leader",
  caller: "Caller",
};

export const ROLE_RANK: Record<Role, number> = {
  owner: 60, admin: 50, qa: 40, trainer: 30, team_leader: 20, caller: 10,
};

const MATRIX: Record<Role, Permission[]> = {
  owner:       ["leads.view", "leads.edit", "leads.delete", "calls.play", "calls.download", "calls.upload", "lead.date.override", "users.manage", "org.manage"],
  admin:       ["leads.view", "leads.edit", "leads.delete", "calls.play", "calls.download", "calls.upload", "lead.date.override", "users.manage"],
  qa:          ["leads.view", "leads.edit", "calls.play", "calls.download", "calls.upload", "lead.date.override"],
  trainer:     ["leads.view", "calls.play"],
  team_leader: ["leads.view", "leads.edit", "calls.play"],
  // callers SUBMIT leads in this product, so they need leads.edit.
  caller:      ["leads.view", "leads.edit", "calls.play", "calls.upload"],
};

const SETS: Record<Role, Set<Permission>> = Object.fromEntries(
  (Object.entries(MATRIX) as [Role, Permission[]][]).map(([r, perms]) => [r, new Set(perms)]),
) as Record<Role, Set<Permission>>;

/**
 * Map a raw profiles.role string (incl. the legacy "user"/"admin" the live app
 * still writes) to a typed Role. Mirror of current_app_role() in 0002_rls.sql.
 */
export function normalizeRole(raw: string | null | undefined): Role {
  switch ((raw ?? "").toLowerCase().replace(/\s+/g, "_")) {
    case "owner": return "owner";
    case "admin": return "admin";
    case "qa": return "qa";
    case "trainer": return "trainer";
    case "team_leader": return "team_leader";
    case "caller": return "caller";
    case "user": return "caller"; // legacy: regular user => caller
    default: return "caller";
  }
}

/** Does this role hold the permission? */
export function can(role: Role | null | undefined, perm: Permission): boolean {
  return !!role && SETS[role]?.has(perm) === true;
}

/** Throw if the role lacks the permission (use at the top of server routes). */
export function assertCan(role: Role | null | undefined, perm: Permission): void {
  if (!can(role, perm)) throw new Error(`Forbidden: missing permission "${perm}"`);
}

/** A role may manage another only if strictly higher in rank. */
export function canManageRole(actor: Role | null | undefined, target: Role): boolean {
  return !!actor && can(actor, "users.manage") && ROLE_RANK[actor] > ROLE_RANK[target];
}

/** The Phase-1 spec table, derived from the matrix (for the Permissions screen). */
export const PERMISSION_TABLE = (Object.keys(MATRIX) as Role[]).map((role) => ({
  role,
  label: ROLE_LABELS[role],
  viewLeads: can(role, "leads.view"),
  editLeads: can(role, "leads.edit"),
  playCalls: can(role, "calls.play"),
  downloadCalls: can(role, "calls.download"),
}));
