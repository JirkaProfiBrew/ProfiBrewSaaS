"use server";

import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { subscriptions, plans } from "@/../drizzle/schema/subscriptions";
import { billingEvents } from "@/../drizzle/schema/billing";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

interface ActionSuccess {
  success: true;
}

interface ActionError {
  error: string;
}

type ActionResult = ActionSuccess | ActionError;

export async function confirmConversion(planSlug: string): Promise<ActionResult> {
  try {
    const tenantData = await loadTenantForUser();
    if (!tenantData) return { error: "NOT_AUTHENTICATED" };

    // Load plan by slug
    const planRows = await db
      .select({
        id: plans.id,
        slug: plans.slug,
        basePrice: plans.basePrice,
      })
      .from(plans)
      .where(eq(plans.slug, planSlug))
      .limit(1);

    const plan = planRows[0];
    if (!plan) return { error: "PLAN_NOT_FOUND" };

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const nowDate = now.toISOString().split("T")[0];
    const periodEndDate = periodEnd.toISOString().split("T")[0];

    // Update subscription
    await db
      .update(subscriptions)
      .set({
        status: "pending_payment",
        planId: plan.id,
        currentPeriodStart: nowDate,
        currentPeriodEnd: periodEndDate,
        updatedAt: now,
      })
      .where(eq(subscriptions.tenantId, tenantData.tenantId));

    // Update tenant
    await db
      .update(tenants)
      .set({
        conversionModalShownAt: now,
        updatedAt: now,
      })
      .where(eq(tenants.id, tenantData.tenantId));

    // Insert billing event
    await db.insert(billingEvents).values({
      tenantId: tenantData.tenantId,
      type: "conversion_confirmed",
      planSlug: plan.slug,
      amount: plan.basePrice,
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("confirmConversion error:", err);
    return { error: "CONVERSION_FAILED" };
  }
}

export async function changeTrialPlan(newPlanSlug: string): Promise<ActionResult> {
  try {
    const tenantData = await loadTenantForUser();
    if (!tenantData) return { error: "NOT_AUTHENTICATED" };

    // Load current subscription
    const subRows = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
        originalTrialPlanSlug: subscriptions.originalTrialPlanSlug,
        planId: subscriptions.planId,
      })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantData.tenantId))
      .limit(1);

    const sub = subRows[0];
    if (!sub) return { error: "NO_SUBSCRIPTION" };

    // Check trial is active
    const isTrial = sub.status === "trial" || sub.status === "trialing";
    const trialActive = isTrial && sub.trialEndsAt && new Date(sub.trialEndsAt) > new Date();
    if (!trialActive) return { error: "TRIAL_NOT_ACTIVE" };

    // Load new plan
    const planRows = await db
      .select({ id: plans.id, slug: plans.slug })
      .from(plans)
      .where(eq(plans.slug, newPlanSlug))
      .limit(1);

    const newPlan = planRows[0];
    if (!newPlan) return { error: "PLAN_NOT_FOUND" };

    // Load current plan slug for originalTrialPlanSlug tracking
    const currentPlanRows = await db
      .select({ slug: plans.slug })
      .from(plans)
      .where(eq(plans.id, sub.planId))
      .limit(1);

    const currentPlanSlug = currentPlanRows[0]?.slug;

    // Update subscription — keep trial_ends_at unchanged
    await db
      .update(subscriptions)
      .set({
        planId: newPlan.id,
        originalTrialPlanSlug: sub.originalTrialPlanSlug ?? currentPlanSlug ?? null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("changeTrialPlan error:", err);
    return { error: "CHANGE_PLAN_FAILED" };
  }
}

export async function markConversionModalShown(): Promise<ActionResult> {
  try {
    const tenantData = await loadTenantForUser();
    if (!tenantData) return { error: "NOT_AUTHENTICATED" };

    await db
      .update(tenants)
      .set({
        conversionModalShownAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantData.tenantId));

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("markConversionModalShown error:", err);
    return { error: "MARK_SHOWN_FAILED" };
  }
}
