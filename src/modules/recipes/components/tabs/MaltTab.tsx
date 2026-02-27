"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MaltCard } from "../cards/MaltCard";
import type { RecipeItem } from "../../types";

// ── Props ────────────────────────────────────────────────────────

interface MaltTabProps {
  items: RecipeItem[];
  maltPlanKg: number;
  ebcTarget: { min: number; max: number } | null;
  onAmountChange: (id: string, amount: string) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAdd: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function MaltTab({
  items,
  maltPlanKg,
  ebcTarget,
  onAmountChange,
  onRemove,
  onReorder,
  onAdd,
}: MaltTabProps): React.ReactNode {
  const t = useTranslations("recipes");

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

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  return (
    <div className="space-y-3">
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
              onAmountChange={onAmountChange}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add button */}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        <Plus className="mr-1 size-4" />
        {t("designer.cards.addMalt")}
      </Button>

      {/* Summary */}
      {items.length > 0 && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
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
          {ebcTarget && (
            <div className="flex justify-between">
              <span>{t("designer.cards.color")}:</span>
              <span className="font-medium">
                {ebcTarget.min}–{ebcTarget.max} EBC
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
