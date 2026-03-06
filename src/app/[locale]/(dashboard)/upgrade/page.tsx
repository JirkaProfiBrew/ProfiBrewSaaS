import { getTranslations } from "next-intl/server";
import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { db } from "@/lib/db";
import { plans } from "@/../drizzle/schema/subscriptions";
import { eq, and, isNull, asc } from "drizzle-orm";
import { UpgradeContent } from "./UpgradeContent";

interface UpgradePageProps {
  searchParams: Promise<{ module?: string }>;
}

export default async function UpgradePage({
  searchParams,
}: UpgradePageProps): Promise<React.ReactNode> {
  const t = await getTranslations("upgrade");
  const { module: blockedModule } = await searchParams;
  const tenantData = await loadTenantForUser();

  // Load all active public plans
  const allPlans = await db
    .select({
      slug: plans.slug,
      name: plans.name,
      description: plans.description,
      basePrice: plans.basePrice,
      currency: plans.currency,
      billingPeriod: plans.billingPeriod,
      includedHl: plans.includedHl,
      maxUsers: plans.maxUsers,
      includedModules: plans.includedModules,
      apiAccess: plans.apiAccess,
      integrations: plans.integrations,
      prioritySupport: plans.prioritySupport,
      sortOrder: plans.sortOrder,
    })
    .from(plans)
    .where(
      and(
        eq(plans.isActive, true),
        eq(plans.isPublic, true),
        isNull(plans.validTo)
      )
    )
    .orderBy(asc(plans.sortOrder));

  const currentPlan = tenantData?.subscription.planSlug ?? "free";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        {blockedModule && (
          <p className="text-sm text-destructive">
            {t("moduleBlocked", { module: blockedModule })}
          </p>
        )}
      </div>

      <UpgradeContent plans={allPlans} currentPlan={currentPlan} />

      <div className="rounded-lg border bg-muted/50 p-6 text-center space-y-2">
        <h3 className="font-semibold">{t("contactTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("contactDescription")}</p>
        <p className="text-sm">
          <a href="mailto:info@profibrew.com" className="text-primary hover:underline">
            info@profibrew.com
          </a>
        </p>
      </div>
    </div>
  );
}
