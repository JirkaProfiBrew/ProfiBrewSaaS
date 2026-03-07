"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { userProfiles } from "@/../drizzle/schema/auth";
import { tenantUsers } from "@/../drizzle/schema/auth";
import { subscriptions, plans } from "@/../drizzle/schema/subscriptions";
import { eq } from "drizzle-orm";
import { routing } from "@/i18n/routing";
import { seedTenantDefaults } from "@/lib/db/seed-tenant";

async function getLocale(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get("NEXT_LOCALE")?.value ?? routing.defaultLocale;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface AuthResult {
  error?: string;
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }
  } catch (err) {
    console.error("signIn error:", err);
    return { error: "Unexpected error occurred" };
  }

  const locale = await getLocale();
  redirect(`/${locale}/dashboard`);
}

export type SignUpPurpose = "professional" | "homebrewer";

export async function signUp(
  email: string,
  password: string,
  breweryName: string,
  fullName?: string,
  purpose: SignUpPurpose = "professional",
  planSlug?: string
): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return { error: authError.message };
    }

    const userId = authData.user?.id;
    if (!userId) {
      return { error: "User creation failed" };
    }

    // 2. Create user profile
    await db.insert(userProfiles).values({
      id: userId,
      fullName: fullName || null,
    });

    // 3. Create tenant
    const isHomebrewer =
      purpose === "homebrewer" || planSlug === "community_homebrewer";

    // Determine the effective plan slug
    const effectivePlanSlug =
      planSlug || (isHomebrewer ? "community_homebrewer" : "pro");
    const isFreeOrCommunity =
      effectivePlanSlug === "free" ||
      effectivePlanSlug === "community_homebrewer";

    // Trial days: 0 for free/community, 30 for paid plans
    const trialDays = isFreeOrCommunity ? 0 : 30;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: breweryName,
        slug: slugify(breweryName),
        status: isFreeOrCommunity ? "active" : "trial",
        trialEndsAt: isFreeOrCommunity ? null : trialEndsAt,
        settings: {
          currency: "CZK",
          locale: "cs",
          timezone: "Europe/Prague",
          excise_enabled: false,
          excise_category: "A",
          excise_tax_point_mode: "production",
          excise_default_plato_source: "measurement",
        },
      })
      .returning();

    if (!tenant) {
      return { error: "Tenant creation failed" };
    }

    // 4. Link user to tenant as owner
    await db.insert(tenantUsers).values({
      tenantId: tenant.id,
      userId,
      role: "owner",
      joinedAt: new Date(),
    });

    // 5. Create subscription
    const [selectedPlan] = await db
      .select()
      .from(plans)
      .where(eq(plans.slug, effectivePlanSlug))
      .limit(1);

    if (selectedPlan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      // Launch promo: overage waived for 6 months on commercial plans
      const overageWaivedUntil = new Date(now);
      overageWaivedUntil.setMonth(overageWaivedUntil.getMonth() + 6);

      await db.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: selectedPlan.id,
        status: isFreeOrCommunity ? "active" : "trialing",
        startedAt: now.toISOString().split("T")[0]!,
        currentPeriodStart: now.toISOString().split("T")[0]!,
        currentPeriodEnd: periodEnd.toISOString().split("T")[0]!,
        trialEndsAt: isFreeOrCommunity ? null : trialEndsAt,
        overageWaivedUntil: isFreeOrCommunity
          ? null
          : overageWaivedUntil.toISOString().split("T")[0]!,
        source: "self_service",
        originalTrialPlanSlug: effectivePlanSlug,
      });
    }

    // 6. Seed default data (counters, deposits, CF categories, shop, warehouses, cash desk)
    try {
      await seedTenantDefaults(tenant.id, breweryName, effectivePlanSlug);
    } catch (seedErr) {
      console.error("seedTenantDefaults failed (non-fatal):", seedErr);
    }
  } catch (err) {
    console.error("signUp error:", err);
    return { error: "Unexpected error occurred" };
  }

  const locale = await getLocale();
  redirect(`/${locale}/dashboard`);
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect(`/${locale}/login`);
}
