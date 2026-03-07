import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { plans } from "@/../drizzle/schema/subscriptions";
import { eq, and, isNull, asc, inArray } from "drizzle-orm";
import { PlanCard } from "./PlanCard";
import type { PlanCardData } from "./PlanCard";

const PLAN_SELECT = {
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
} as const;

async function loadCommercialPlans(): Promise<PlanCardData[]> {
  return db
    .select(PLAN_SELECT)
    .from(plans)
    .where(
      and(
        eq(plans.isActive, true),
        eq(plans.isPublic, true),
        isNull(plans.validTo),
      ),
    )
    .orderBy(asc(plans.sortOrder));
}

async function loadCommunityPlans(): Promise<PlanCardData[]> {
  return db
    .select(PLAN_SELECT)
    .from(plans)
    .where(
      and(
        eq(plans.isActive, true),
        isNull(plans.validTo),
        inArray(plans.slug, ["community_homebrewer", "community_school"]),
      ),
    )
    .orderBy(asc(plans.sortOrder));
}

export async function PricingPage(): Promise<React.ReactNode> {
  const t = await getTranslations("pricing");
  const [commercialPlans, communityPlans] = await Promise.all([
    loadCommercialPlans(),
    loadCommunityPlans(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-12">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Commercial plans grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {commercialPlans.map((plan) => (
          <PlanCard key={plan.slug} plan={plan} variant="commercial" />
        ))}
      </div>

      {/* Community section */}
      {communityPlans.length > 0 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold">{t("communityTitle")}</h2>
          </div>
          <div className="mx-auto grid max-w-2xl gap-6 md:grid-cols-2">
            {communityPlans.map((plan) => (
              <PlanCard key={plan.slug} plan={plan} variant="community" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
