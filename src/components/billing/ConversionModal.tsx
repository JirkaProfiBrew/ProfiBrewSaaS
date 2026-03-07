"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { confirmConversion, markConversionModalShown } from "@/modules/billing/actions";
import { toast } from "sonner";

interface PlanOption {
  slug: string;
  name: string;
  basePrice: string;
  currency: string;
}

interface ConversionModalProps {
  tenantId: string;
  currentPlanSlug: string;
  plans: PlanOption[];
  open: boolean;
}

export function ConversionModal({
  tenantId,
  currentPlanSlug,
  plans,
  open,
}: ConversionModalProps): React.ReactNode {
  const t = useTranslations("billing");
  const [selectedPlan, setSelectedPlan] = useState<string>(currentPlanSlug);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(open);
  const [isPending, startTransition] = useTransition();

  function handleConfirm(): void {
    if (!consentChecked) return;

    startTransition(async () => {
      const result = await confirmConversion(selectedPlan);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(t("conversionConfirm"));
      setIsOpen(false);
    });
  }

  function handleDismiss(): void {
    startTransition(async () => {
      await markConversionModalShown();
      setIsOpen(false);
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(val) => {
      if (!val) {
        handleDismiss();
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("conversionTitle")}</DialogTitle>
          <DialogDescription>{t("conversionSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Plan selection */}
          <RadioGroup
            value={selectedPlan}
            onValueChange={setSelectedPlan}
            className="space-y-3"
          >
            {plans.map((plan) => (
              <div key={plan.slug} className="flex items-center space-x-3">
                <RadioGroupItem value={plan.slug} id={`plan-${plan.slug}`} />
                <Label
                  htmlFor={`plan-${plan.slug}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span>
                      {plan.slug === currentPlanSlug
                        ? t("conversionKeepPlan", { planName: plan.name })
                        : plan.name}
                    </span>
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

          {/* Consent checkbox */}
          <div className="flex items-start space-x-3">
            <Checkbox
              id="conversion-consent"
              checked={consentChecked}
              onCheckedChange={(checked) => setConsentChecked(checked === true)}
            />
            <Label
              htmlFor="conversion-consent"
              className="text-sm leading-snug cursor-pointer"
            >
              {t("conversionConsent")}
            </Label>
          </div>

          {/* Invoice note */}
          <p className="text-xs text-muted-foreground">
            {t("conversionInvoiceNote")}
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleConfirm}
              disabled={!consentChecked || isPending}
              className="w-full"
            >
              {t("conversionConfirm")}
            </Button>
            <a
              href="mailto:info@profibrew.com?subject=Zrušení účtu"
              className="text-center text-sm text-muted-foreground hover:underline"
            >
              {t("conversionCancel")}
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
