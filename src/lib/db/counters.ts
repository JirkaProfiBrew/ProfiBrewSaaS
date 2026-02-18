import { db } from "@/lib/db";
import { counters } from "@/../drizzle/schema/system";
import { eq, and, sql } from "drizzle-orm";

/**
 * Get the next formatted number from a counter sequence.
 * Uses SELECT ... FOR UPDATE to prevent race conditions.
 *
 * @example
 * await getNextNumber(tenantId, "item")    // → "it00001"
 * await getNextNumber(tenantId, "batch")   // → "V-2026-001"
 */
export async function getNextNumber(
  tenantId: string,
  entity: string
): Promise<string> {
  const result = await db.transaction(async (tx) => {
    // Lock the counter row for update
    const rows = await tx
      .select()
      .from(counters)
      .where(and(eq(counters.tenantId, tenantId), eq(counters.entity, entity)))
      .for("update");

    const counter = rows[0];
    if (!counter) {
      throw new Error(`Counter not found for entity "${entity}" in tenant "${tenantId}"`);
    }

    // Check if we need to reset the counter (yearly reset)
    const currentYear = new Date().getFullYear();
    let nextNumber = (counter.currentNumber ?? 0) + 1;

    if (counter.resetYearly) {
      const lastUpdatedYear = counter.updatedAt
        ? new Date(counter.updatedAt).getFullYear()
        : currentYear;

      if (lastUpdatedYear < currentYear) {
        nextNumber = 1;
      }
    }

    // Update the counter
    await tx
      .update(counters)
      .set({
        currentNumber: nextNumber,
        updatedAt: sql`now()`,
      })
      .where(eq(counters.id, counter.id));

    // Format the number
    const paddedNumber = String(nextNumber).padStart(counter.padding ?? 3, "0");
    const sep = counter.separator ?? "-";

    if (counter.includeYear) {
      return `${counter.prefix}${sep}${currentYear}${sep}${paddedNumber}`;
    }

    return `${counter.prefix}${paddedNumber}`;
  });

  return result;
}

/**
 * Seed default counters for a new tenant.
 * Called during tenant registration.
 */
export async function seedDefaultCounters(tenantId: string): Promise<void> {
  const defaults = [
    {
      entity: "item",
      prefix: "it",
      includeYear: false,
      padding: 5,
      separator: "",
      resetYearly: false,
    },
    {
      entity: "batch",
      prefix: "V",
      includeYear: true,
      padding: 3,
      separator: "-",
      resetYearly: true,
    },
    {
      entity: "order",
      prefix: "OBJ",
      includeYear: true,
      padding: 4,
      separator: "-",
      resetYearly: true,
    },
    {
      entity: "stock_issue_receipt",
      prefix: "PR",
      includeYear: true,
      padding: 3,
      separator: "-",
      resetYearly: true,
    },
    {
      entity: "stock_issue_dispatch",
      prefix: "VD",
      includeYear: true,
      padding: 3,
      separator: "-",
      resetYearly: true,
    },
  ];

  await db.insert(counters).values(
    defaults.map((d) => ({
      tenantId,
      ...d,
    }))
  );
}
