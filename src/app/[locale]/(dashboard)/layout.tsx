import { redirect } from "next/navigation";
import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { TenantProvider } from "@/components/providers/TenantProvider";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ModuleGuard } from "@/components/layout/ModuleGuard";
import { TrialBanner } from "@/components/layout/TrialBanner";
import { OnboardingReminderBanner } from "@/components/layout/OnboardingReminderBanner";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
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

  return (
    <TenantProvider value={tenantData}>
      <SidebarProvider>
        <div className="flex h-screen flex-col">
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
