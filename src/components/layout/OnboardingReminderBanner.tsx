import { getTranslations, getLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { tenants } from "@/../drizzle/schema/tenants";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { DismissReminderButton } from "./DismissReminderButton";

interface OnboardingReminderBannerProps {
  tenantId: string;
}

export async function OnboardingReminderBanner({
  tenantId,
}: OnboardingReminderBannerProps): Promise<React.ReactNode> {
  const t = await getTranslations("onboarding.reminder");
  const locale = await getLocale();

  let tenant: {
    onboardingSkipped: boolean | null;
    onboardingSkipReminderDisabled: boolean | null;
    onboardingStep: number | null;
  } | undefined;

  try {
    const rows = await db
      .select({
        onboardingSkipped: tenants.onboardingSkipped,
        onboardingSkipReminderDisabled: tenants.onboardingSkipReminderDisabled,
        onboardingStep: tenants.onboardingStep,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    tenant = rows[0];
  } catch {
    // Columns don't exist yet — skip
    return null;
  }

  if (!tenant) return null;

  // Show only if skipped AND reminder not dismissed AND not completed
  if (!tenant.onboardingSkipped) return null;
  if (tenant.onboardingSkipReminderDisabled) return null;
  if (tenant.onboardingStep === 99) return null;

  return (
    <div className="flex items-center justify-between bg-blue-50 px-4 py-2 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
      <span>{t("message")}</span>
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/onboarding`}
          className="font-medium underline hover:no-underline"
        >
          {t("resume")}
        </Link>
        <DismissReminderButton label={t("dismiss")} />
      </div>
    </div>
  );
}
