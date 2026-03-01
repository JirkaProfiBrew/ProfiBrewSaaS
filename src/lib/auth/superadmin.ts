"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userProfiles } from "@/../drizzle/schema/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Check if a user is a superadmin by their user ID.
 */
export async function checkSuperadmin(userId: string): Promise<boolean> {
  const result = await db
    .select({ isSuperadmin: userProfiles.isSuperadmin })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  return result[0]?.isSuperadmin === true;
}

/**
 * Check if the currently authenticated user is a superadmin.
 * Returns the user ID if superadmin, null otherwise.
 */
export async function getCurrentSuperadmin(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const isSuperadmin = await checkSuperadmin(user.id);
  return isSuperadmin ? user.id : null;
}

/**
 * Guard wrapper for admin server actions.
 * Verifies the current user is a superadmin before executing the action.
 * Throws if not authenticated or not superadmin.
 */
export async function withSuperadmin<T>(
  action: (userId: string) => Promise<T>
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("NOT_AUTHENTICATED");
  }

  const isSuperadmin = await checkSuperadmin(user.id);
  if (!isSuperadmin) {
    throw new Error("SUPERADMIN_REQUIRED");
  }

  return action(user.id);
}
