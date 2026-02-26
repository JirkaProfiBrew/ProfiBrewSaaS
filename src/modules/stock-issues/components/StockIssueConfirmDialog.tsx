"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertTriangle, XCircle } from "lucide-react";
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
import type { ExcisePrevalidationError } from "@/modules/excise/types";

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
  const te = useTranslations("excise");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [warnings, setWarnings] = useState<PrevalidationWarning[]>([]);
  const [exciseErrors, setExciseErrors] = useState<ExcisePrevalidationError[]>(
    []
  );
  const [validationDone, setValidationDone] = useState(false);

  // Prevalidate on open — stock availability (issues) + excise (all)
  useEffect(() => {
    if (!open) {
      setWarnings([]);
      setExciseErrors([]);
      setValidationDone(false);
      return;
    }

    let cancelled = false;
    setIsValidating(true);

    const promises: Promise<void>[] = [];

    // Stock availability check (only for issues/výdejky)
    if (movementType === "issue") {
      promises.push(
        prevalidateIssue(issueId)
          .then((result) => {
            if (!cancelled) setWarnings(result.warnings);
          })
          .catch((error: unknown) => {
            console.error("Failed to prevalidate stock:", error);
          })
      );
    }

    // Excise pre-check (for all stock issues — receipts and issues)
    promises.push(
      import("@/modules/excise/actions")
        .then((mod) => mod.prevalidateExciseForStockIssue(issueId))
        .then((result) => {
          if (!cancelled && result.applicable) {
            setExciseErrors(result.errors);
          }
        })
        .catch((error: unknown) => {
          console.error("Failed to prevalidate excise:", error);
        })
    );

    Promise.all(promises).finally(() => {
      if (!cancelled) {
        setValidationDone(true);
        setIsValidating(false);
      }
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
  const hasExciseErrors = exciseErrors.length > 0;
  const canConfirm = validationDone && !hasExciseErrors;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={
          hasWarnings || hasExciseErrors ? "sm:max-w-xl" : undefined
        }
      >
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
              ) : (
                <>
                  {/* Excise blocking errors */}
                  {hasExciseErrors && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                      <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                      <div className="space-y-1.5 w-full">
                        <p className="text-sm font-medium text-destructive">
                          {te("prevalidation.title")}
                        </p>
                        <ul className="list-disc pl-5 space-y-0.5">
                          {exciseErrors.map((err) => (
                            <li
                              key={err.code}
                              className="text-sm text-destructive/90"
                            >
                              {te(`prevalidation.${err.code}`)}
                              {err.detail && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  — {err.detail}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Stock availability warnings (issues only) */}
                  {hasWarnings && (
                    <div className="flex items-start gap-2 rounded-md border border-orange-300 bg-orange-50 p-3">
                      <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                      <div className="space-y-2 w-full">
                        <p className="text-sm font-medium text-orange-700">
                          {t("partialIssue.description")}
                        </p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">
                                {t("partialIssue.item")}
                              </TableHead>
                              <TableHead className="text-xs text-right">
                                {t("partialIssue.requested")}
                              </TableHead>
                              <TableHead className="text-xs text-right">
                                {t("partialIssue.available")}
                              </TableHead>
                              <TableHead className="text-xs text-right">
                                {t("partialIssue.willIssue")}
                              </TableHead>
                              <TableHead className="text-xs text-right">
                                {t("partialIssue.missing")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {warnings.map((w, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="text-sm">
                                  {w.itemName}
                                </TableCell>
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
                  )}

                  {/* Normal confirmation info (when no blocking errors) */}
                  {!hasExciseErrors && !hasWarnings && (
                    <>
                      <p>{t("confirmDialog.description")}</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>{t("confirmDialog.bullet1")}</li>
                        <li>{t("confirmDialog.bullet2")}</li>
                      </ul>
                    </>
                  )}

                  {!hasExciseErrors && (
                    <p className="text-sm font-medium text-destructive">
                      {t("confirmDialog.warning")}
                    </p>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            {hasWarnings
              ? t("partialIssue.cancel")
              : t("confirmDialog.cancel")}
          </AlertDialogCancel>
          {canConfirm && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              disabled={isSubmitting || isValidating}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
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
