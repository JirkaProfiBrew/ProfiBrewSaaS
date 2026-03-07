import { getTranslations, getLocale } from "next-intl/server";
import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { db } from "@/lib/db";
import { subscriptions, plans } from "@/../drizzle/schema/subscriptions";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { PaymentInstructions } from "./PaymentInstructions";
import { TrialPlanChanger } from "./TrialPlanChanger";

const ALL_MODULES = ["brewery", "stock", "sales", "finance", "plan"] as const;

function getStatusBadge(
  status: string,
  isTrial: boolean,
  trialExpired: boolean,
  t: (key: string) => string,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (status === "pending_payment") {
    return { label: t("pendingPayment"), variant: "outline" };
  }
  if (status === "past_due") {
    return { label: t("pastDue"), variant: "destructive" };
  }
  if (trialExpired) {
    return { label: t("statusExpired"), variant: "destructive" };
  }
  if (isTrial) {
    return { label: t("statusTrial"), variant: "secondary" };
  }
  return { label: t("statusActive"), variant: "default" };
}

export async function BillingPage(): Promise<React.ReactNode> {
  const t = await getTranslations("billing");
  const tUpgrade = await getTranslations("upgrade");
  const locale = await getLocale();
  const tenantData = await loadTenantForUser();

  if (!tenantData) return null;

  // Load full subscription + plan details
  const subRows = await db
    .select({
      status: subscriptions.status,
      startedAt: subscriptions.startedAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      trialEndsAt: subscriptions.trialEndsAt,
      planName: plans.name,
      planSlug: plans.slug,
      basePrice: plans.basePrice,
      currency: plans.currency,
      includedHl: plans.includedHl,
      maxUsers: plans.maxUsers,
      includedModules: plans.includedModules,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantData.tenantId))
    .limit(1);

  const sub = subRows[0];

  if (!sub) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t("noSubscription")}
      </div>
    );
  }

  const isTrial = sub.status === "trial" || sub.status === "trialing";
  const isPendingPayment = sub.status === "pending_payment";
  const isPastDue = sub.status === "past_due";
  const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const now = new Date();
  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const trialExpired = isTrial && trialEnd !== null && trialEnd < now;
  const trialActive = isTrial && !trialExpired;

  const badge = getStatusBadge(sub.status, isTrial, trialExpired ?? false, t);

  // Load available plans for TrialPlanChanger
  let availablePlans: Array<{
    slug: string;
    name: string;
    basePrice: string;
    currency: string;
    includedModules: string[];
  }> = [];
  if (trialActive) {
    const planRows = await db
      .select({
        slug: plans.slug,
        name: plans.name,
        basePrice: plans.basePrice,
        currency: plans.currency,
        includedModules: plans.includedModules,
      })
      .from(plans)
      .where(eq(plans.isActive, true));

    availablePlans = planRows.map((p) => ({
      slug: p.slug,
      name: p.name,
      basePrice: p.basePrice,
      currency: p.currency,
      includedModules: p.includedModules,
    }));
  }

  // Build module name map for TrialPlanChanger
  const moduleNames: Record<string, string> = {};
  for (const mod of ALL_MODULES) {
    moduleNames[mod] = tUpgrade(`moduleNames.${mod}`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Current plan card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t("currentPlan")}</CardTitle>
            <Badge
              variant={badge.variant}
              className={
                isPendingPayment
                  ? "border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300"
                  : undefined
              }
            >
              {badge.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{sub.planName}</span>
            <span className="text-muted-foreground">
              {parseFloat(sub.basePrice) === 0
                ? tUpgrade("free")
                : `${parseFloat(sub.basePrice).toLocaleString("cs-CZ")} ${sub.currency}/${tUpgrade("month")}`}
            </span>
          </div>

          {/* Trial progress */}
          {isTrial && trialEnd && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("trialRemaining")}</span>
                <span className="font-medium">
                  {trialExpired ? t("trialExpiredLabel") : t("trialDays", { days: trialDaysLeft })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {trialExpired
                  ? `${t("trialEndedAt")}: ${trialEnd.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : `${t("trialEndsAt")}: ${trialEnd.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${trialExpired ? "bg-destructive" : trialDaysLeft <= 7 ? "bg-yellow-500" : "bg-primary"}`}
                  style={{
                    width: `${Math.min(100, Math.max(0, ((30 - trialDaysLeft) / 30) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Limits */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{tUpgrade("includedHl")}</span>
              <p className="font-medium">{sub.includedHl ? `${sub.includedHl} hl` : tUpgrade("unlimited")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{tUpgrade("maxUsers")}</span>
              <p className="font-medium">{sub.maxUsers ?? tUpgrade("unlimited")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment instructions — pending_payment */}
      {isPendingPayment && (
        <PaymentInstructions
          tenantId={tenantData.tenantId}
          amount={sub.basePrice}
          currency={sub.currency}
        />
      )}

      {/* Past due warning */}
      {isPastDue && (
        <Card className="border-destructive bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">
              {t("pastDue")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("paymentContact")}{" "}
              <a href="mailto:info@profibrew.com" className="text-primary hover:underline">
                info@profibrew.com
              </a>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trial plan changer — only during active trial */}
      {trialActive && availablePlans.length > 0 && (
        <TrialPlanChanger
          currentPlanSlug={sub.planSlug}
          plans={availablePlans}
          moduleNames={moduleNames}
        />
      )}

      {/* Modules card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("modulesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {ALL_MODULES.map((mod) => {
              const hasModule = sub.includedModules.includes(mod);
              return (
                <div key={mod} className="flex items-center gap-2 text-sm py-1">
                  {hasModule ? (
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={!hasModule ? "text-muted-foreground/40" : ""}>
                    {tUpgrade(`moduleNames.${mod}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade CTA */}
      <Card>
        <CardContent className="pt-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">{t("upgradeHint")}</p>
          <Link
            href={`/${locale}/upgrade`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("viewPlans")}
          </Link>
          <p className="text-xs text-muted-foreground mt-2">
            {t("contactHint")}{" "}
            <a href="mailto:info@profibrew.com" className="text-primary hover:underline">
              info@profibrew.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
