import { redirect } from "next/navigation";
import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { shops } from "@/../drizzle/schema/shops";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { eq, and } from "drizzle-orm";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

interface OnboardingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function OnboardingPage({
  params,
}: OnboardingPageProps): Promise<React.ReactNode> {
  const { locale } = await params;
  const tenantData = await loadTenantForUser();

  if (!tenantData) {
    redirect(`/${locale}/login`);
  }

  // If onboarding already completed → redirect to dashboard
  const tenantRows = await db
    .select({
      settings: tenants.settings,
      onboardingStep: tenants.onboardingStep,
      onboardingSkipped: tenants.onboardingSkipped,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantData.tenantId))
    .limit(1);

  const tenant = tenantRows[0];
  if (!tenant) {
    redirect(`/${locale}/login`);
  }

  if (tenant.onboardingStep === 99) {
    redirect(`/${locale}/dashboard`);
  }

  // Load default shop
  const shopRows = await db
    .select({
      id: shops.id,
      settings: shops.settings,
    })
    .from(shops)
    .where(
      and(
        eq(shops.tenantId, tenantData.tenantId),
        eq(shops.isDefault, true)
      )
    )
    .limit(1);

  // Load warehouses
  const warehouseRows = await db
    .select({
      id: warehouses.id,
      name: warehouses.name,
      code: warehouses.code,
      type: warehouses.type,
      isActive: warehouses.isActive,
    })
    .from(warehouses)
    .where(eq(warehouses.tenantId, tenantData.tenantId));

  const tenantSettings = (tenant.settings as Record<string, unknown>) ?? {};
  const shopSettings =
    (shopRows[0]?.settings as Record<string, unknown>) ?? {};

  return (
    <OnboardingWizard
      tenantId={tenantData.tenantId}
      tenantName={tenant.name}
      currentStep={tenant.onboardingStep ?? 0}
      tenantSettings={tenantSettings}
      shopSettings={shopSettings}
      warehouses={warehouseRows.map((w) => ({
        id: w.id,
        name: w.name,
        code: w.code,
        type: w.type,
        isActive: w.isActive ?? true,
      }))}
      locale={locale}
    />
  );
}
