"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { completeOnboarding } from "@/modules/onboarding/actions";
import { CheckCircle2 } from "lucide-react";

interface DoneStepProps {
  tenantName: string;
  tenantSettings: Record<string, unknown>;
  shopSettings: Record<string, unknown>;
  locale: string;
}

export function DoneStep({
  tenantName,
  tenantSettings,
  shopSettings,
  locale,
}: DoneStepProps): React.ReactNode {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleFinish(): void {
    startTransition(async () => {
      await completeOnboarding();
      router.push(`/${locale}/dashboard`);
    });
  }

  const stockMode = (shopSettings.stock_mode as string) ?? "liters";
  const overheadPct = (shopSettings.overhead_pct as number) ?? 15;
  const overheadFixed = (shopSettings.overhead_czk as number) ?? 1000;
  const batchCost = (shopSettings.brew_cost_czk as number) ?? 2000;
  const exciseEnabled = (tenantSettings.excise_enabled as boolean) ?? false;

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-2xl">{t("done.title")}</CardTitle>
        <CardDescription>{t("done.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-4">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("done.breweryName")}</dt>
              <dd className="font-medium">{tenantName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("done.stockMode")}</dt>
              <dd className="font-medium">
                {stockMode === "packages"
                  ? t("warehouses.stockModePackages")
                  : t("warehouses.stockModeLiters")}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("done.overhead")}</dt>
              <dd className="font-medium">{overheadPct} %</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {t("done.overheadFixed")}
              </dt>
              <dd className="font-medium">
                {overheadFixed.toLocaleString(locale)} {t("economics.overheadFixedUnit")}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("done.batchCost")}</dt>
              <dd className="font-medium">
                {batchCost.toLocaleString(locale)} {t("economics.batchCostUnit")}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("done.excise")}</dt>
              <dd className="font-medium">
                {exciseEnabled ? t("done.yes") : t("done.no")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex justify-center pt-2">
          <Button onClick={handleFinish} disabled={isPending} size="lg">
            {t("done.goToDashboard")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
