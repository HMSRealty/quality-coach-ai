"use client";

// <Can> — declarative UI permission gate. Render children only when the
// current role holds the permission. Mirror of the server-side assertCan().
//   <Can role={role} perm="calls.download"><DownloadBtn/></Can>
import { can, type Permission, type Role } from "@/lib/rbac";

export function Can({
  role,
  perm,
  children,
  fallback = null,
}: {
  role: Role | null | undefined;
  perm: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return <>{can(role, perm) ? children : fallback}</>;
}
