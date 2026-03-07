"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateEconomicParams } from "@/modules/onboarding/actions";

interface EconomicsStepProps {
  shopSettings: Record<string, unknown>;
  onNext: () => Promise<void>;
  onBack: () => void;
  onSave?: (params: {
    overheadPercentage: number;
    overheadFixed: number;
    batchCost: number;
    generateExpenseFromReceipt: boolean;
  }) => void;
}

export function EconomicsStep({
  shopSettings,
  onNext,
  onBack,
  onSave,
}: EconomicsStepProps): React.ReactNode {
  const t = useTranslations("onboarding");
  const [isPending, startTransition] = useTransition();

  const [overheadPercentage, setOverheadPercentage] = useState<number>(
    (shopSettings.overheadPercentage as number) ?? 15
  );
  const [overheadFixed, setOverheadFixed] = useState<number>(
    (shopSettings.overheadFixed as number) ?? 1000
  );
  const [batchCost, setBatchCost] = useState<number>(
    (shopSettings.batchCost as number) ?? 2000
  );
  const [generateExpense, setGenerateExpense] = useState<boolean>(
    (shopSettings.generateExpenseFromReceipt as boolean) ?? false
  );

  function handleSubmit(): void {
    startTransition(async () => {
      await updateEconomicParams({
        overheadPercentage,
        overheadFixed,
        batchCost,
        generateExpenseFromReceipt: generateExpense,
      });
      onSave?.({
        overheadPercentage,
        overheadFixed,
        batchCost,
        generateExpenseFromReceipt: generateExpense,
      });
      await onNext();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("economics.title")}</CardTitle>
        <CardDescription>{t("economics.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Overhead percentage */}
        <div className="space-y-2">
          <Label htmlFor="overhead-pct">{t("economics.overheadPercentage")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="overhead-pct"
              type="number"
              min={0}
              max={100}
              value={overheadPercentage}
              onChange={(e) => setOverheadPercentage(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              {t("economics.overheadPercentageUnit")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("economics.overheadPercentageDesc")}
          </p>
        </div>

        {/* Fixed overhead */}
        <div className="space-y-2">
          <Label htmlFor="overhead-fixed">{t("economics.overheadFixed")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="overhead-fixed"
              type="number"
              min={0}
              value={overheadFixed}
              onChange={(e) => setOverheadFixed(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">
              {t("economics.overheadFixedUnit")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("economics.overheadFixedDesc")}
          </p>
        </div>

        {/* Batch cost */}
        <div className="space-y-2">
          <Label htmlFor="batch-cost">{t("economics.batchCost")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="batch-cost"
              type="number"
              min={0}
              value={batchCost}
              onChange={(e) => setBatchCost(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">
              {t("economics.batchCostUnit")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("economics.batchCostDesc")}
          </p>
        </div>

        {/* Generate expense from receipt */}
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="generate-expense" className="font-medium">
              {t("economics.generateExpense")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("economics.generateExpenseDesc")}
            </p>
          </div>
          <Switch
            id="generate-expense"
            checked={generateExpense}
            onCheckedChange={setGenerateExpense}
          />
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            {t("back")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {t("next")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
