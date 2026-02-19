/**
 * RBAC permission matrix stub.
 * Full implementation in Sprint 6 — this file defines the type-safe structure.
 */

export type Role = "owner" | "admin" | "manager" | "brewer" | "viewer";

export type Permission = "create" | "read" | "update" | "delete";

export interface AgendaPermissions {
  agenda: string;
  permissions: Permission[];
}

/**
 * Default RBAC matrix — maps role to allowed permissions per agenda.
 * owner/admin have full access to everything (not listed explicitly).
 */
export const defaultPermissions: Record<Role, AgendaPermissions[]> = {
  owner: [],
  admin: [],
  manager: [
    { agenda: "*", permissions: ["create", "read", "update"] },
  ],
  brewer: [
    { agenda: "batches", permissions: ["create", "read", "update"] },
    { agenda: "recipes", permissions: ["create", "read", "update"] },
    { agenda: "equipment", permissions: ["read", "update"] },
    { agenda: "materials", permissions: ["read"] },
  ],
  viewer: [
    { agenda: "*", permissions: ["read"] },
  ],
};

/** Check if a role has full access (bypasses per-agenda checks) */
export function hasFullAccess(role: Role): boolean {
  return role === "owner" || role === "admin";
}
