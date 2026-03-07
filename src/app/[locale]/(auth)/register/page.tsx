import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { plans } from "@/../drizzle/schema/subscriptions";
import { eq, and, isNull } from "drizzle-orm";
import { RegisterForm } from "./RegisterForm";
import { validateInviteToken } from "@/admin/pilots/actions";

const REGISTERABLE_PLANS = [
  "free",
  "starter",
  "pro",
  "business",
  "community_homebrewer",
] as const;

type RegisterablePlan = (typeof REGISTERABLE_PLANS)[number];

function isRegisterablePlan(slug: string): slug is RegisterablePlan {
  return (REGISTERABLE_PLANS as readonly string[]).includes(slug);
}

interface RegisterPageProps {
  searchParams: Promise<{ plan?: string; invite?: string }>;
}

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps): Promise<React.ReactNode> {
  const t = await getTranslations("auth");
  const locale = await getLocale();
  const { plan: planParam, invite: inviteParam } = await searchParams;

  // No plan and no invite -> redirect to pricing
  if (!planParam && !inviteParam) {
    redirect(`/${locale}/pricing`);
  }

  let planSlug: string | undefined;
  let planName: string | undefined;
  let planPrice: string | undefined;
  let inviteEmail: string | undefined;
  let inviteToken: string | undefined;
  let inviteError = false;

  // Handle invite token
  if (inviteParam) {
    const invitation = await validateInviteToken(inviteParam);
    if (invitation) {
      inviteEmail = invitation.email;
      inviteToken = invitation.token;
      planSlug = invitation.planSlug;

      // Load plan details for the invite's plan
      const [planData] = await db
        .select({
          name: plans.name,
          basePrice: plans.basePrice,
        })
        .from(plans)
        .where(
          and(
            eq(plans.slug, invitation.planSlug),
            eq(plans.isActive, true),
            isNull(plans.validTo),
          ),
        )
        .limit(1);

      if (planData) {
        planName = planData.name;
        planPrice = planData.basePrice;
      }
    } else {
      inviteError = true;
    }
  }

  // Handle plan param (only if no invite)
  if (planParam && !inviteParam) {
    // Validate plan slug
    if (!isRegisterablePlan(planParam)) {
      redirect(`/${locale}/pricing`);
    }

    // Load plan details from DB
    const [planData] = await db
      .select({
        name: plans.name,
        basePrice: plans.basePrice,
      })
      .from(plans)
      .where(
        and(
          eq(plans.slug, planParam),
          eq(plans.isActive, true),
          isNull(plans.validTo),
        ),
      )
      .limit(1);

    if (!planData) {
      redirect(`/${locale}/pricing`);
    }

    planSlug = planParam;
    planName = planData.name;
    planPrice = planData.basePrice;
  }

  if (inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="w-full max-w-md space-y-6 px-4 text-center">
          <h1 className="text-3xl font-bold">ProfiBrew</h1>
          <p className="text-destructive">{t("inviteInvalid")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">ProfiBrew</h1>
          <p className="mt-2 text-muted-foreground">{t("register")}</p>
        </div>
        <RegisterForm
          planSlug={planSlug}
          planName={planName}
          planPrice={planPrice}
          inviteEmail={inviteEmail}
          inviteToken={inviteToken}
        />
      </div>
    </div>
  );
}
