"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { ToolbarProps, ViewMode } from "./types";

// ── Debounce Hook ──────────────────────────────────────────

function useDebouncedCallback(
  callback: (value: string) => void,
  delay: number,
): (value: string) => void {
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return React.useCallback(
    (value: string): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(value);
      }, delay);
    },
    [callback, delay],
  );
}

// ── Constants ──────────────────────────────────────────────

const SEARCH_DEBOUNCE_MS = 300;

// ── Main Component ─────────────────────────────────────────

export function Toolbar({
  config,
  params,
  onViewChange,
  onSearchChange,
  onToggleFilters,
  onCreate,
}: ToolbarProps): React.ReactElement {
  const t = useTranslations("dataBrowser");
  const [localSearch, setLocalSearch] = React.useState<string>(params.search);

  const debouncedSearch = useDebouncedCallback(onSearchChange, SEARCH_DEBOUNCE_MS);

  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const value = e.target.value;
      setLocalSearch(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  // Sync local search when params change externally (e.g., clear filters)
  React.useEffect(() => {
    setLocalSearch(params.search);
  }, [params.search]);

  const hasCardView = config.views.card !== false && config.views.card.enabled;
  const hasCreateAction =
    config.actions.create?.enabled === true && onCreate !== undefined;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Left: Create button */}
      {hasCreateAction && (
        <Button onClick={onCreate} size="sm">
          <Plus />
          {config.actions.create?.label ?? t("create", { entity: config.entity })}
        </Button>
      )}

      {/* Center: View toggle */}
      {hasCardView && (
        <ToggleGroup
          type="single"
          variant="outline"
          value={params.view}
          onValueChange={(value: string): void => {
            if (value) {
              // Safe cast: ToggleGroup values are constrained to "list" | "card" by the items
              onViewChange(value as ViewMode);
            }
          }}
        >
          <ToggleGroupItem value="list" aria-label={t("listView")}>
            <List className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="card" aria-label={t("cardView")}>
            <LayoutGrid className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {/* Filter toggle button */}
      {config.filters && config.filters.length > 0 && (
        <Button variant="outline" size="sm" onClick={onToggleFilters}>
          <SlidersHorizontal />
          {t("toggleFilters")}
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Search input */}
      <div className="relative w-full max-w-xs">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder={t("search")}
          value={localSearch}
          onChange={handleSearchChange}
          className={cn("pl-8")}
        />
      </div>
    </div>
  );
}
