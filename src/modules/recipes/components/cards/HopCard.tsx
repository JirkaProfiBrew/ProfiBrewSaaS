"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IngredientCard } from "./IngredientCard";
import type { RecipeItem } from "../../types";

interface HopCardProps {
  item: RecipeItem;
  ibuContribution: number;
  totalIbu: number;
  onAmountChange: (id: string, amount: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: number | null) => void;
  onRemove: (id: string) => void;
}

export function HopCard({ item, ibuContribution, totalIbu, onAmountChange, onStageChange, onTimeChange, onRemove }: HopCardProps): React.ReactNode {
  const t = useTranslations("recipes");

  const alphaVal = item.itemAlpha ? parseFloat(item.itemAlpha) : null;
  const unitSymbol = item.unitSymbol ?? "g";
  const ibuPct = totalIbu > 0 ? (ibuContribution / totalIbu * 100).toFixed(1) : "0";

  return (
    <IngredientCard
      id={item.id}
      title={item.itemName ?? item.itemId}
      subtitle={alphaVal != null ? `${t("designer.cards.alpha")}: ${alphaVal}%` : undefined}
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
            step="1"
          />
          <span className="text-xs text-muted-foreground">{unitSymbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">{t("designer.cards.phase")}:</label>
          <Select value={item.useStage ?? "boil"} onValueChange={(v) => onStageChange(item.id, v)}>
            <SelectTrigger className="h-7 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="boil">{t("ingredients.stages.boil")}</SelectItem>
              <SelectItem value="whirlpool">{t("ingredients.stages.whirlpool")}</SelectItem>
              <SelectItem value="dry_hop">{t("ingredients.stages.dry_hop")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(item.useStage === "boil" || item.useStage === "whirlpool" || !item.useStage) && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">{t("designer.cards.boilTime")}:</label>
            <Input
              type="number"
              value={item.useTimeMin ?? ""}
              onChange={(e) => onTimeChange(item.id, e.target.value ? Number(e.target.value) : null)}
              className="h-7 w-20 text-sm"
              placeholder="min"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {t("designer.cards.contribution")}: <span className="font-medium text-foreground">{ibuContribution.toFixed(1)} IBU</span>
          {" "}({ibuPct}%)
        </div>
      </div>
    </IngredientCard>
  );
}
