import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { tenantUsers } from "@/../drizzle/schema/auth";
import { subscriptions, plans } from "@/../drizzle/schema/subscriptions";
import { eq, and } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TenantContextData, UserRole } from "@/lib/types";

export async function loadTenantForUser(): Promise<TenantContextData | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Find user's tenant membership
  const memberships = await db
    .select({
      tenantId: tenantUsers.tenantId,
      role: tenantUsers.role,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
    .from(tenantUsers)
    .innerJoin(tenants, eq(tenants.id, tenantUsers.tenantId))
    .where(
      and(
        eq(tenantUsers.userId, user.id),
        eq(tenantUsers.isActive, true)
      )
    )
    .limit(1);

  const membership = memberships[0];
  if (!membership) return null;

  // Load subscription + plan
  const subs = await db
    .select({
      status: subscriptions.status,
      planSlug: plans.slug,
      includedModules: plans.includedModules,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, membership.tenantId))
    .limit(1);

  const sub = subs[0];

  return {
    tenantId: membership.tenantId,
    tenantName: membership.tenantName,
    tenantSlug: membership.tenantSlug,
    userRole: membership.role as UserRole,
    subscription: {
      planSlug: sub?.planSlug ?? "free",
      modules: sub?.includedModules ?? ["brewery"],
      status: sub?.status ?? "trialing",
    },
  };
}
