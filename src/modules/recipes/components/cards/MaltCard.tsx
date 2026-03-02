"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { IngredientCard } from "./IngredientCard";
import type { RecipeItem } from "../../types";

interface MaltCardProps {
  item: RecipeItem;
  totalMaltKg: number;
  mode: "kg" | "percent";
  percent: number;
  maltRequiredKg: number;
  onAmountChange: (id: string, amount: string) => void;
  onPercentChange: (id: string, percent: number) => void;
  onRemove: (id: string) => void;
}

export function MaltCard({
  item,
  totalMaltKg,
  mode,
  percent,
  maltRequiredKg,
  onAmountChange,
  onPercentChange,
  onRemove,
}: MaltCardProps): React.ReactNode {
  const t = useTranslations("recipes");

  const amountNum = parseFloat(item.amountG) || 0;
  const factor = item.unitToBaseFactor ?? 1;
  const amountKg = amountNum * factor;
  const sharePct = totalMaltKg > 0 ? (amountKg / totalMaltKg * 100).toFixed(1) : "0";
  const extractPct = item.itemExtractPercent ? parseFloat(item.itemExtractPercent) : null;
  const ebcVal = item.itemEbc ? parseFloat(item.itemEbc) : null;
  const unitSymbol = item.unitSymbol ?? "kg";
  const computedKg = maltRequiredKg * percent / 100;

  if (mode === "percent") {
    return (
      <IngredientCard
        id={item.id}
        title={item.itemName ?? item.itemId}
        subtitle={item.itemBrand ?? undefined}
        onRemove={() => onRemove(item.id)}
      >
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <Slider
              value={[percent]}
              onValueChange={(vals) => onPercentChange(item.id, vals[0] ?? 0)}
              min={0}
              max={100}
              step={0.5}
              className="flex-1"
            />
            <Input
              type="number"
              value={percent}
              onChange={(e) => onPercentChange(item.id, parseFloat(e.target.value) || 0)}
              className="h-7 w-20 text-sm text-right"
              step="0.5"
              min={0}
              max={100}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              = <span className="font-medium text-foreground">{computedKg.toFixed(1)}</span> kg
              {maltRequiredKg > 0 && (
                <> ({t("designer.maltMode.fromTotal")} {maltRequiredKg.toFixed(1)} kg)</>
              )}
            </span>
            {ebcVal != null && (
              <span>{t("designer.cards.ebc")}: <span className="font-medium text-foreground">{ebcVal}</span></span>
            )}
            {extractPct != null && (
              <span>{t("designer.cards.extract")}: <span className="font-medium text-foreground">{extractPct}%</span></span>
            )}
          </div>
        </div>
      </IngredientCard>
    );
  }

  return (
    <IngredientCard
      id={item.id}
      title={item.itemName ?? item.itemId}
      subtitle={item.itemBrand ?? undefined}
      onRemove={() => onRemove(item.id)}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">{t("designer.cards.amount")}:</label>
          <Input
            type="number"
            value={item.amountG}
            onChange={(e) => onAmountChange(item.id, e.target.value)}
            className="h-7 w-24 text-sm"
            step="0.1"
          />
          <span className="text-xs text-muted-foreground">{unitSymbol}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("designer.cards.share")}:</span>
          <span className="font-medium text-foreground">{sharePct}%</span>
        </div>
        {ebcVal != null && (
          <div className="text-xs text-muted-foreground">
            {t("designer.cards.ebc")}: <span className="font-medium text-foreground">{ebcVal}</span>
          </div>
        )}
        {extractPct != null && (
          <div className="text-xs text-muted-foreground">
            {t("designer.cards.extract")}: <span className="font-medium text-foreground">{extractPct}%</span>
          </div>
        )}
      </div>
    </IngredientCard>
  );
}
