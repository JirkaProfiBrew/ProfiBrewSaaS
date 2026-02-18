"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { userProfiles } from "@/../drizzle/schema/auth";
import { tenantUsers } from "@/../drizzle/schema/auth";
import { subscriptions, plans } from "@/../drizzle/schema/subscriptions";
import { eq } from "drizzle-orm";

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

  redirect("/dashboard");
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
      return { error: authError.message };
    }

    const userId = authData.user?.id;
    if (!userId) {
      return { error: "User creation failed" };
    }

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
      return { error: "Tenant creation failed" };
    }

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
  } catch (err) {
    console.error("signUp error:", err);
    return { error: "Unexpected error occurred" };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
