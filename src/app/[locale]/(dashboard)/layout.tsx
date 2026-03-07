import { redirect } from "next/navigation";
import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { TenantProvider } from "@/components/providers/TenantProvider";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ModuleGuard } from "@/components/layout/ModuleGuard";
import { TrialBanner } from "@/components/layout/TrialBanner";
import { OnboardingReminderBanner } from "@/components/layout/OnboardingReminderBanner";
import { ConversionModal } from "@/components/billing/ConversionModal";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { subscriptions, plans } from "@/../drizzle/schema/subscriptions";
import { eq } from "drizzle-orm";

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps): Promise<React.ReactNode> {
  const { locale } = await params;
  const tenantData = await loadTenantForUser();

  if (!tenantData) {
    redirect(`/${locale}/login`);
  }

  // Check onboarding status — redirect if not completed and not skipped
  // Wrapped in try/catch: columns may not exist if migration 0030 hasn't run yet
  let showConversionModal = false;
  let sub: { status: string; trialEndsAt: Date | null; planSlug: string } | undefined;
  let availablePlans: Array<{
    slug: string;
    name: string;
    basePrice: string;
    currency: string;
  }> = [];

  try {
    const tenantRows = await db
      .select({
        onboardingStep: tenants.onboardingStep,
        onboardingSkipped: tenants.onboardingSkipped,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantData.tenantId))
      .limit(1);

    const tenantRecord = tenantRows[0];
    if (
      tenantRecord &&
      (tenantRecord.onboardingStep ?? 0) < 99 &&
      !tenantRecord.onboardingSkipped
    ) {
      redirect(`/${locale}/onboarding`);
    }
  } catch (err) {
    // Columns don't exist yet — skip onboarding check
    console.warn("[layout] onboarding check skipped (columns may not exist):", err);
  }

  // Check for trial expiry → show conversion modal
  try {
    const subRows = await db
      .select({
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
        planSlug: plans.slug,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.tenantId, tenantData.tenantId))
      .limit(1);

    const tenantConversionRows = await db
      .select({ conversionModalShownAt: tenants.conversionModalShownAt })
      .from(tenants)
      .where(eq(tenants.id, tenantData.tenantId))
      .limit(1);

    sub = subRows[0];
    const trialExpired =
      (sub?.status === "trialing" || sub?.status === "trial") &&
      sub?.trialEndsAt &&
      new Date(sub.trialEndsAt) < new Date();
    showConversionModal =
      !!trialExpired && !tenantConversionRows[0]?.conversionModalShownAt;

    if (showConversionModal) {
      const planRows = await db
        .select({
          slug: plans.slug,
          name: plans.name,
          basePrice: plans.basePrice,
          currency: plans.currency,
        })
        .from(plans)
        .where(eq(plans.isActive, true));

      availablePlans = planRows.map((p) => ({
        slug: p.slug,
        name: p.name,
        basePrice: p.basePrice,
        currency: p.currency,
      }));
    }
  } catch (err) {
    console.warn("[layout] conversion check skipped:", err);
  }

  return (
    <TenantProvider value={tenantData}>
      <SidebarProvider>
        <div className="flex h-screen flex-col">
          {showConversionModal && sub && (
            <ConversionModal
              tenantId={tenantData.tenantId}
              currentPlanSlug={sub.planSlug}
              plans={availablePlans}
              open
            />
          )}
          <TrialBanner tenantId={tenantData.tenantId} />
          <OnboardingReminderBanner tenantId={tenantData.tenantId} />
          <TopBar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6">
              <ModuleGuard tenantId={tenantData.tenantId} locale={locale}>
                {children}
              </ModuleGuard>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </TenantProvider>
  );
}
