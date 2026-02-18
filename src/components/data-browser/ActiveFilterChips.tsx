"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { ActiveFilterChipsProps, FilterDef } from "./types";

// ── Helpers ────────────────────────────────────────────────

function findFilterDef(
  filterDefs: FilterDef[],
  key: string,
): FilterDef | undefined {
  return filterDefs.find((def) => def.key === key);
}

function formatFilterValue(
  filterDef: FilterDef | undefined,
  value: unknown,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  // For select/multiselect, try to resolve the label from options
  if (filterDef?.options) {
    if (Array.isArray(value)) {
      return value
        .map((v: unknown) => {
          const option = filterDef.options?.find(
            (opt) => opt.value === String(v),
          );
          return option ? option.label : String(v);
        })
        .join(", ");
    }

    const option = filterDef.options.find(
      (opt) => opt.value === String(value),
    );
    if (option) {
      return option.label;
    }
  }

  // For arrays without options
  if (Array.isArray(value)) {
    return value.map((v: unknown) => String(v)).join(", ");
  }

  // For objects (e.g., date_range or number_range: { from: x, to: y })
  if (typeof value === "object" && value !== null) {
    // Safe cast: typeof check above narrows to non-null object
    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    if (record["from"] !== undefined && record["from"] !== null) {
      parts.push(String(record["from"]));
    }
    if (record["to"] !== undefined && record["to"] !== null) {
      parts.push(String(record["to"]));
    }
    return parts.join(" - ");
  }

  return String(value);
}

// ── Main Component ─────────────────────────────────────────

export function ActiveFilterChips({
  filters,
  filterDefs,
  onRemoveFilter,
  onClearAll,
}: ActiveFilterChipsProps): React.ReactElement | null {
  const t = useTranslations("dataBrowser");

  const activeEntries = Object.entries(filters).filter(
    ([, value]) =>
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !(Array.isArray(value) && value.length === 0),
  );

  if (activeEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {activeEntries.map(([key, value]) => {
        const filterDef = findFilterDef(filterDefs, key);
        const label = filterDef?.label ?? key;
        const displayValue = formatFilterValue(filterDef, value);

        return (
          <Badge key={key} variant="secondary" className="gap-1 pr-1">
            <span className="font-medium">{label}:</span>
            <span>{displayValue}</span>
            <button
              type="button"
              onClick={(): void => onRemoveFilter(key)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              aria-label={`${t("clearFilters")} ${label}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="h-auto px-2 py-1 text-xs"
      >
        {t("clearAll")}
      </Button>
    </div>
  );
}
