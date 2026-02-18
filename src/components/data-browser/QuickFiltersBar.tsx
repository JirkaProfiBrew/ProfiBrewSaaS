"use client";

import * as React from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

import type { QuickFiltersBarProps } from "./types";

// ── Main Component ─────────────────────────────────────────

export function QuickFiltersBar({
  quickFilters,
  activeFilter,
  onFilterChange,
}: QuickFiltersBarProps): React.ReactElement | null {
  if (quickFilters.length === 0) {
    return null;
  }

  return (
    <ScrollArea className="w-full">
      <div className="pb-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={activeFilter}
          onValueChange={(value: string): void => {
            // Allow deselecting — when empty, pass empty string to reset
            onFilterChange(value);
          }}
          className="justify-start"
        >
          {quickFilters.map((filter) => (
            <ToggleGroupItem
              key={filter.key}
              value={filter.key}
              aria-label={filter.label}
              className="shrink-0"
            >
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
