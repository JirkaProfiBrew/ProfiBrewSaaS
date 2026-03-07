"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { changeTrialPlan } from "@/modules/billing/actions";
import { toast } from "sonner";

const ALL_MODULES = ["brewery", "stock", "sales", "finance", "plan"] as const;

interface PlanOption {
  slug: string;
  name: string;
  basePrice: string;
  currency: string;
  includedModules: string[];
}

interface TrialPlanChangerProps {
  currentPlanSlug: string;
  plans: PlanOption[];
  moduleNames: Record<string, string>;
}

export function TrialPlanChanger({
  currentPlanSlug,
  plans,
  moduleNames,
}: TrialPlanChangerProps): React.ReactNode {
  const t = useTranslations("billing");
  const [selectedPlan, setSelectedPlan] = useState<string>(currentPlanSlug);
  const [isPending, startTransition] = useTransition();

  const selectedPlanData = plans.find((p) => p.slug === selectedPlan);

  function handleSave(): void {
    if (selectedPlan === currentPlanSlug) return;

    startTransition(async () => {
      const result = await changeTrialPlan(selectedPlan);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(t("planChanged"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("changeTrialPlan")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("changeTrialPlanDesc")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={selectedPlan}
          onValueChange={setSelectedPlan}
          className="space-y-2"
        >
          {plans.map((plan) => (
            <div key={plan.slug} className="flex items-center space-x-3">
              <RadioGroupItem value={plan.slug} id={`trial-plan-${plan.slug}`} />
              <Label
                htmlFor={`trial-plan-${plan.slug}`}
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{plan.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {parseFloat(plan.basePrice) === 0
                      ? "Free"
                      : `${parseFloat(plan.basePrice).toLocaleString("cs-CZ")} ${plan.currency}/m`}
                  </span>
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>

        {/* Module preview for selected plan */}
        {selectedPlanData && (
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium mb-2">{t("modulesTitle")}</p>
            <div className="grid grid-cols-2 gap-1">
              {ALL_MODULES.map((mod) => {
                const hasModule = selectedPlanData.includedModules.includes(mod);
                return (
                  <div key={mod} className="flex items-center gap-2 text-sm py-0.5">
                    {hasModule ? (
                      <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={!hasModule ? "text-muted-foreground/40" : ""}>
                      {moduleNames[mod] ?? mod}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={selectedPlan === currentPlanSlug || isPending}
          className="w-full"
        >
          {t("changePlanButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
