"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { WelcomeStep } from "./steps/WelcomeStep";
import { BreweryInfoStep } from "./steps/BreweryInfoStep";
import { WarehousesStep } from "./steps/WarehousesStep";
import { EconomicsStep } from "./steps/EconomicsStep";
import { ExciseStep } from "./steps/ExciseStep";
import { DoneStep } from "./steps/DoneStep";
import { updateOnboardingStep } from "@/modules/onboarding/actions";

const TOTAL_STEPS = 6;

export interface WarehouseData {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
}

/** Tracks values changed by the user during onboarding steps */
interface OnboardingOverrides {
  tenantName?: string;
  stockMode?: string;
  overheadPercentage?: number;
  overheadFixed?: number;
  batchCost?: number;
  generateExpenseFromReceipt?: boolean;
  exciseEnabled?: boolean;
}

interface OnboardingWizardProps {
  tenantId: string;
  tenantName: string;
  currentStep: number;
  tenantSettings: Record<string, unknown>;
  shopSettings: Record<string, unknown>;
  warehouses: WarehouseData[];
  locale: string;
}

export function OnboardingWizard({
  tenantName,
  currentStep,
  tenantSettings,
  shopSettings,
  warehouses,
  locale,
}: OnboardingWizardProps): React.ReactNode {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState<number>(
    currentStep > 0 && currentStep < 99 ? currentStep : 1
  );
  const [overrides, setOverrides] = useState<OnboardingOverrides>({});

  const goNext = useCallback(async (): Promise<void> => {
    const nextStep = step + 1;
    if (nextStep <= TOTAL_STEPS) {
      await updateOnboardingStep(nextStep);
      setStep(nextStep);
    }
  }, [step]);

  const goBack = useCallback((): void => {
    if (step > 1) {
      setStep(step - 1);
    }
  }, [step]);

  const progressValue = (step / TOTAL_STEPS) * 100;

  // Merge overrides into settings for DoneStep
  const effectiveTenantName = overrides.tenantName ?? tenantName;
  const effectiveShopSettings: Record<string, unknown> = {
    ...shopSettings,
    ...(overrides.stockMode !== undefined && { stockMode: overrides.stockMode }),
    ...(overrides.overheadPercentage !== undefined && { overheadPercentage: overrides.overheadPercentage }),
    ...(overrides.overheadFixed !== undefined && { overheadFixed: overrides.overheadFixed }),
    ...(overrides.batchCost !== undefined && { batchCost: overrides.batchCost }),
    ...(overrides.generateExpenseFromReceipt !== undefined && { generateExpenseFromReceipt: overrides.generateExpenseFromReceipt }),
  };
  const effectiveTenantSettings: Record<string, unknown> = {
    ...tenantSettings,
    ...(overrides.exciseEnabled !== undefined && { excise_enabled: overrides.exciseEnabled }),
  };

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      {step > 1 && step < TOTAL_STEPS && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t("step", { current: step, total: TOTAL_STEPS })}</span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>
      )}

      {/* Step content */}
      {step === 1 && <WelcomeStep onNext={goNext} locale={locale} />}
      {step === 2 && (
        <BreweryInfoStep
          tenantName={effectiveTenantName}
          tenantSettings={effectiveTenantSettings}
          onNext={goNext}
          onBack={goBack}
          onSave={(name) => setOverrides((prev) => ({ ...prev, tenantName: name }))}
        />
      )}
      {step === 3 && (
        <WarehousesStep
          warehouses={warehouses}
          shopSettings={effectiveShopSettings}
          onNext={goNext}
          onBack={goBack}
          onSave={(stockMode) => setOverrides((prev) => ({ ...prev, stockMode }))}
        />
      )}
      {step === 4 && (
        <EconomicsStep
          shopSettings={effectiveShopSettings}
          onNext={goNext}
          onBack={goBack}
          onSave={(params) => setOverrides((prev) => ({ ...prev, ...params }))}
        />
      )}
      {step === 5 && (
        <ExciseStep
          tenantSettings={effectiveTenantSettings}
          onNext={goNext}
          onBack={goBack}
          onSave={(enabled) => setOverrides((prev) => ({ ...prev, exciseEnabled: enabled }))}
        />
      )}
      {step === 6 && (
        <DoneStep
          tenantName={effectiveTenantName}
          tenantSettings={effectiveTenantSettings}
          shopSettings={effectiveShopSettings}
          locale={locale}
        />
      )}
    </div>
  );
}
