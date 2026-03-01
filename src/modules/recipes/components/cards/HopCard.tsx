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
  onTemperatureChange: (id: string, temp: number | null) => void;
  onRemove: (id: string) => void;
}

const STAGES = ["boil", "fwh", "whirlpool", "mash", "dry_hop_cold", "dry_hop_warm"] as const;

// Stages that use a time input
const TIME_STAGES = new Set(["boil", "whirlpool", "mash"]);
// Stages that use a temperature input
const TEMP_STAGES = new Set(["whirlpool", "dry_hop_warm"]);

export function HopCard({ item, ibuContribution, totalIbu, onAmountChange, onStageChange, onTimeChange, onTemperatureChange, onRemove }: HopCardProps): React.ReactNode {
  const t = useTranslations("recipes");

  const alphaVal = item.itemAlpha ? parseFloat(item.itemAlpha) : null;
  const unitSymbol = item.unitSymbol ?? "g";
  const ibuPct = totalIbu > 0 ? (ibuContribution / totalIbu * 100).toFixed(1) : "0";
  const stage = item.useStage ?? "boil";
  const showTime = TIME_STAGES.has(stage);
  const showTemp = TEMP_STAGES.has(stage);

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
          <Select value={stage} onValueChange={(v) => onStageChange(item.id, v)}>
            <SelectTrigger className="h-7 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{t(`ingredients.stages.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showTime && (
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
        {showTemp && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">{t("designer.cards.temperature")}:</label>
            <Input
              type="number"
              value={item.temperatureC ?? ""}
              onChange={(e) => onTemperatureChange(item.id, e.target.value ? Number(e.target.value) : null)}
              className="h-7 w-20 text-sm"
              placeholder="°C"
            />
            <span className="text-xs text-muted-foreground">°C</span>
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
