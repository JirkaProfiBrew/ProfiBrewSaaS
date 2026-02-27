"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { IngredientCard } from "./IngredientCard";
import type { RecipeItem } from "../../types";

interface MaltCardProps {
  item: RecipeItem;
  totalMaltKg: number;
  onAmountChange: (id: string, amount: string) => void;
  onRemove: (id: string) => void;
}

export function MaltCard({ item, totalMaltKg, onAmountChange, onRemove }: MaltCardProps): React.ReactNode {
  const t = useTranslations("recipes");

  const amountNum = parseFloat(item.amountG) || 0;
  const factor = item.unitToBaseFactor ?? 1;
  const amountKg = amountNum * factor;
  const sharePct = totalMaltKg > 0 ? (amountKg / totalMaltKg * 100).toFixed(1) : "0";
  const extractPct = item.itemExtractPercent ? parseFloat(item.itemExtractPercent) : null;
  const ebcVal = item.itemEbc ? parseFloat(item.itemEbc) : null;
  const unitSymbol = item.unitSymbol ?? "kg";

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
