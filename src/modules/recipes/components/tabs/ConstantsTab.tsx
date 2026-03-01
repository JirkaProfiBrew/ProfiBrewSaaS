"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RecipeConstantsOverride, BrewingSystemInput } from "../../types";

interface ConstantsTabProps {
  constants: RecipeConstantsOverride;
  systemDefaults: BrewingSystemInput;
  systemName: string | null;
  onChange: (constants: RecipeConstantsOverride) => void;
  onReset: () => void;
}

// Constant rows definition
interface ConstantRow {
  key: keyof RecipeConstantsOverride;
  systemKey: keyof BrewingSystemInput;
  labelKey: string;
}

const CONSTANT_ROWS: ConstantRow[] = [
  { key: "efficiencyPct", systemKey: "efficiencyPct", labelKey: "efficiency" },
  { key: "evaporationRatePctPerHour", systemKey: "evaporationRatePctPerHour", labelKey: "evaporationRate" },
  { key: "kettleTrubLossL", systemKey: "kettleTrubLossL", labelKey: "kettleTrubLoss" },
  { key: "whirlpoolLossPct", systemKey: "whirlpoolLossPct", labelKey: "whirlpoolLoss" },
  { key: "fermentationLossPct", systemKey: "fermentationLossPct", labelKey: "fermentationLoss" },
  { key: "extractEstimate", systemKey: "extractEstimate", labelKey: "extractEstimate" },
  { key: "waterPerKgMalt", systemKey: "waterPerKgMalt", labelKey: "waterPerKg" },
  { key: "grainAbsorptionLPerKg", systemKey: "grainAbsorptionLPerKg", labelKey: "grainAbsorption" },
  { key: "waterReserveL", systemKey: "waterReserveL", labelKey: "waterReserve" },
];

export function ConstantsTab({ constants, systemDefaults, systemName, onChange, onReset }: ConstantsTabProps): React.ReactNode {
  const t = useTranslations("recipes");

  const hasOverrides = useMemo(() => {
    return CONSTANT_ROWS.some(row => {
      const recipeVal = constants[row.key];
      return recipeVal != null && recipeVal !== systemDefaults[row.systemKey];
    });
  }, [constants, systemDefaults]);

  function handleValueChange(key: keyof RecipeConstantsOverride, value: string): void {
    const numVal = value === "" ? undefined : parseFloat(value);
    onChange({ ...constants, [key]: numVal });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t("designer.constants.title")}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {systemName
              ? t("designer.constants.source", { name: systemName })
              : t("designer.constants.noSystem")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset} disabled={!hasOverrides}>
          <RotateCcw className="mr-1 size-4" />
          {t("designer.constants.resetToSystem")}
        </Button>
      </div>

      {/* Warning */}
      {hasOverrides && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0" />
          {t("designer.constants.overrideWarning")}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <div className="grid grid-cols-3 gap-0 text-sm">
          {/* Header row */}
          <div className="border-b bg-muted/50 px-3 py-2 font-medium">{t("designer.constants.paramHeader")}</div>
          <div className="border-b border-l bg-muted/50 px-3 py-2 font-medium text-center">{t("designer.constants.systemHeader")}</div>
          <div className="border-b border-l bg-muted/50 px-3 py-2 font-medium text-center">{t("designer.constants.recipeHeader")}</div>

          {/* Data rows */}
          {CONSTANT_ROWS.map((row) => {
            const systemVal = systemDefaults[row.systemKey];
            const recipeVal = constants[row.key];
            const isOverridden = recipeVal != null && recipeVal !== systemVal;

            return (
              <div key={row.key} className="contents">
                <div className="border-b px-3 py-2 text-sm">{t(`designer.constants.${row.labelKey}`)}</div>
                <div className="border-b border-l px-3 py-2 text-center text-muted-foreground">
                  {systemVal}
                </div>
                <div className="border-b border-l px-3 py-2 flex justify-center">
                  <Input
                    type="number"
                    value={recipeVal ?? systemVal}
                    onChange={(e) => handleValueChange(row.key, e.target.value)}
                    className={cn("h-7 w-24 text-center text-sm", isOverridden && "font-bold text-amber-700 dark:text-amber-300")}
                    step="0.1"
                  />
                </div>
              </div>
            );
          })}

          {/* Boil time row (from recipe, not from system) */}
          <div className="contents">
            <div className="px-3 py-2 text-sm">{t("designer.constants.boilTime")}</div>
            <div className="border-l px-3 py-2 text-center text-muted-foreground">&mdash;</div>
            <div className="border-l px-3 py-2 flex justify-center">
              <Input
                type="number"
                value={constants.boilTimeMin ?? 60}
                onChange={(e) => handleValueChange("boilTimeMin", e.target.value)}
                className="h-7 w-24 text-center text-sm"
                step="1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
