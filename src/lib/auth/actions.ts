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

export async function signUp(
  email: string,
  password: string,
  breweryName: string
): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error("[signUp] step 1 auth error:", authError.message);
      return { error: authError.message };
    }

    const userId = authData.user?.id;
    if (!userId) {
      console.error("[signUp] step 1 no userId, identities:", authData.user?.identities?.length);
      return { error: "User creation failed" };
    }

    console.log("[signUp] step 1 OK, userId:", userId);

    // 2. Create user profile
    await db.insert(userProfiles).values({
      id: userId,
      fullName: null,
    });

    // 3. Create tenant
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: breweryName,
        slug: slugify(breweryName),
        status: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      })
      .returning();

    if (!tenant) {
      console.error("[signUp] step 3 tenant creation failed");
      return { error: "Tenant creation failed" };
    }

    console.log("[signUp] step 3 OK, tenantId:", tenant.id);

    // 4. Link user to tenant as owner
    await db.insert(tenantUsers).values({
      tenantId: tenant.id,
      userId,
      role: "owner",
      joinedAt: new Date(),
    });

    // 5. Create free trial subscription
    const [freePlan] = await db
      .select()
      .from(plans)
      .where(eq(plans.slug, "free"))
      .limit(1);

    if (freePlan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await db.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: freePlan.id,
        status: "trialing",
        startedAt: now.toISOString().split("T")[0]!,
        currentPeriodStart: now.toISOString().split("T")[0]!,
        currentPeriodEnd: periodEnd.toISOString().split("T")[0]!,
      });
    }

    // 6. Seed default data (counters, deposits, CF categories)
    // Non-blocking: registration must succeed even if seeding fails
    try {
      await seedTenantDefaults(tenant.id);
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
