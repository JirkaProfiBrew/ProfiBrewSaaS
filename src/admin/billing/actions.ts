"use server";

import { db } from "@/lib/db";
import { billingEvents } from "@/../drizzle/schema/billing";
import { tenants } from "@/../drizzle/schema/tenants";
import { eq, desc, sql } from "drizzle-orm";
import { withSuperadmin } from "@/lib/auth/superadmin";

export interface BillingEventRow {
  id: string;
  tenantId: string;
  tenantName: string;
  type: string;
  planSlug: string | null;
  amount: string | null;
  notes: string | null;
  processed: boolean | null;
  processedAt: Date | null;
  processedBy: string | null;
  createdAt: Date | null;
}

export async function listBillingEvents(): Promise<BillingEventRow[]> {
  return withSuperadmin(async () => {
    const rows = await db
      .select({
        id: billingEvents.id,
        tenantId: billingEvents.tenantId,
        tenantName: tenants.name,
        type: billingEvents.type,
        planSlug: billingEvents.planSlug,
        amount: billingEvents.amount,
        notes: billingEvents.notes,
        processed: billingEvents.processed,
        processedAt: billingEvents.processedAt,
        processedBy: billingEvents.processedBy,
        createdAt: billingEvents.createdAt,
      })
      .from(billingEvents)
      .leftJoin(tenants, eq(billingEvents.tenantId, tenants.id))
      .orderBy(desc(billingEvents.createdAt));

    return rows.map((r) => ({
      ...r,
      tenantName: r.tenantName ?? "Unknown",
    }));
  });
}

export async function markEventProcessed(eventId: string): Promise<void> {
  return withSuperadmin(async (userId) => {
    await db
      .update(billingEvents)
      .set({
        processed: true,
        processedAt: sql`now()`,
        processedBy: userId,
      })
      .where(eq(billingEvents.id, eventId));
  });
}
