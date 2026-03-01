"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BeerGlass } from "@/components/ui/beer-glass";
import { cn } from "@/lib/utils";
import { MaltCard } from "../cards/MaltCard";
import type { RecipeItem } from "../../types";
import {
  getDefaultPercentages,
  redistributePercentages,
  removeAndRedistribute,
  kgToPercent,
  percentToKg,
} from "../../utils";

// ── Props ────────────────────────────────────────────────────────

interface MaltTabProps {
  items: RecipeItem[];
  maltPlanKg: number;
  ebcTarget: { min: number; max: number } | null;
  targetEbc: number;
  calculatedEbc: number;
  maltInputMode: "kg" | "percent";
  onMaltInputModeChange: (mode: "kg" | "percent") => void;
  onAmountChange: (id: string, amount: string) => void;
  onPercentChange: (id: string, percent: number, computedKg: number) => void;
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
  maltInputMode,
  onMaltInputModeChange,
  onAmountChange,
  onPercentChange,
  onRemove,
  onReorder,
  onAdd,
}: MaltTabProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Local percentage state — tracks percentages for each item
  const [percentages, setPercentages] = useState<Map<string, number>>(new Map());

  // Initialize percentages from items when items change
  useEffect(() => {
    setPercentages((prev) => {
      const next = new Map(prev);
      let changed = false;

      // Add percentages for new items
      for (const item of items) {
        if (!next.has(item.id)) {
          const pct = item.percent ? parseFloat(item.percent) : null;
          if (pct != null) {
            next.set(item.id, pct);
          }
          changed = true;
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

      // If we have items but no percentages computed yet, derive from kg
      if (items.length > 0 && [...next.values()].every((v) => v === undefined || v === null)) {
        const amounts = items.map((item) => {
          const amount = parseFloat(item.amountG) || 0;
          const factor = item.unitToBaseFactor ?? 1;
          return amount * factor;
        });
        const pcts = kgToPercent(amounts);
        items.forEach((item, i) => next.set(item.id, pcts[i] ?? 0));
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

      // Compute kg and propagate to parent
      const kgs = percentToKg(newPcts, maltPlanKg);
      orderedIds.forEach((id, i) => {
        const item = items.find((it) => it.id === id);
        if (item) {
          const factor = item.unitToBaseFactor ?? 1;
          const amountInUnit = factor !== 0 ? (kgs[i] ?? 0) / factor : 0;
          onPercentChange(id, newPcts[i] ?? 0, amountInUnit);
        }
      });
    },
    [items, percentages, maltPlanKg, onPercentChange]
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

        // Update kg for remaining items
        const kgs = percentToKg(newPcts, maltPlanKg);
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
    [items, percentages, maltInputMode, maltPlanKg, onPercentChange, onRemove]
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
        // % → kg: compute kg from percentages and maltPlanKg
        const orderedIds = items.map((i) => i.id);
        const pcts = orderedIds.map((id) => percentages.get(id) ?? 0);
        const kgs = percentToKg(pcts, maltPlanKg);
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
    [items, percentages, maltInputMode, maltPlanKg, onAmountChange, onMaltInputModeChange]
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

      // Update kg for existing items
      const kgs = percentToKg(newPcts.slice(0, items.length), maltPlanKg);
      items.forEach((item, i) => {
        const factor = item.unitToBaseFactor ?? 1;
        const amountInUnit = factor !== 0 ? (kgs[i] ?? 0) / factor : 0;
        onPercentChange(item.id, newPcts[i] ?? 0, amountInUnit);
      });
    }
    onAdd();
  }, [items, percentages, maltInputMode, maltPlanKg, onPercentChange, onAdd]);

  // When a new item appears after onAdd in percent mode, set its default percentage
  useEffect(() => {
    if (maltInputMode !== "percent") return;
    const newItems = items.filter((i) => !percentages.has(i.id));
    if (newItems.length === 0) return;

    const currentPcts = items
      .filter((i) => percentages.has(i.id))
      .map((i) => percentages.get(i.id) ?? 0);

    for (const newItem of newItems) {
      const allPcts = getDefaultPercentages(currentPcts);
      const newPct = allPcts[allPcts.length - 1] ?? 0;

      setPercentages((prev) => {
        const next = new Map(prev);
        // Redistribute existing
        const existingIds = items.filter((i) => prev.has(i.id)).map((i) => i.id);
        existingIds.forEach((id, i) => next.set(id, allPcts[i] ?? 0));
        next.set(newItem.id, newPct);
        return next;
      });

      // Update kg for the new item
      const factor = newItem.unitToBaseFactor ?? 1;
      const kg = maltPlanKg * (allPcts[allPcts.length - 1] ?? 0) / 100;
      const amountInUnit = factor !== 0 ? kg / factor : 0;
      onPercentChange(newItem.id, allPcts[allPcts.length - 1] ?? 0, amountInUnit);
      currentPcts.push(allPcts[allPcts.length - 1] ?? 0);
    }
  }, [items, percentages, maltInputMode, maltPlanKg, onPercentChange]);

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
              maltRequiredKg={maltPlanKg}
              onAmountChange={onAmountChange}
              onPercentChange={handlePercentChange}
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
              <div className="flex justify-between">
                <span>{t("designer.maltMode.totalPlan")}:</span>
                <span className="font-medium">{maltPlanKg.toFixed(1)} kg</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span>{t("designer.cards.total")}:</span>
                <span className="font-medium">{totalMaltKg.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span>{t("designer.cards.plan")}:</span>
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
