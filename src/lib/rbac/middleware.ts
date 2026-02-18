"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { tenantUsers } from "@/../drizzle/schema/auth";
import { eq, and } from "drizzle-orm";
import { hasPermission } from "./check";
import type { UserRole } from "@/lib/types";
import type { Permission } from "./types";

export class ForbiddenError extends Error {
  constructor(message: string = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Wrap a server action with permission check.
 * Resolves the user's role from the session, checks against the permission matrix,
 * and throws ForbiddenError if the user doesn't have the required permission.
 *
 * @example
 * export async function createItem(data: ItemCreate) {
 *   return withPermission("items.create", async () => {
 *     // ... implementation
 *   });
 * }
 */
export async function withPermission<T>(
  permission: Permission,
  action: () => Promise<T>
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new ForbiddenError("Not authenticated");
  }

  // Get user's role in their active tenant
  const memberships = await db
    .select({ role: tenantUsers.role })
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.userId, user.id),
        eq(tenantUsers.isActive, true)
      )
    )
    .limit(1);

  const membership = memberships[0];
  if (!membership) {
    throw new ForbiddenError("No tenant membership");
  }

  const userRole = membership.role as UserRole;

  if (!hasPermission(userRole, permission)) {
    throw new ForbiddenError(
      `Role "${userRole}" does not have permission "${permission}"`
    );
  }

  return action();
}
