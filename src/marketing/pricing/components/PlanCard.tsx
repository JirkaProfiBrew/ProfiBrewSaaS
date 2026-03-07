"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PlanCardData {
  slug: string;
  name: string;
  description: string | null;
  basePrice: string;
  currency: string;
  billingPeriod: string | null;
  includedHl: string | null;
  maxUsers: number | null;
  includedModules: string[];
  apiAccess: boolean | null;
  integrations: boolean | null;
  prioritySupport: boolean | null;
  sortOrder: number | null;
}

const ALL_MODULES = ["brewery", "stock", "sales", "finance", "plan"] as const;

interface PlanCardProps {
  plan: PlanCardData;
  variant?: "commercial" | "community";
}

function getCtaConfig(
  slug: string,
  t: ReturnType<typeof useTranslations<"pricing">>,
): { label: string; href: string } {
  switch (slug) {
    case "free":
      return { label: t("ctaFree"), href: "/register?plan=free" };
    case "community_homebrewer":
      return { label: t("ctaRegister"), href: "/register?plan=community_homebrewer" };
    case "community_school":
      return { label: t("ctaSchool"), href: "/contact/school" };
    default:
      return { label: t("ctaTrial"), href: `/register?plan=${slug}` };
  }
}

export function PlanCard({ plan, variant = "commercial" }: PlanCardProps): React.ReactNode {
  const t = useTranslations("pricing");
  const price = parseFloat(plan.basePrice);
  const isRecommended = plan.slug === "pro";
  const cta = getCtaConfig(plan.slug, t);

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        isRecommended && "border-blue-500 ring-2 ring-blue-500/20",
        variant === "community" && "bg-muted/30",
      )}
    >
      {isRecommended && (
        <Badge
          variant="secondary"
          className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white"
        >
          {t("recommended")}
        </Badge>
      )}
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <CardDescription className="text-xs">{plan.description}</CardDescription>
        <div className="mt-3">
          <span className="text-3xl font-bold">
            {price === 0 ? t("free") : `${price.toLocaleString("cs-CZ")}`}
          </span>
          {price > 0 && (
            <span className="text-sm text-muted-foreground ml-1">
              {plan.currency}/{t("month")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {/* Limits */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("includedHl")}</span>
            <span className="font-medium">
              {plan.includedHl ? `${plan.includedHl} hl` : t("unlimited")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("maxUsers")}</span>
            <span className="font-medium">
              {plan.maxUsers ?? t("unlimited")}
            </span>
          </div>
        </div>

        {/* Modules */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("modules")}
          </p>
          {ALL_MODULES.map((mod) => {
            const hasModule = plan.includedModules.includes(mod);
            return (
              <div key={mod} className="flex items-center gap-2 text-sm">
                {hasModule ? (
                  <Check className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={cn(!hasModule && "text-muted-foreground/40")}>
                  {t(`moduleNames.${mod}`)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Extras */}
        <div className="space-y-1 pt-2 border-t">
          <FeatureRow label={t("apiAccess")} enabled={plan.apiAccess ?? false} />
          <FeatureRow label={t("integrations")} enabled={plan.integrations ?? false} />
          <FeatureRow label={t("prioritySupport")} enabled={plan.prioritySupport ?? false} />
        </div>
      </CardContent>
      <CardFooter>
        <Button
          asChild
          className="w-full"
          variant={isRecommended ? "default" : "outline"}
        >
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }): React.ReactNode {
  return (
    <div className="flex items-center gap-2 text-sm">
      {enabled ? (
        <Check className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
      <span className={cn(!enabled && "text-muted-foreground/40")}>{label}</span>
    </div>
  );
}
