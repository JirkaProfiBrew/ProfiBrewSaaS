"use server";

import { eq, and, isNull, asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { units } from "@/../drizzle/schema/system";
import type { Unit } from "./types";

/** Map a Drizzle units row to Unit type. */
function mapRow(row: typeof units.$inferSelect): Unit {
  return {
    id: row.id,
    code: row.code,
    nameCs: row.nameCs,
    nameEn: row.nameEn,
    symbol: row.symbol,
    category: row.category as "weight" | "volume" | "count",
    baseUnitCode: row.baseUnitCode,
    toBaseFactor: row.toBaseFactor ? parseFloat(row.toBaseFactor) : 1,
    isSystem: row.isSystem ?? true,
  };
}

/** Get all system units (no tenant filter needed — system units have tenant_id = NULL). */
export async function getUnits(): Promise<Unit[]> {
  const rows = await db
    .select()
    .from(units)
    .where(isNull(units.tenantId))
    .orderBy(asc(units.sortOrder));

  return rows.map(mapRow);
}

/** Get units filtered by category. */
export async function getUnitsByCategory(
  category: "weight" | "volume" | "count"
): Promise<Unit[]> {
  const rows = await db
    .select()
    .from(units)
    .where(
      and(
        isNull(units.tenantId),
        eq(units.category, category)
      )
    )
    .orderBy(asc(units.sortOrder));

  return rows.map(mapRow);
}

/** Get a single unit by code. */
export async function getUnitByCode(code: string): Promise<Unit | null> {
  const rows = await db
    .select()
    .from(units)
    .where(
      and(
        isNull(units.tenantId),
        eq(units.code, code)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return mapRow(row);
}
