"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Plus, Check, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HopCard } from "../cards/HopCard";
import type { RecipeItem } from "../../types";
import { calculateIBUBreakdown } from "../../utils";
import type { IngredientInput } from "../../utils";

// ── Stage ordering for auto-sort ─────────────────────────────────

const STAGE_ORDER: Record<string, number> = {
  mash: 1,
  fwh: 2,
  boil: 3,
  whirlpool: 4,
  dry_hop_warm: 5,
  dry_hop_cold: 6,
};

function sortHops(hops: RecipeItem[]): RecipeItem[] {
  return [...hops].sort((a, b) => {
    const stageA = STAGE_ORDER[a.useStage ?? "boil"] ?? 99;
    const stageB = STAGE_ORDER[b.useStage ?? "boil"] ?? 99;
    if (stageA !== stageB) return stageA - stageB;
    return (b.useTimeMin ?? 0) - (a.useTimeMin ?? 0);
  });
}

// ── Props ────────────────────────────────────────────────────────

interface HopTabProps {
  items: RecipeItem[];
  volumeL: number;
  ogPlato: number;
  boilTimeMin: number;
  whirlpoolTempC: number;
  ibuTarget: { min: number; max: number } | null;
  onAmountChange: (id: string, amount: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: number | null) => void;
  onTemperatureChange: (id: string, temp: number | null) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function HopTab({
  items,
  volumeL,
  ogPlato,
  boilTimeMin,
  whirlpoolTempC,
  ibuTarget,
  onAmountChange,
  onStageChange,
  onTimeChange,
  onTemperatureChange,
  onRemove,
  onAdd,
}: HopTabProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Auto-sort hops by stage then by time descending
  const sortedItems = useMemo(() => sortHops(items), [items]);

  // Build ingredient inputs for the breakdown calculation
  const ingredientInputs: IngredientInput[] = useMemo(
    () =>
      items.map((item) => ({
        category: "hop",
        amountG: parseFloat(item.amountG) || 0,
        unitToBaseFactor: item.unitToBaseFactor ?? null,
        alpha: item.itemAlpha ? parseFloat(item.itemAlpha) : null,
        useTimeMin: item.useTimeMin,
        useStage: item.useStage ?? "boil",
        temperatureC: item.temperatureC ? parseFloat(item.temperatureC) : undefined,
        itemId: item.itemId,
        recipeItemId: item.id,
        name: item.itemName ?? item.itemId,
      })),
    [items]
  );

  // Calculate IBU breakdown using the shared engine
  const ibuBreakdown = useMemo(
    () => calculateIBUBreakdown(ingredientInputs, volumeL, ogPlato, boilTimeMin, whirlpoolTempC),
    [ingredientInputs, volumeL, ogPlato, boilTimeMin, whirlpoolTempC]
  );

  // Per-hop IBU: run single-hop breakdown for each
  const perHopIbu = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const singleInput: IngredientInput[] = [{
        category: "hop",
        amountG: parseFloat(item.amountG) || 0,
        unitToBaseFactor: item.unitToBaseFactor ?? null,
        alpha: item.itemAlpha ? parseFloat(item.itemAlpha) : null,
        useTimeMin: item.useTimeMin,
        useStage: item.useStage ?? "boil",
        temperatureC: item.temperatureC ? parseFloat(item.temperatureC) : undefined,
        itemId: item.itemId,
        recipeItemId: item.id,
        name: item.itemName ?? item.itemId,
      }];
      const result = calculateIBUBreakdown(singleInput, volumeL, ogPlato, boilTimeMin, whirlpoolTempC);
      map.set(item.id, result.total);
    }
    return map;
  }, [items, volumeL, ogPlato, boilTimeMin, whirlpoolTempC]);

  const totalIbu = ibuBreakdown.total;

  // Check if total IBU is within target range
  const isInRange =
    ibuTarget != null &&
    totalIbu >= ibuTarget.min &&
    totalIbu <= ibuTarget.max;

  // Breakdown entries to display (only show stages that have IBU > 0)
  const breakdownEntries = useMemo(() => {
    const entries: { labelKey: string; value: number }[] = [];
    if (ibuBreakdown.boil > 0) entries.push({ labelKey: "boilIbu", value: ibuBreakdown.boil });
    if (ibuBreakdown.fwh > 0) entries.push({ labelKey: "fwhIbu", value: ibuBreakdown.fwh });
    if (ibuBreakdown.whirlpool > 0) entries.push({ labelKey: "whirlpoolIbu", value: ibuBreakdown.whirlpool });
    if (ibuBreakdown.mash > 0) entries.push({ labelKey: "mashIbu", value: ibuBreakdown.mash });
    if (ibuBreakdown.dryHopWarm > 0) entries.push({ labelKey: "dryHopIbu", value: ibuBreakdown.dryHopWarm });
    return entries;
  }, [ibuBreakdown]);

  // Group sorted items by stage for rendering with separators
  const groupedItems = useMemo(() => {
    const groups: { stage: string; items: RecipeItem[] }[] = [];
    let currentStage: string | null = null;
    for (const item of sortedItems) {
      const stage = item.useStage ?? "boil";
      if (stage !== currentStage) {
        groups.push({ stage, items: [item] });
        currentStage = stage;
      } else {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup) lastGroup.items.push(item);
      }
    }
    return groups;
  }, [sortedItems]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {groupedItems.map((group) => (
          <div key={group.stage}>
            {/* Stage separator — show for all groups when there is more than one */}
            {groupedItems.length > 1 && (
              <div className="flex items-center gap-2 pt-2 pb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground font-medium">
                  {t("designer.cards.stage_" + group.stage)}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className="space-y-2">
              {group.items.map((item) => (
                <HopCard
                  key={item.id}
                  item={item}
                  ibuContribution={perHopIbu.get(item.id) ?? 0}
                  totalIbu={totalIbu}
                  onAmountChange={onAmountChange}
                  onStageChange={onStageChange}
                  onTimeChange={onTimeChange}
                  onTemperatureChange={onTemperatureChange}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add button */}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        <Plus className="mr-1 size-4" />
        {t("designer.cards.addHop")}
      </Button>

      {/* Summary */}
      {items.length > 0 && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span>
              {t("designer.cards.total")} IBU: <span className="font-medium">{totalIbu.toFixed(1)}</span>
            </span>
            {ibuTarget && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">
                  {t("designer.feedback.target")}: {ibuTarget.min}–{ibuTarget.max} IBU
                </span>
                {isInRange ? (
                  <Check className={cn("size-4 text-green-600")} />
                ) : (
                  <AlertTriangle className={cn("size-4 text-amber-600")} />
                )}
              </span>
            )}
          </div>
          {breakdownEntries.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {breakdownEntries.map((entry) => (
                <span key={entry.labelKey}>
                  {t(`designer.cards.${entry.labelKey}`)}: <span className="font-medium text-foreground">{entry.value.toFixed(1)} IBU</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
