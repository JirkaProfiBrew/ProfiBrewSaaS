import { db } from "@/lib/db";
import { counters } from "@/../drizzle/schema/system";
import { eq, and, sql } from "drizzle-orm";

/** Default counter configurations per entity. */
const COUNTER_DEFAULTS: Record<string, { prefix: string; includeYear: boolean; padding: number; separator: string; resetYearly: boolean }> = {
  item:                 { prefix: "it",  includeYear: false, padding: 5, separator: "",  resetYearly: false },
  batch:                { prefix: "V",   includeYear: true,  padding: 3, separator: "-", resetYearly: true },
  order:                { prefix: "OBJ", includeYear: true,  padding: 4, separator: "-", resetYearly: true },
  stock_issue_receipt:  { prefix: "PR",  includeYear: true,  padding: 3, separator: "-", resetYearly: true },
  stock_issue_dispatch: { prefix: "VD",  includeYear: true,  padding: 3, separator: "-", resetYearly: true },
};

function getDefaultCounterConfig(entity: string): { prefix: string; includeYear: boolean; padding: number; separator: string; resetYearly: boolean } {
  return COUNTER_DEFAULTS[entity] ?? { prefix: entity.substring(0, 3).toUpperCase(), includeYear: true, padding: 3, separator: "-", resetYearly: true };
}

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

    let counter = rows[0];
    if (!counter) {
      // Auto-create a default counter for this entity
      const defaultConfig = getDefaultCounterConfig(entity);
      const inserted = await tx
        .insert(counters)
        .values({
          tenantId,
          entity,
          ...defaultConfig,
        })
        .returning();

      counter = inserted[0];
      if (!counter) {
        throw new Error(`Failed to create counter for entity "${entity}"`);
      }
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
 * Called during tenant registration. Uses ON CONFLICT DO NOTHING
 * so it's safe to call multiple times.
 */
export async function seedDefaultCounters(tenantId: string): Promise<void> {
  const entities = Object.keys(COUNTER_DEFAULTS);

  await db
    .insert(counters)
    .values(
      entities.map((entity) => ({
        tenantId,
        entity,
        ...COUNTER_DEFAULTS[entity]!,
      }))
    )
    .onConflictDoNothing();
}
