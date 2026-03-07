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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { updateWarehouseSettings } from "@/modules/onboarding/actions";
import type { WarehouseData } from "../OnboardingWizard";

interface WarehousesStepProps {
  warehouses: WarehouseData[];
  shopSettings: Record<string, unknown>;
  onNext: () => Promise<void>;
  onBack: () => void;
  onSave?: (stockMode: string) => void;
}

export function WarehousesStep({
  warehouses: initialWarehouses,
  shopSettings,
  onNext,
  onBack,
  onSave,
}: WarehousesStepProps): React.ReactNode {
  const t = useTranslations("onboarding");
  const [isPending, startTransition] = useTransition();

  const [warehouseList, setWarehouseList] = useState(
    initialWarehouses.map((w) => ({ ...w }))
  );
  const [stockMode, setStockMode] = useState<string>(
    (shopSettings.stockMode as string) ?? "liters"
  );

  function updateWarehouse(
    id: string,
    field: "name" | "isActive",
    value: string | boolean
  ): void {
    setWarehouseList((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );
  }

  function handleSubmit(): void {
    startTransition(async () => {
      await updateWarehouseSettings(
        warehouseList.map((w) => ({
          id: w.id,
          name: w.name,
          isActive: w.isActive,
        })),
        stockMode
      );
      onSave?.(stockMode);
      await onNext();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("warehouses.title")}</CardTitle>
        <CardDescription>{t("warehouses.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Warehouse list */}
        <div className="space-y-3">
          {warehouseList.map((wh) => (
            <div
              key={wh.id}
              className="flex items-center gap-4 rounded-md border p-3"
            >
              <div className="flex-1">
                <Label
                  htmlFor={`wh-name-${wh.id}`}
                  className="text-xs text-muted-foreground"
                >
                  {t("warehouses.nameLabel")}
                </Label>
                <Input
                  id={`wh-name-${wh.id}`}
                  value={wh.name}
                  onChange={(e) =>
                    updateWarehouse(wh.id, "name", e.target.value)
                  }
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <Label
                  htmlFor={`wh-active-${wh.id}`}
                  className="text-xs text-muted-foreground"
                >
                  {t("warehouses.activeLabel")}
                </Label>
                <Switch
                  id={`wh-active-${wh.id}`}
                  checked={wh.isActive}
                  onCheckedChange={(checked) =>
                    updateWarehouse(wh.id, "isActive", checked)
                  }
                />
              </div>
            </div>
          ))}
        </div>

        {/* Stock mode */}
        <div className="space-y-3">
          <Label className="text-base font-medium">
            {t("warehouses.stockModeLabel")}
          </Label>
          <RadioGroup
            value={stockMode}
            onValueChange={setStockMode}
            className="space-y-3"
          >
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="liters" id="stock-liters" className="mt-1" />
              <div>
                <Label htmlFor="stock-liters" className="font-medium">
                  {t("warehouses.stockModeLiters")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("warehouses.stockModeLitersDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem
                value="packages"
                id="stock-packages"
                className="mt-1"
              />
              <div>
                <Label htmlFor="stock-packages" className="font-medium">
                  {t("warehouses.stockModePackages")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("warehouses.stockModePackagesDesc")}
                </p>
              </div>
            </div>
          </RadioGroup>
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
