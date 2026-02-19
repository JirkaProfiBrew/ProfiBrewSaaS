import { db } from "@/lib/db";
import { counters } from "@/../drizzle/schema/system";
import { eq, and, sql, isNull } from "drizzle-orm";

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
 * await getNextNumber(tenantId, "item")                    // → "it00001"
 * await getNextNumber(tenantId, "batch")                   // → "V-2026-001"
 * await getNextNumber(tenantId, "stock_issue_receipt", wh) // → per-warehouse counter
 */
export async function getNextNumber(
  tenantId: string,
  entity: string,
  warehouseId?: string
): Promise<string> {
  const result = await db.transaction(async (tx) => {
    // Build conditions for counter lookup
    const conditions = [
      eq(counters.tenantId, tenantId),
      eq(counters.entity, entity),
    ];
    if (warehouseId) {
      conditions.push(eq(counters.warehouseId, warehouseId));
    } else {
      conditions.push(isNull(counters.warehouseId));
    }

    // Lock the counter row for update
    const rows = await tx
      .select()
      .from(counters)
      .where(and(...conditions))
      .for("update");

    let counter = rows[0];

    // If warehouse-specific counter not found, fall back to global
    if (!counter && warehouseId) {
      const fallbackRows = await tx
        .select()
        .from(counters)
        .where(
          and(
            eq(counters.tenantId, tenantId),
            eq(counters.entity, entity),
            isNull(counters.warehouseId)
          )
        )
        .for("update");
      counter = fallbackRows[0];
    }

    if (!counter) {
      // Auto-create a default counter via raw SQL UPSERT (always returns a row).
      // Drizzle SELECT + onConflictDoNothing failed in some Supabase pooler configs,
      // so we use a single atomic statement that always returns the counter.
      const defaultConfig = getDefaultCounterConfig(entity);
      const wid = warehouseId ?? null;

      const upserted = await tx.execute(
        sql`INSERT INTO counters (tenant_id, entity, warehouse_id, prefix, include_year, padding, separator, reset_yearly)
            VALUES (${tenantId}, ${entity}, ${wid}, ${defaultConfig.prefix}, ${defaultConfig.includeYear}, ${defaultConfig.padding}, ${defaultConfig.separator}, ${defaultConfig.resetYearly})
            ON CONFLICT ON CONSTRAINT counters_tenant_entity_warehouse
            DO UPDATE SET updated_at = now()
            RETURNING id, tenant_id, entity, warehouse_id, prefix, include_year, current_number, padding, separator, reset_yearly, created_at, updated_at`
      );

      const row = upserted[0] as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`Counter not found for entity "${entity}"`);
      }

      counter = {
        id: row.id as string,
        tenantId: row.tenant_id as string,
        entity: row.entity as string,
        warehouseId: (row.warehouse_id as string) ?? null,
        prefix: row.prefix as string,
        includeYear: row.include_year as boolean,
        currentNumber: row.current_number as number,
        padding: row.padding as number,
        separator: row.separator as string,
        resetYearly: row.reset_yearly as boolean,
        createdAt: row.created_at as Date | null,
        updatedAt: row.updated_at as Date | null,
      };
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
