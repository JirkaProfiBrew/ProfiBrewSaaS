import { createServerSupabaseClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { tenantUsers } from "@/../drizzle/schema/auth";
import { eq, and } from "drizzle-orm";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

async function getCurrentTenantId(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AuthError("Not authenticated");

  const memberships = await db
    .select({ tenantId: tenantUsers.tenantId })
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.userId, user.id),
        eq(tenantUsers.isActive, true)
      )
    )
    .limit(1);

  const membership = memberships[0];
  if (!membership) throw new AuthError("No tenant context");

  return membership.tenantId;
}

/**
 * Wraps a DB operation with automatic tenant_id injection.
 * Every DB query in tenant-scoped modules MUST go through this function.
 */
export async function withTenant<T>(
  fn: (tenantId: string) => Promise<T>
): Promise<T> {
  const tenantId = await getCurrentTenantId();
  return fn(tenantId);
}
