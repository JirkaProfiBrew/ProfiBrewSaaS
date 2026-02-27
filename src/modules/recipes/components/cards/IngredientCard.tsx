"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface IngredientCardProps {
  id: string;
  onRemove: () => void;
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function IngredientCard({ id, onRemove, children, title, subtitle }: IngredientCardProps): React.ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium text-sm">{title}</div>
              {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
