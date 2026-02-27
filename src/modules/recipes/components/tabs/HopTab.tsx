"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, Check, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HopCard } from "../cards/HopCard";
import type { RecipeItem } from "../../types";

// ── Props ────────────────────────────────────────────────────────

interface HopTabProps {
  items: RecipeItem[];
  volumeL: number;
  ogPlato: number;
  ibuTarget: { min: number; max: number } | null;
  onAmountChange: (id: string, amount: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: number | null) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAdd: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

interface HopIbuEntry {
  id: string;
  ibu: number;
  stage: string;
}

// ── Component ────────────────────────────────────────────────────

export function HopTab({
  items,
  volumeL,
  ogPlato,
  ibuTarget,
  onAmountChange,
  onStageChange,
  onTimeChange,
  onRemove,
  onReorder,
  onAdd,
}: HopTabProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Per-hop IBU contribution using Tinseth formula inline
  const hopInputs: HopIbuEntry[] = useMemo(
    () =>
      items.map((item) => {
        const alphaDecimal = parseFloat(item.itemAlpha ?? "0") / 100;
        const amount = parseFloat(item.amountG) || 0;
        const factor = item.unitToBaseFactor ?? 0.001; // g -> kg default
        const weightKg = amount * factor;
        const boilTime = item.useTimeMin ?? 0;
        const stage = item.useStage ?? "boil";

        if (boilTime <= 0 || alphaDecimal <= 0 || volumeL <= 0) {
          return { id: item.id, ibu: 0, stage };
        }

        const sg = 1 + ogPlato / (258.6 - 227.1 * (ogPlato / 258.2));
        const bigness = 1.65 * Math.pow(0.000125, sg - 1);
        const boilFactor = (1 - Math.exp(-0.04 * boilTime)) / 4.15;
        const util = bigness * boilFactor;
        const ibu = (weightKg * util * alphaDecimal * 1000000) / volumeL;

        return { id: item.id, ibu: Math.round(ibu * 10) / 10, stage };
      }),
    [items, volumeL, ogPlato]
  );

  const totalIbu = useMemo(
    () => hopInputs.reduce((s, h) => s + h.ibu, 0),
    [hopInputs]
  );

  // IBU breakdown by stage
  const boilIbu = useMemo(
    () =>
      Math.round(
        hopInputs
          .filter((h) => h.stage === "boil")
          .reduce((s, h) => s + h.ibu, 0) * 10
      ) / 10,
    [hopInputs]
  );
  const whirlpoolIbu = useMemo(
    () =>
      Math.round(
        hopInputs
          .filter((h) => h.stage === "whirlpool")
          .reduce((s, h) => s + h.ibu, 0) * 10
      ) / 10,
    [hopInputs]
  );
  const dryHopIbu = useMemo(
    () =>
      Math.round(
        hopInputs
          .filter((h) => h.stage === "dry_hop")
          .reduce((s, h) => s + h.ibu, 0) * 10
      ) / 10,
    [hopInputs]
  );

  // Check if total IBU is within target range
  const isInRange =
    ibuTarget != null &&
    totalIbu >= ibuTarget.min &&
    totalIbu <= ibuTarget.max;

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  function getIbuForItem(itemId: string): number {
    return hopInputs.find((h) => h.id === itemId)?.ibu ?? 0;
  }

  return (
    <div className="space-y-3">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <HopCard
              key={item.id}
              item={item}
              ibuContribution={getIbuForItem(item.id)}
              totalIbu={totalIbu}
              onAmountChange={onAmountChange}
              onStageChange={onStageChange}
              onTimeChange={onTimeChange}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

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
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {t("designer.cards.boilIbu")}: <span className="font-medium text-foreground">{boilIbu.toFixed(1)} IBU</span>
            </span>
            <span>
              {t("designer.cards.whirlpoolIbu")}: <span className="font-medium text-foreground">{whirlpoolIbu.toFixed(1)} IBU</span>
            </span>
            <span>
              {t("designer.cards.dryHopIbu")}: <span className="font-medium text-foreground">{dryHopIbu.toFixed(1)} IBU</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
