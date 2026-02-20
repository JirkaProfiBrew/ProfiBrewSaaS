"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { confirmStockIssue, prevalidateIssue } from "../actions";
import type { PrevalidationWarning } from "../types";

interface StockIssueConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  code: string;
  movementType: string;
  onConfirmed: () => void;
}

export function StockIssueConfirmDialog({
  open,
  onOpenChange,
  issueId,
  code,
  movementType,
  onConfirmed,
}: StockIssueConfirmDialogProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [warnings, setWarnings] = useState<PrevalidationWarning[]>([]);
  const [validationDone, setValidationDone] = useState(false);

  // For issues: prevalidate on open
  useEffect(() => {
    if (!open) {
      setWarnings([]);
      setValidationDone(false);
      return;
    }

    // Receipts don't need prevalidation
    if (movementType !== "issue") {
      setValidationDone(true);
      return;
    }

    let cancelled = false;
    setIsValidating(true);

    prevalidateIssue(issueId)
      .then((result) => {
        if (!cancelled) {
          setWarnings(result.warnings);
          setValidationDone(true);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to prevalidate:", error);
        if (!cancelled) {
          setValidationDone(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsValidating(false);
      });

    return (): void => {
      cancelled = true;
    };
  }, [open, issueId, movementType]);

  const handleConfirm = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await confirmStockIssue(issueId);
      toast.success(t("detail.confirmed"));
      onConfirmed();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to confirm stock issue:", error);
      toast.error(t("detail.confirmError"));
    } finally {
      setIsSubmitting(false);
    }
  }, [issueId, t, onConfirmed, onOpenChange]);

  const hasWarnings = warnings.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={hasWarnings ? "sm:max-w-xl" : undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("confirmDialog.title", { code })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {isValidating ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("cancelDialog.checking")}
                  </span>
                </div>
              ) : hasWarnings ? (
                <>
                  <div className="flex items-start gap-2 rounded-md border border-orange-300 bg-orange-50 p-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                    <div className="space-y-2 w-full">
                      <p className="text-sm font-medium text-orange-700">
                        {t("partialIssue.description")}
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">{t("partialIssue.item")}</TableHead>
                            <TableHead className="text-xs text-right">{t("partialIssue.requested")}</TableHead>
                            <TableHead className="text-xs text-right">{t("partialIssue.available")}</TableHead>
                            <TableHead className="text-xs text-right">{t("partialIssue.willIssue")}</TableHead>
                            <TableHead className="text-xs text-right">{t("partialIssue.missing")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {warnings.map((w, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-sm">{w.itemName}</TableCell>
                              <TableCell className="text-sm text-right">
                                {w.requested} {w.unit}
                              </TableCell>
                              <TableCell className="text-sm text-right">
                                {w.available} {w.unit}
                              </TableCell>
                              <TableCell className="text-sm text-right">
                                {w.willIssue} {w.unit}
                              </TableCell>
                              <TableCell className="text-sm text-right text-destructive font-medium">
                                {w.missing} {w.unit}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-destructive">
                    {t("confirmDialog.warning")}
                  </p>
                </>
              ) : (
                <>
                  <p>{t("confirmDialog.description")}</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>{t("confirmDialog.bullet1")}</li>
                    <li>{t("confirmDialog.bullet2")}</li>
                  </ul>
                  <p className="text-sm font-medium text-destructive">
                    {t("confirmDialog.warning")}
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            {hasWarnings ? t("partialIssue.cancel") : t("confirmDialog.cancel")}
          </AlertDialogCancel>
          {validationDone && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              disabled={isSubmitting || isValidating}
            >
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {hasWarnings
                ? t("partialIssue.confirmPartial")
                : t("confirmDialog.confirm")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
