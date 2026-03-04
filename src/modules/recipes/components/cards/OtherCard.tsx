"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IngredientCard } from "./IngredientCard";
import type { RecipeItem } from "../../types";

const OTHER_STAGES = ["mash", "boil", "whirlpool", "fermentation", "conditioning", "bottling"] as const;

interface OtherCardProps {
  item: RecipeItem;
  onAmountChange: (id: string, amount: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
}

export function OtherCard({ item, onAmountChange, onStageChange, onNotesChange, onRemove }: OtherCardProps): React.ReactNode {
  const t = useTranslations("recipes");
  const unitSymbol = item.unitSymbol ?? "g";

  return (
    <IngredientCard
      id={item.id}
      title={item.itemName ?? item.itemId}
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
              {OTHER_STAGES.map((s) => (
                <SelectItem key={s} value={s}>{t(`ingredients.stages.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 col-span-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">{t("designer.cards.note")}:</label>
          <Input
            value={item.notes ?? ""}
            onChange={(e) => onNotesChange(item.id, e.target.value)}
            className="h-7 text-sm"
            placeholder={t("designer.cards.note")}
          />
        </div>
      </div>
    </IngredientCard>
  );
}
