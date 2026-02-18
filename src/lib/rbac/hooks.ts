"use client";

import { useTenantContext } from "@/components/providers/TenantProvider";
import { hasPermission } from "./check";
import type { Permission } from "./types";

/**
 * Check if the current user has a specific permission.
 * Uses the tenant context to get the user's role.
 *
 * @example
 * const canCreate = usePermission("items.create");
 * // Hide create button if user can't create
 * {canCreate && <Button>+ Item</Button>}
 */
export function usePermission(permission: Permission): boolean {
  const { userRole } = useTenantContext();
  return hasPermission(userRole, permission);
}

/**
 * Check multiple permissions at once.
 *
 * @example
 * const { canCreate, canDelete } = usePermissions({
 *   canCreate: "items.create",
 *   canDelete: "items.delete",
 * });
 */
export function usePermissions<T extends Record<string, Permission>>(
  permissions: T
): Record<keyof T, boolean> {
  const { userRole } = useTenantContext();

  const result = {} as Record<keyof T, boolean>;
  for (const [key, permission] of Object.entries(permissions)) {
    result[key as keyof T] = hasPermission(userRole, permission);
  }

  return result;
}
