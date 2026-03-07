"use server";

import { db } from "@/lib/db";
import { pilotInvitations } from "@/../drizzle/schema/pilots";
import { eq, desc } from "drizzle-orm";
import { withSuperadmin } from "@/lib/auth/superadmin";
import type { PilotInvitation, CreateInvitationInput } from "./types";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

function mapRow(
  row: typeof pilotInvitations.$inferSelect
): PilotInvitation {
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    planSlug: row.planSlug,
    trialDays: row.trialDays,
    priceOverride: row.priceOverride,
    notes: row.notes,
    status: row.status as PilotInvitation["status"],
    sentAt: row.sentAt,
    registeredAt: row.registeredAt,
    registeredTenantId: row.registeredTenantId,
    expiresAt: row.expiresAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export async function createInvitation(
  data: CreateInvitationInput
): Promise<PilotInvitation> {
  return withSuperadmin(async (userId) => {
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90); // 90 days to register

    const [row] = await db
      .insert(pilotInvitations)
      .values({
        token,
        email: data.email,
        planSlug: data.planSlug ?? "pro",
        trialDays: data.trialDays ?? 30,
        priceOverride: data.priceOverride ?? null,
        notes: data.notes ?? null,
        status: "pending",
        expiresAt,
        createdBy: userId,
      })
      .returning();

    if (!row) throw new Error("Failed to create invitation");
    return mapRow(row);
  });
}

export async function listInvitations(): Promise<PilotInvitation[]> {
  return withSuperadmin(async () => {
    const rows = await db
      .select()
      .from(pilotInvitations)
      .orderBy(desc(pilotInvitations.createdAt));

    return rows.map(mapRow);
  });
}

export async function validateInviteToken(
  token: string
): Promise<PilotInvitation | null> {
  // No superadmin check — this is called by the register page
  const rows = await db
    .select()
    .from(pilotInvitations)
    .where(eq(pilotInvitations.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const invitation = mapRow(row);

  // Check if expired
  if (invitation.expiresAt && new Date() > invitation.expiresAt) {
    return null;
  }

  // Check if already registered
  if (invitation.status === "registered") {
    return null;
  }

  return invitation;
}
