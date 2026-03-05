"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BeerGlass } from "@/components/ui/beer-glass";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MaltCard } from "../cards/MaltCard";
import type { RecipeItem } from "../../types";
import {
  getDefaultPercentages,
  redistributePercentages,
  removeAndRedistribute,
  kgToPercent,
  percentToKg,
  calculateMaltRequiredDetail,
} from "../../utils";

// ── Props ────────────────────────────────────────────────────────

interface MaltTabProps {
  items: RecipeItem[];
  maltPlanKg: number;
  ebcTarget: { min: number; max: number } | null;
  targetEbc: number;
  calculatedEbc: number;
  targetOg: number;
  calculatedOg: number;
  batchSizeL: number;
  efficiencyPct: number;
  extractEstimatePct: number;
  maltInputMode: "kg" | "percent";
  onMaltInputModeChange: (mode: "kg" | "percent") => void;
  onAmountChange: (id: string, amount: string) => void;
  onPercentChange: (id: string, percent: number, computedKg: number) => void;
  onStageChange: (id: string, stage: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAdd: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function MaltTab({
  items,
  maltPlanKg,
  ebcTarget,
  targetEbc,
  calculatedEbc,
  targetOg,
  calculatedOg,
  batchSizeL,
  efficiencyPct,
  extractEstimatePct,
  maltInputMode,
  onMaltInputModeChange,
  onAmountChange,
  onPercentChange,
  onStageChange,
  onNotesChange,
  onRemove,
  onReorder,
  onAdd,
}: MaltTabProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Local percentage state — tracks percentages for each item
  const [percentages, setPercentages] = useState<Map<string, number>>(new Map());

  // Tracks known item IDs — used to detect truly new items (added via onAdd)
  // vs items present on initial load. Starts null to signal "first render".
  const knownItemIdsRef = useRef<Set<string> | null>(null);

  // Initialize percentages from items when items change
  useEffect(() => {
    setPercentages((prev) => {
      const next = new Map(prev);
      let changed = false;

      // Add percentages for items with stored percent values
      for (const item of items) {
        if (!next.has(item.id)) {
          const pct = item.percent ? parseFloat(item.percent) : null;
          if (pct != null) {
            next.set(item.id, pct);
            changed = true;
          }
        }
      }

      // Remove percentages for deleted items
      const itemIds = new Set(items.map((i) => i.id));
      for (const key of next.keys()) {
        if (!itemIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }

      // For items still not in the map (no stored percent), derive from kg amounts
      const unmapped = items.filter((i) => !next.has(i.id));
      if (unmapped.length > 0) {
        const amounts = items.map((item) => {
          const amount = parseFloat(item.amountG) || 0;
          const factor = item.unitToBaseFactor ?? 1;
          return amount * factor;
        });
        const pcts = kgToPercent(amounts);
        items.forEach((item, i) => {
          if (!next.has(item.id)) {
            next.set(item.id, pcts[i] ?? 0);
          }
        });
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [items]);

  // Total malt in kg — sum of all items' amounts converted via unitToBaseFactor
  const totalMaltKg = useMemo(
    () =>
      items.reduce((sum, item) => {
        const amount = parseFloat(item.amountG) || 0;
        const factor = item.unitToBaseFactor ?? 1;
        return sum + amount * factor;
      }, 0),
    [items]
  );

  const diff = totalMaltKg - maltPlanKg;
  const diffPct = maltPlanKg > 0 ? (diff / maltPlanKg) * 100 : 0;

  // Get percentage for an item
  const getPercent = useCallback(
    (itemId: string): number => percentages.get(itemId) ?? 0,
    [percentages]
  );

  // Reference total for % → kg: use plan (from OG target), fallback to actual total
  const referenceKg = maltPlanKg > 0 ? maltPlanKg : totalMaltKg;

  // Handle percent slider change — redistribute others proportionally
  const handlePercentChange = useCallback(
    (itemId: string, newPercent: number): void => {
      const orderedIds = items.map((i) => i.id);
      const changedIndex = orderedIds.indexOf(itemId);
      if (changedIndex === -1) return;

      const currentPcts = orderedIds.map((id) => percentages.get(id) ?? 0);
      const newPcts = redistributePercentages(currentPcts, changedIndex, newPercent);

      const nextMap = new Map<string, number>();
      orderedIds.forEach((id, i) => nextMap.set(id, newPcts[i] ?? 0));
      setPercentages(nextMap);

      // Compute kg and propagate to parent — use actual total, not plan
      const kgs = percentToKg(newPcts, referenceKg);
      orderedIds.forEach((id, i) => {
        const item = items.find((it) => it.id === id);
        if (item) {
          const factor = item.unitToBaseFactor ?? 1;
          const amountInUnit = factor !== 0 ? (kgs[i] ?? 0) / factor : 0;
          onPercentChange(id, newPcts[i] ?? 0, amountInUnit);
        }
      });
    },
    [items, percentages, referenceKg, onPercentChange]
  );

  // Handle remove — redistribute remaining percentages
  const handleRemove = useCallback(
    (itemId: string): void => {
      const orderedIds = items.map((i) => i.id);
      const removeIndex = orderedIds.indexOf(itemId);

      if (maltInputMode === "percent" && removeIndex !== -1) {
        const currentPcts = orderedIds.map((id) => percentages.get(id) ?? 0);
        const newPcts = removeAndRedistribute(currentPcts, removeIndex);
        const remainingIds = orderedIds.filter((_, i) => i !== removeIndex);

        const nextMap = new Map<string, number>();
        remainingIds.forEach((id, i) => nextMap.set(id, newPcts[i] ?? 0));
        setPercentages(nextMap);

        // Update kg for remaining items — use actual total, not plan
        const kgs = percentToKg(newPcts, referenceKg);
        remainingIds.forEach((id, i) => {
          const item = items.find((it) => it.id === id);
          if (item) {
            const factor = item.unitToBaseFactor ?? 1;
            const amountInUnit = factor !== 0 ? (kgs[i] ?? 0) / factor : 0;
            onPercentChange(id, newPcts[i] ?? 0, amountInUnit);
          }
        });
      }

      onRemove(itemId);
    },
    [items, percentages, maltInputMode, referenceKg, onPercentChange, onRemove]
  );

  // Handle mode switch
  const handleModeSwitch = useCallback(
    (mode: "kg" | "percent"): void => {
      if (mode === "percent" && maltInputMode === "kg") {
        // kg → %: compute percentages from current kg amounts
        const amounts = items.map((item) => {
          const amount = parseFloat(item.amountG) || 0;
          const factor = item.unitToBaseFactor ?? 1;
          return amount * factor;
        });
        const pcts = kgToPercent(amounts);
        const nextMap = new Map<string, number>();
        items.forEach((item, i) => nextMap.set(item.id, pcts[i] ?? 0));
        setPercentages(nextMap);
      } else if (mode === "kg" && maltInputMode === "percent") {
        // % → kg: compute kg from percentages and actual total (not plan)
        const orderedIds = items.map((i) => i.id);
        const pcts = orderedIds.map((id) => percentages.get(id) ?? 0);
        const kgs = percentToKg(pcts, referenceKg);
        orderedIds.forEach((id, i) => {
          const item = items.find((it) => it.id === id);
          if (item) {
            const factor = item.unitToBaseFactor ?? 1;
            const amountInUnit = factor !== 0 ? (kgs[i] ?? 0) / factor : 0;
            onAmountChange(id, amountInUnit.toFixed(2));
          }
        });
      }
      onMaltInputModeChange(mode);
    },
    [items, percentages, maltInputMode, referenceKg, onAmountChange, onMaltInputModeChange]
  );

  // Handle add — update percentages for the new item
  const handleAdd = useCallback((): void => {
    if (maltInputMode === "percent") {
      // Calculate new percentages including the new item
      const currentPcts = items.map((i) => percentages.get(i.id) ?? 0);
      const newPcts = getDefaultPercentages(currentPcts);

      // Update existing items' percentages
      const nextMap = new Map<string, number>();
      items.forEach((item, i) => nextMap.set(item.id, newPcts[i] ?? 0));
      setPercentages(nextMap);

      // Update kg for existing items — use actual total, not plan
      const kgs = percentToKg(newPcts.slice(0, items.length), referenceKg);
      items.forEach((item, i) => {
        const factor = item.unitToBaseFactor ?? 1;
        const amountInUnit = factor !== 0 ? (kgs[i] ?? 0) / factor : 0;
        onPercentChange(item.id, newPcts[i] ?? 0, amountInUnit);
      });
    }
    onAdd();
  }, [items, percentages, maltInputMode, referenceKg, onPercentChange, onAdd]);

  // Detect truly new items added via onAdd (not initial-load items).
  // On first render knownItemIdsRef is null → we just record IDs, no processing.
  // On subsequent renders we compare against known IDs to find additions.
  useEffect(() => {
    const currentIds = new Set(items.map((i) => i.id));

    if (knownItemIdsRef.current === null) {
      // First render — just record, never call onPercentChange
      knownItemIdsRef.current = currentIds;
      return;
    }

    if (maltInputMode !== "percent") {
      knownItemIdsRef.current = currentIds;
      return;
    }

    const addedItems = items.filter((i) => !knownItemIdsRef.current!.has(i.id));
    knownItemIdsRef.current = currentIds;
    if (addedItems.length === 0) return;

    // Process genuinely new items (just added by user)
    const currentPcts = items
      .filter((i) => !addedItems.some((a) => a.id === i.id))
      .map((i) => percentages.get(i.id) ?? 0);

    const refKg = maltPlanKg > 0 ? maltPlanKg : totalMaltKg;

    for (const newItem of addedItems) {
      const allPcts = getDefaultPercentages(currentPcts);
      const newPct = allPcts[allPcts.length - 1] ?? 0;

      setPercentages((prev) => {
        const next = new Map(prev);
        const existingIds = items.filter((i) => prev.has(i.id)).map((i) => i.id);
        existingIds.forEach((id, i) => next.set(id, allPcts[i] ?? 0));
        next.set(newItem.id, newPct);
        return next;
      });

      const factor = newItem.unitToBaseFactor ?? 1;
      const kg = refKg * newPct / 100;
      const amountInUnit = factor !== 0 ? kg / factor : 0;
      onPercentChange(newItem.id, newPct, amountInUnit);
      currentPcts.push(newPct);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, maltInputMode]);

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  const totalPct = useMemo(() => {
    return items.reduce((sum, item) => sum + (percentages.get(item.id) ?? 0), 0);
  }, [items, percentages]);

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => handleModeSwitch("kg")}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            maltInputMode === "kg"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("designer.maltMode.kg")}
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch("percent")}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            maltInputMode === "percent"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("designer.maltMode.percent")}
        </button>
      </div>

      {/* Cards */}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <MaltCard
              key={item.id}
              item={item}
              totalMaltKg={totalMaltKg}
              mode={maltInputMode}
              percent={getPercent(item.id)}
              maltRequiredKg={referenceKg}
              onAmountChange={onAmountChange}
              onPercentChange={handlePercentChange}
              onStageChange={onStageChange}
              onNotesChange={onNotesChange}
              onRemove={handleRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add button */}
      <Button variant="outline" size="sm" onClick={handleAdd} className="w-full">
        <Plus className="mr-1 size-4" />
        {t("designer.cards.addMalt")}
      </Button>

      {/* Summary */}
      {items.length > 0 && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
          {/* OG target vs calculated */}
          <div className="flex justify-between">
            <span>OG:</span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{t("designer.cards.target")} {targetOg > 0 ? `${targetOg.toFixed(1)} °P` : "—"}</span>
              <span className="text-muted-foreground">&rarr;</span>
              <span className={cn(
                "font-medium",
                targetOg > 0 && calculatedOg > 0
                  ? Math.abs(calculatedOg - targetOg) / targetOg <= 0.05
                    ? "text-green-600"
                    : Math.abs(calculatedOg - targetOg) / targetOg <= 0.15
                      ? "text-amber-600"
                      : "text-red-600"
                  : ""
              )}>
                {calculatedOg > 0 ? `${calculatedOg.toFixed(1)} °P` : "—"}
              </span>
            </span>
          </div>
          {/* Dual BeerGlass — target vs calculated */}
          <div className="flex items-center justify-center gap-4 py-2">
            <div className="flex flex-col items-center">
              <BeerGlass ebc={targetEbc} size="sm" />
              <span className="text-xs font-medium mt-1">{targetEbc} EBC</span>
              <span className="text-[10px] text-muted-foreground">{t("designer.cards.target")}</span>
            </div>
            <span className="text-muted-foreground text-lg">&rarr;</span>
            <div className="flex flex-col items-center">
              <BeerGlass ebc={calculatedEbc} size="sm" />
              <span className="text-xs font-medium mt-1">{calculatedEbc.toFixed(1)} EBC</span>
              <span className="text-[10px] text-muted-foreground">{t("designer.cards.recipe")}</span>
            </div>
          </div>
          {maltInputMode === "percent" ? (
            <>
              <div className="flex justify-between">
                <span>{t("designer.cards.total")}:</span>
                <span className="font-medium">{totalPct.toFixed(1)}% = {totalMaltKg.toFixed(1)} kg</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  {t("designer.maltMode.totalPlan")}:
                  <MaltPlanInfoButton
                    targetOg={targetOg}
                    batchSizeL={batchSizeL}
                    efficiencyPct={efficiencyPct}
                    extractEstimatePct={extractEstimatePct}
                  />
                </span>
                <span className="font-medium">{maltPlanKg.toFixed(1)} kg</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span>{t("designer.cards.total")}:</span>
                <span className="font-medium">{totalMaltKg.toFixed(1)} kg</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  {t("designer.cards.plan")}:
                  <MaltPlanInfoButton
                    targetOg={targetOg}
                    batchSizeL={batchSizeL}
                    efficiencyPct={efficiencyPct}
                    extractEstimatePct={extractEstimatePct}
                  />
                </span>
                <span className="font-medium">{maltPlanKg.toFixed(1)} kg</span>
              </div>
              {maltPlanKg > 0 && (
                <div className="flex justify-between">
                  <span>
                    {diff > 0
                      ? t("designer.cards.surplus")
                      : t("designer.cards.deficit")}
                    :
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      Math.abs(diffPct) < 2
                        ? "text-green-600"
                        : Math.abs(diffPct) < 5
                          ? "text-amber-600"
                          : "text-red-600"
                    )}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(1)} kg
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Malt Plan Info Button + Detail Modal ────────────────────────

function MaltPlanInfoButton({
  targetOg,
  batchSizeL,
  efficiencyPct,
  extractEstimatePct,
}: {
  targetOg: number;
  batchSizeL: number;
  efficiencyPct: number;
  extractEstimatePct: number;
}): React.ReactNode {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full size-5 hover:bg-muted-foreground/20 transition-colors"
        >
          <Info className="size-3.5 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <MaltDetailTitle />
          </DialogTitle>
        </DialogHeader>
        <MaltDetailContent
          targetOg={targetOg}
          batchSizeL={batchSizeL}
          efficiencyPct={efficiencyPct}
          extractEstimatePct={extractEstimatePct}
        />
      </DialogContent>
    </Dialog>
  );
}

function MaltDetailTitle(): React.ReactNode {
  const t = useTranslations("recipes");
  return <>{t("designer.cards.maltDetailTitle")}</>;
}

function MaltDetailContent({
  targetOg,
  batchSizeL,
  efficiencyPct,
  extractEstimatePct,
}: {
  targetOg: number;
  batchSizeL: number;
  efficiencyPct: number;
  extractEstimatePct: number;
}): React.ReactNode {
  const t = useTranslations("recipes");
  const detail = useMemo(
    () => calculateMaltRequiredDetail(targetOg, batchSizeL, efficiencyPct, extractEstimatePct),
    [targetOg, batchSizeL, efficiencyPct, extractEstimatePct]
  );

  return (
    <div className="space-y-4 text-sm">
      {/* Input parameters */}
      <div className="rounded-lg border p-3 bg-muted/30 space-y-1 font-mono text-xs">
        <div>{t("designer.cards.maltDetailOg")} = {detail.targetOgPlato.toFixed(1)} °P</div>
        <div>SG = {detail.targetSg.toFixed(4)}</div>
        <div>{t("designer.cards.maltDetailBatchSize")} = {detail.batchSizeL.toFixed(1)} L</div>
        <div>{t("designer.cards.maltDetailEfficiency")} = {detail.efficiencyPct}%</div>
        <div>{t("designer.cards.maltDetailExtract")} = {detail.extractEstimatePct}%</div>
      </div>

      {/* Formula */}
      <div className="text-xs text-muted-foreground">
        <div className="font-medium mb-1">{t("designer.cards.maltDetailFormula")}:</div>
        <div className="font-mono space-y-1">
          <div>SG = platoToSG(OG) = {detail.targetSg.toFixed(4)}</div>
          <div>E<sub>kg</sub> = V × SG × OG / 100</div>
          <div>M<sub>kg</sub> = E<sub>kg</sub> / (extract/100) / (efficiency/100)</div>
        </div>
      </div>

      {/* Step-by-step calculation */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="font-medium">{t("designer.cards.maltDetailSteps")}</div>
        <div className="font-mono text-xs space-y-1 bg-muted/50 rounded p-2">
          <div>
            E<sub>kg</sub> = {detail.batchSizeL.toFixed(1)} × {detail.targetSg.toFixed(4)} × {detail.targetOgPlato.toFixed(1)} / 100
          </div>
          <div>
            E<sub>kg</sub> = <span className="font-medium text-foreground">{detail.extractNeededKg.toFixed(2)} kg</span>
          </div>
          <div className="border-t pt-1 mt-1">
            M<sub>kg</sub> = {detail.extractNeededKg.toFixed(2)} / ({detail.extractEstimatePct}/100) / ({detail.efficiencyPct}/100)
          </div>
          <div>
            M<sub>kg</sub> = {detail.extractNeededKg.toFixed(2)} / {(detail.extractEstimatePct / 100).toFixed(2)} / {(detail.efficiencyPct / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-lg border-2 border-primary/30 p-3 font-mono text-sm">
        <span className="font-medium">
          {t("designer.cards.maltDetailResult")} = <span className="text-primary text-base">{detail.maltRequiredKg.toFixed(2)} kg</span>
        </span>
      </div>
    </div>
  );
}
