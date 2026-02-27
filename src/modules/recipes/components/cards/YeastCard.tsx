"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { IngredientCard } from "./IngredientCard";
import type { RecipeItem } from "../../types";

interface YeastCardProps {
  item: RecipeItem;
  estimatedFg: number | null;
  estimatedAbv: number | null;
  onAmountChange: (id: string, amount: string) => void;
  onRemove: (id: string) => void;
}

export function YeastCard({ item, estimatedFg, estimatedAbv, onAmountChange, onRemove }: YeastCardProps): React.ReactNode {
  const t = useTranslations("recipes");
  const unitSymbol = item.unitSymbol ?? "ks";

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
            className="h-7 w-20 text-sm"
            step="1"
          />
          <span className="text-xs text-muted-foreground">{unitSymbol}</span>
        </div>
        {estimatedFg != null && estimatedAbv != null && (
          <div className="text-xs text-muted-foreground">
            {t("designer.cards.estimatedFg")}: <span className="font-medium text-foreground">{estimatedFg.toFixed(1)} °P</span>
            {" → "}{t("designer.feedback.abv")}: <span className="font-medium text-foreground">{estimatedAbv.toFixed(1)}%</span>
          </div>
        )}
      </div>
    </IngredientCard>
  );
}
