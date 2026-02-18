"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Download, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import type { BulkActionsBarProps } from "./types";

// ── Main Component ─────────────────────────────────────────

export function BulkActionsBar({
  selectedCount,
  onDelete,
  onExport,
  onClearSelection,
}: BulkActionsBarProps): React.ReactElement | null {
  const t = useTranslations("dataBrowser");

  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10",
        "flex items-center gap-3 rounded-md border bg-background p-3 shadow-lg",
      )}
    >
      {/* Selected count */}
      <span className="text-sm font-medium">
        {t("selected", { count: selectedCount })}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export button */}
      {onExport && (
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download />
          {t("export")}
        </Button>
      )}

      {/* Delete button */}
      {onDelete && (
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 />
          {t("delete")}
        </Button>
      )}

      {/* Clear selection button */}
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        <X />
        {t("clearSelection")}
      </Button>
    </div>
  );
}
