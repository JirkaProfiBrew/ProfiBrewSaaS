import { getTranslations, getLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { subscriptions } from "@/../drizzle/schema/subscriptions";
import { eq } from "drizzle-orm";
import Link from "next/link";

interface TrialBannerProps {
  tenantId: string;
}

export async function TrialBanner({ tenantId }: TrialBannerProps): Promise<React.ReactNode> {
  const t = await getTranslations("billing");
  const locale = await getLocale();

  const subRows = await db
    .select({
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const sub = subRows[0];
  if (!sub) return null;

  const isTrial = sub.status === "trial" || sub.status === "trialing";
  if (!isTrial || !sub.trialEndsAt) return null;

  const trialEnd = new Date(sub.trialEndsAt);
  const now = new Date();
  const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Only show banner when ≤7 days remaining or expired
  if (daysLeft > 7) return null;

  const expired = daysLeft <= 0;

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-sm ${
        expired
          ? "bg-destructive text-white"
          : "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200"
      }`}
    >
      <span>
        {expired
          ? t("trialRemaining") + " " + t("trialEndedAt").toLowerCase() + ": " + trialEnd.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
          : t("trialRemaining") + ": " + t("trialDays", { days: daysLeft })}
      </span>
      <Link
        href={`/${locale}/settings/billing`}
        className="font-medium underline hover:no-underline"
      >
        {t("viewPlans")}
      </Link>
    </div>
  );
}
