"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { YeastCard } from "../cards/YeastCard";
import type { RecipeItem } from "../../types";

// ── Props ────────────────────────────────────────────────────────

interface YeastTabProps {
  items: RecipeItem[];
  ogPlato: number;
  onAmountChange: (id: string, amount: string) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAdd: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function YeastTab({
  items,
  ogPlato,
  onAmountChange,
  onRemove,
  onReorder,
  onAdd,
}: YeastTabProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Default 75% apparent attenuation -> FG ~ 25% of OG
  const estimatedFg = useMemo(
    () => (ogPlato > 0 ? Math.round(ogPlato * 0.25 * 10) / 10 : null),
    [ogPlato]
  );

  // ABV estimate using Balling formula
  const estimatedAbv = useMemo(() => {
    if (estimatedFg == null || ogPlato <= 0) return null;
    const denominator = 2.0665 - 0.010665 * ogPlato;
    if (denominator <= 0) return null;
    const abv = (ogPlato - estimatedFg) / denominator;
    return Math.round(Math.max(0, abv) * 100) / 100;
  }, [ogPlato, estimatedFg]);

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
            <YeastCard
              key={item.id}
              item={item}
              estimatedFg={estimatedFg}
              estimatedAbv={estimatedAbv}
              onAmountChange={onAmountChange}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add button */}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        <Plus className="mr-1 size-4" />
        {t("designer.cards.addYeast")}
      </Button>

      {/* Summary — informational FG/ABV estimate */}
      {items.length > 0 && estimatedFg != null && estimatedAbv != null && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span>{t("designer.cards.estimatedFg")}:</span>
            <span className="font-medium">{estimatedFg.toFixed(1)} °P</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.abv")}:</span>
            <span className="font-medium">{estimatedAbv.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
