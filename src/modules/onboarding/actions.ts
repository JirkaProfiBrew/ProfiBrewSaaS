"use server";

import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { shops } from "@/../drizzle/schema/shops";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireTenant(): Promise<{ tenantId: string; locale: string }> {
  const data = await loadTenantForUser();
  if (!data) {
    redirect("/login");
  }
  // We don't have locale in tenant data; default to "cs" for redirect paths.
  return { tenantId: data.tenantId, locale: "cs" };
}

// ---------------------------------------------------------------------------
// Skip onboarding
// ---------------------------------------------------------------------------

export async function skipOnboarding(): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  await db
    .update(tenants)
    .set({
      onboardingSkipped: true,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  redirect(`/dashboard`);
}

// ---------------------------------------------------------------------------
// Update current step
// ---------------------------------------------------------------------------

export async function updateOnboardingStep(
  step: number
): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  await db
    .update(tenants)
    .set({
      onboardingStep: step,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return {};
}

// ---------------------------------------------------------------------------
// Step 2: Brewery info
// ---------------------------------------------------------------------------

interface BreweryInfoData {
  name: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string;
}

export async function updateBreweryInfo(
  data: BreweryInfoData
): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  // Tenant name is a dedicated column. Address/ICO/DIC go into settings JSONB.
  const tenantRows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const currentSettings =
    (tenantRows[0]?.settings as Record<string, unknown>) ?? {};

  await db
    .update(tenants)
    .set({
      name: data.name,
      settings: {
        ...currentSettings,
        address: {
          street: data.street,
          city: data.city,
          zip: data.zip,
        },
        ico: data.ico,
        dic: data.dic,
      },
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return {};
}

// ---------------------------------------------------------------------------
// Step 3: Warehouse settings
// ---------------------------------------------------------------------------

interface WarehouseUpdate {
  id: string;
  name: string;
  isActive: boolean;
}

export async function updateWarehouseSettings(
  warehouseUpdates: WarehouseUpdate[],
  stockMode: string
): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  // Update each warehouse
  for (const wh of warehouseUpdates) {
    await db
      .update(warehouses)
      .set({
        name: wh.name,
        isActive: wh.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(warehouses.id, wh.id), eq(warehouses.tenantId, tenantId)));
  }

  // Update shop settings with stockMode
  const shopRows = await db
    .select({ id: shops.id, settings: shops.settings })
    .from(shops)
    .where(and(eq(shops.tenantId, tenantId), eq(shops.isDefault, true)))
    .limit(1);

  if (shopRows[0]) {
    const currentSettings =
      (shopRows[0].settings as Record<string, unknown>) ?? {};
    await db
      .update(shops)
      .set({
        settings: { ...currentSettings, stock_mode: stockMode },
        updatedAt: new Date(),
      })
      .where(eq(shops.id, shopRows[0].id));
  }

  return {};
}

// ---------------------------------------------------------------------------
// Step 4: Economic parameters
// ---------------------------------------------------------------------------

interface EconomicParams {
  overheadPercentage: number;
  overheadFixed: number;
  batchCost: number;
  generateExpenseFromReceipt: boolean;
}

export async function updateEconomicParams(
  params: EconomicParams
): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  const shopRows = await db
    .select({ id: shops.id, settings: shops.settings })
    .from(shops)
    .where(and(eq(shops.tenantId, tenantId), eq(shops.isDefault, true)))
    .limit(1);

  if (shopRows[0]) {
    const currentSettings =
      (shopRows[0].settings as Record<string, unknown>) ?? {};
    await db
      .update(shops)
      .set({
        settings: {
          ...currentSettings,
          overhead_pct: params.overheadPercentage,
          overhead_czk: params.overheadFixed,
          brew_cost_czk: params.batchCost,
          auto_cf_from_receipt: params.generateExpenseFromReceipt,
        },
        updatedAt: new Date(),
      })
      .where(eq(shops.id, shopRows[0].id));
  }

  return {};
}

// ---------------------------------------------------------------------------
// Step 5: Excise settings
// ---------------------------------------------------------------------------

export async function updateExciseSettings(
  enabled: boolean
): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  const tenantRows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const currentSettings =
    (tenantRows[0]?.settings as Record<string, unknown>) ?? {};

  await db
    .update(tenants)
    .set({
      settings: { ...currentSettings, excise_enabled: enabled },
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return {};
}

// ---------------------------------------------------------------------------
// Step 6: Complete onboarding
// ---------------------------------------------------------------------------

export async function completeOnboarding(): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  await db
    .update(tenants)
    .set({
      onboardingCompletedAt: new Date(),
      onboardingStep: 99,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return {};
}

// ---------------------------------------------------------------------------
// Dismiss onboarding reminder
// ---------------------------------------------------------------------------

export async function dismissOnboardingReminder(): Promise<{ error?: string }> {
  const { tenantId } = await requireTenant();

  await db
    .update(tenants)
    .set({
      onboardingSkipReminderDisabled: true,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return {};
}
