"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Check, AlertTriangle, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HopCard } from "../cards/HopCard";
import type { RecipeItem } from "../../types";
import { calculateIBUBreakdown, calculateIBUDetail } from "../../utils";
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
  targetIbu: number;
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
  targetIbu,
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
        temperatureC: item.temperatureC ? parseFloat(item.temperatureC) || undefined : undefined,
        hopForm: item.itemHopForm ?? null,
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
        temperatureC: item.temperatureC ? parseFloat(item.temperatureC) || undefined : undefined,
        hopForm: item.itemHopForm ?? null,
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

  // Check if total IBU matches design target (within ±10% tolerance)
  const isOnTarget =
    targetIbu > 0 &&
    Math.abs(totalIbu - targetIbu) <= targetIbu * 0.1;

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
            <span className="flex items-center gap-1">
              {t("designer.cards.total")} IBU: <span className="font-medium">{totalIbu.toFixed(1)}</span>
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full size-5 hover:bg-muted-foreground/20 transition-colors"
                    title={t("designer.cards.ibuDetailTitle")}
                  >
                    <Info className="size-3.5 text-muted-foreground" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t("designer.cards.ibuDetailTitle")}</DialogTitle>
                  </DialogHeader>
                  <IBUDetailContent
                    ingredientInputs={ingredientInputs}
                    volumeL={volumeL}
                    ogPlato={ogPlato}
                    boilTimeMin={boilTimeMin}
                    whirlpoolTempC={whirlpoolTempC}
                  />
                </DialogContent>
              </Dialog>
            </span>
            {targetIbu > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">
                  {t("designer.feedback.target")}: {targetIbu} IBU
                </span>
                {isOnTarget ? (
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

// ── IBU Detail Modal Content ─────────────────────────────────

function IBUDetailContent({
  ingredientInputs,
  volumeL,
  ogPlato,
  boilTimeMin,
  whirlpoolTempC,
}: {
  ingredientInputs: IngredientInput[];
  volumeL: number;
  ogPlato: number;
  boilTimeMin: number;
  whirlpoolTempC: number;
}): React.ReactNode {
  const t = useTranslations("recipes");
  const detail = useMemo(
    () => calculateIBUDetail(ingredientInputs, volumeL, ogPlato, boilTimeMin, whirlpoolTempC),
    [ingredientInputs, volumeL, ogPlato, boilTimeMin, whirlpoolTempC]
  );

  return (
    <div className="space-y-4 text-sm">
      {/* Global parameters */}
      <div className="rounded-lg border p-3 bg-muted/30 space-y-1 font-mono text-xs">
        <div>OG = {detail.ogPlato.toFixed(1)} °P → SG = {detail.sgWort.toFixed(4)}</div>
        <div>{t("designer.cards.ibuPostBoilVolume")} = {detail.postBoilL.toFixed(1)} L</div>
        <div>{t("designer.cards.ibuBoilTime")} = {detail.boilTimeMin} min</div>
        <div>{t("designer.cards.ibuWhirlpoolTemp")} = {whirlpoolTempC} °C</div>
      </div>

      {/* Tinseth formula */}
      <div className="text-xs text-muted-foreground">
        <div className="font-medium mb-1">Tinseth (1997):</div>
        <div className="font-mono">
          IBU = (W<sub>kg</sub> × U × α × 1 000 000) / V<sub>postBoil</sub>
        </div>
        <div className="font-mono mt-1">
          U = bigness × boilTime
        </div>
        <div className="font-mono">
          bigness = 1.65 × 0.000125<sup>(SG−1)</sup> = {detail.hops[0]?.bignessFactor.toFixed(4) ?? "—"}
        </div>
        <div className="font-mono">
          boilTime = (1 − e<sup>−0.04×t</sup>) / 4.15
        </div>
      </div>

      {/* Per-hop breakdown */}
      {detail.hops.map((hop, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <div className="font-medium">{hop.name}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t("designer.cards.ibuWeight")}: {hop.weightG} g ({hop.weightKg.toFixed(4)} kg)</span>
            <span>α: {hop.alphaPct}% ({hop.alphaDecimal})</span>
            <span>{t("designer.cards.ibuStage")}: {hop.stage}</span>
            <span>{t("designer.cards.ibuTime")}: {hop.timeMin} min</span>
          </div>
          <div className="font-mono text-xs space-y-1 bg-muted/50 rounded p-2">
            <div>boilTimeFactor = (1 − e<sup>−0.04×{hop.timeMin}</sup>) / 4.15 = {hop.boilTimeFactor.toFixed(4)}</div>
            <div>U = {hop.bignessFactor.toFixed(4)} × {hop.boilTimeFactor.toFixed(4)} = {hop.utilization.toFixed(4)}</div>
            {hop.stageFactor !== 1.0 && (
              <div>{t("designer.cards.ibuStageFactor")}: × {hop.stageFactor.toFixed(2)}</div>
            )}
            {hop.hopFormFactor !== 1.0 && (
              <div>{t("designer.cards.ibuHopFormFactor")}: × {hop.hopFormFactor.toFixed(2)} ({t(`hopForm.${hop.hopForm}`)})</div>
            )}
            <div className="font-medium text-foreground pt-1 border-t">
              IBU = ({hop.weightKg.toFixed(4)} × {hop.utilization.toFixed(4)} × {hop.alphaDecimal} × 1000000) / {hop.postBoilL.toFixed(1)}{hop.stageFactor !== 1.0 ? ` × ${hop.stageFactor.toFixed(2)}` : ""}{hop.hopFormFactor !== 1.0 ? ` × ${hop.hopFormFactor.toFixed(2)}` : ""} = <span className="text-primary">{hop.ibu.toFixed(1)}</span>
            </div>
          </div>
        </div>
      ))}

      {/* Total */}
      <div className="rounded-lg border-2 border-primary/30 p-3 font-mono text-sm">
        <span className="font-medium">
          {t("designer.cards.total")} IBU = {detail.hops.map(h => h.ibu.toFixed(1)).join(" + ")} = <span className="text-primary text-base">{detail.totalIbu.toFixed(1)}</span>
        </span>
      </div>
    </div>
  );
}
