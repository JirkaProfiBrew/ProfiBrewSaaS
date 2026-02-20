import { db } from "@/lib/db";
import { counters } from "@/../drizzle/schema/system";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { eq, and, sql, isNull } from "drizzle-orm";

/** Default counter configurations per entity. */
const COUNTER_DEFAULTS: Record<string, { prefix: string; includeYear: boolean; padding: number; separator: string; resetYearly: boolean }> = {
  item:                 { prefix: "it",  includeYear: false, padding: 5, separator: "",  resetYearly: false },
  batch:                { prefix: "V",   includeYear: true,  padding: 3, separator: "-", resetYearly: true },
  order:                { prefix: "OBJ", includeYear: true,  padding: 4, separator: "-", resetYearly: true },
  stock_issue_receipt:  { prefix: "PR",  includeYear: true,  padding: 3, separator: "-", resetYearly: true },
  stock_issue_dispatch: { prefix: "VD",  includeYear: true,  padding: 3, separator: "-", resetYearly: true },
};

/** Per-warehouse counter config: prefix includes warehouse code. */
const WAREHOUSE_COUNTER_CONFIG: Record<string, (warehouseCode: string) => { prefix: string; includeYear: boolean; padding: number; separator: string; resetYearly: boolean }> = {
  stock_issue_receipt:  (code) => ({ prefix: `PRI${code}`, includeYear: false, padding: 7, separator: "", resetYearly: false }),
  stock_issue_dispatch: (code) => ({ prefix: `VYD${code}`, includeYear: false, padding: 7, separator: "", resetYearly: false }),
};

function getDefaultCounterConfig(entity: string): { prefix: string; includeYear: boolean; padding: number; separator: string; resetYearly: boolean } {
  return COUNTER_DEFAULTS[entity] ?? { prefix: entity.substring(0, 3).toUpperCase(), includeYear: true, padding: 3, separator: "-", resetYearly: true };
}

/**
 * Ensure a counter row exists for the given entity.
 * Uses global counters only (tenant_id + entity, no warehouse_id).
 * Runs OUTSIDE the main transaction so a failed INSERT doesn't abort anything.
 */
async function ensureCounterExists(
  tenantId: string,
  entity: string
): Promise<void> {
  // Check if global counter already exists
  const existing = await db
    .select({ id: counters.id })
    .from(counters)
    .where(
      and(
        eq(counters.tenantId, tenantId),
        eq(counters.entity, entity),
        isNull(counters.warehouseId)
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  // No counter found — create one
  const defaultConfig = getDefaultCounterConfig(entity);
  try {
    await db
      .insert(counters)
      .values({
        tenantId,
        entity,
        warehouseId: null,
        ...defaultConfig,
      });
  } catch (error: unknown) {
    // Log the actual error for debugging
    console.error("[counters] Failed to auto-create counter:", entity, error);
  }
}

/**
 * Ensure a per-warehouse counter exists for the given entity + warehouse.
 * Looks up the warehouse code and creates a counter with PRI{code} / VYD{code} prefix.
 * Runs OUTSIDE the main transaction so a failed INSERT doesn't abort anything.
 */
async function ensureWarehouseCounterExists(
  tenantId: string,
  entity: string,
  warehouseId: string
): Promise<void> {
  const configFn = WAREHOUSE_COUNTER_CONFIG[entity];
  if (!configFn) return; // entity doesn't use per-warehouse counters

  // Check if per-warehouse counter already exists
  const existing = await db
    .select({ id: counters.id })
    .from(counters)
    .where(
      and(
        eq(counters.tenantId, tenantId),
        eq(counters.entity, entity),
        eq(counters.warehouseId, warehouseId)
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  // Look up warehouse code
  const whRows = await db
    .select({ code: warehouses.code })
    .from(warehouses)
    .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.id, warehouseId)))
    .limit(1);

  const warehouseCode = whRows[0]?.code;
  if (!warehouseCode) return; // warehouse not found — skip silently

  const config = configFn(warehouseCode);
  try {
    await db
      .insert(counters)
      .values({
        tenantId,
        entity,
        warehouseId,
        ...config,
      });
  } catch (error: unknown) {
    console.error("[counters] Failed to auto-create warehouse counter:", entity, warehouseId, error);
  }
}

/**
 * Get the next formatted number from a counter sequence.
 * Looks up a global counter by (tenant_id, entity).
 * Per-warehouse counters are used if they exist (created by warehouse setup).
 *
 * @param warehouseId — optional, used to find per-warehouse counter first
 *
 * @example
 * await getNextNumber(tenantId, "item")                    // → "it00001"
 * await getNextNumber(tenantId, "batch")                   // → "V-2026-001"
 * await getNextNumber(tenantId, "stock_issue_receipt", wh) // → per-warehouse or global
 */
export async function getNextNumber(
  tenantId: string,
  entity: string,
  warehouseId?: string
): Promise<string> {
  // Step 1: Ensure counters exist (outside transaction)
  await ensureCounterExists(tenantId, entity);
  if (warehouseId) {
    await ensureWarehouseCounterExists(tenantId, entity, warehouseId);
  }

  // Step 2: Increment and format (inside transaction for atomicity)
  const result = await db.transaction(async (tx) => {
    let counter;

    // Try per-warehouse counter first (if warehouseId provided)
    if (warehouseId) {
      const whRows = await tx
        .select()
        .from(counters)
        .where(
          and(
            eq(counters.tenantId, tenantId),
            eq(counters.entity, entity),
            eq(counters.warehouseId, warehouseId)
          )
        );
      counter = whRows[0];
    }

    // Fall back to global counter (warehouse_id IS NULL)
    if (!counter) {
      const globalRows = await tx
        .select()
        .from(counters)
        .where(
          and(
            eq(counters.tenantId, tenantId),
            eq(counters.entity, entity),
            isNull(counters.warehouseId)
          )
        );
      counter = globalRows[0];
    }

    if (!counter) {
      throw new Error(`Counter not found for entity "${entity}"`);
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
