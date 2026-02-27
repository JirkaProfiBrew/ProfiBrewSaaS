"use client";

import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdjunctCard } from "../cards/AdjunctCard";
import type { RecipeItem } from "../../types";

// ── Props ────────────────────────────────────────────────────────

interface AdjunctTabProps {
  items: RecipeItem[];
  onAmountChange: (id: string, amount: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: number | null) => void;
  onNotesChange: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAdd: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function AdjunctTab({
  items,
  onAmountChange,
  onStageChange,
  onTimeChange,
  onNotesChange,
  onRemove,
  onReorder,
  onAdd,
}: AdjunctTabProps): React.ReactNode {
  const t = useTranslations("recipes");

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
            <AdjunctCard
              key={item.id}
              item={item}
              onAmountChange={onAmountChange}
              onStageChange={onStageChange}
              onTimeChange={onTimeChange}
              onNotesChange={onNotesChange}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add button */}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        <Plus className="mr-1 size-4" />
        {t("designer.cards.addAdjunct")}
      </Button>
    </div>
  );
}
