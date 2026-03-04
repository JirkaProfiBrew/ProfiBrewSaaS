"use client";

import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OtherCard } from "../cards/OtherCard";
import type { RecipeItem } from "../../types";

// ── Props ────────────────────────────────────────────────────────

interface OtherTabProps {
  items: RecipeItem[];
  onAmountChange: (id: string, amount: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAdd: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function OtherTab({
  items,
  onAmountChange,
  onStageChange,
  onNotesChange,
  onRemove,
  onReorder,
  onAdd,
}: OtherTabProps): React.ReactNode {
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
            <OtherCard
              key={item.id}
              item={item}
              onAmountChange={onAmountChange}
              onStageChange={onStageChange}
              onNotesChange={onNotesChange}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add button */}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        <Plus className="mr-1 size-4" />
        {t("designer.cards.addOther")}
      </Button>
    </div>
  );
}
