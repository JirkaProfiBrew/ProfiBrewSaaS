import { db } from "@/lib/db";
import { subscriptions, plans } from "@/../drizzle/schema/subscriptions";
import { eq } from "drizzle-orm";

export async function hasModuleAccess(
  tenantId: string,
  moduleSlug: string
): Promise<boolean> {
  if (moduleSlug === "_always" || moduleSlug === "brewery") return true;

  const subs = await db
    .select({
      includedModules: plans.includedModules,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const sub = subs[0];
  if (!sub) return false;

  return sub.includedModules.includes(moduleSlug);
}
