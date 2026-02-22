"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Download, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

      {/* Delete button with confirmation */}
      {onDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 />
              {t("delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmBulkDelete")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("confirmBulkDeleteDescription", { count: selectedCount })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Clear selection button */}
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        <X />
        {t("clearSelection")}
      </Button>
    </div>
  );
}
