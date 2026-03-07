"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { signUp } from "@/lib/auth/actions";
import type { SignUpPurpose } from "@/lib/auth/actions";

interface RegisterFormProps {
  planSlug?: string;
  planName?: string;
  planPrice?: string;
  inviteEmail?: string;
}

const TRIAL_PLANS = ["starter", "pro", "business"];
const FREE_PLANS = ["free", "community_homebrewer"];

function derivePurpose(planSlug?: string): SignUpPurpose {
  if (planSlug === "community_homebrewer") return "homebrewer";
  return "professional";
}

function isTrialPlan(slug?: string): boolean {
  return slug !== undefined && TRIAL_PLANS.includes(slug);
}

function isFreePlan(slug?: string): boolean {
  return slug !== undefined && FREE_PLANS.includes(slug);
}

export function RegisterForm({
  planSlug,
  planName,
  planPrice,
  inviteEmail,
}: RegisterFormProps): React.ReactNode {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [purpose, setPurpose] = useState<SignUpPurpose>(derivePurpose(planSlug));

  const hasPlan = planSlug !== undefined;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const fullName = formData.get("fullName") as string;
    const breweryName = formData.get("breweryName") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);

    const result = await signUp(
      email,
      password,
      breweryName,
      fullName,
      hasPlan ? derivePurpose(planSlug) : purpose,
      planSlug,
    );

    if (result?.error) {
      setError(t("registerError"));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader />
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Plan summary card when plan is selected */}
          {hasPlan && planName && (
            <div className="rounded-md border bg-muted/50 p-3 text-center space-y-1">
              <p className="text-sm font-medium">
                {isTrialPlan(planSlug)
                  ? t("planSummaryTrial", { planName })
                  : t("planSummaryFree", { planName })}
              </p>
              <Link
                href="/pricing"
                className="text-xs text-primary hover:underline"
              >
                {t("changePlan")}
              </Link>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fullName">{t("fullName")}</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              required
            />
          </div>

          {/* Purpose radio — only when no plan is selected */}
          {!hasPlan && (
            <div className="space-y-3">
              <Label>{t("purpose")}</Label>
              <RadioGroup
                value={purpose}
                onValueChange={(v) => setPurpose(v as SignUpPurpose)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="professional" id="purpose-pro" />
                  <Label htmlFor="purpose-pro" className="font-normal">
                    {t("purposeProfessional")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="homebrewer" id="purpose-home" />
                  <Label htmlFor="purpose-home" className="font-normal">
                    {t("purposeHomebrewer")}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="breweryName">
              {(hasPlan ? derivePurpose(planSlug) : purpose) === "professional"
                ? t("breweryName")
                : t("breweryNameHomebrewer")}
            </Label>
            <Input
              id="breweryName"
              name="breweryName"
              type="text"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={inviteEmail ?? ""}
              readOnly={inviteEmail !== undefined}
              className={inviteEmail !== undefined ? "bg-muted" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {/* Info text — plan-aware */}
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground space-y-1">
            {hasPlan ? (
              isTrialPlan(planSlug) ? (
                <>
                  <p>{t("infoTrial1")}</p>
                  <p>{t("infoTrial2")}</p>
                  <p>{t("infoTrial3")}</p>
                </>
              ) : isFreePlan(planSlug) ? (
                planSlug === "community_homebrewer" ? (
                  <>
                    <p>{t("infoHomebrewer1")}</p>
                    <p>{t("infoHomebrewer2")}</p>
                    <p>{t("infoHomebrewer3")}</p>
                  </>
                ) : (
                  <>
                    <p>{t("infoFree1")}</p>
                    <p>{t("infoFree2")}</p>
                    <p>{t("infoFree3")}</p>
                  </>
                )
              ) : (
                <>
                  <p>{t("infoFree1")}</p>
                  <p>{t("infoFree2")}</p>
                  <p>{t("infoFree3")}</p>
                </>
              )
            ) : purpose === "professional" ? (
              <>
                <p>{t("infoProfessional1")}</p>
                <p>{t("infoProfessional2")}</p>
                <p>{t("infoProfessional3")}</p>
              </>
            ) : (
              <>
                <p>{t("infoHomebrewer1")}</p>
                <p>{t("infoHomebrewer2")}</p>
                <p>{t("infoHomebrewer3")}</p>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox id="terms" required />
            <Label htmlFor="terms" className="text-sm font-normal">
              {t("termsAgree")}
            </Label>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("creatingAccount") : t("register")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("login")}
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          {t("schoolLink")}{" "}
          <Link href="/contact/school" className="text-primary hover:underline">
            {t("schoolLinkAction")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
