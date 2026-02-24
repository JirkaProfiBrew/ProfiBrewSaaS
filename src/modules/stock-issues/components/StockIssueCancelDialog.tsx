"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { cancelStockIssue, checkReceiptCancellable } from "../actions";
import { cancelCashFlow } from "@/modules/cashflows/actions";
import type { BlockingIssueInfo } from "../types";

interface StockIssueCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  code: string;
  isIssueType: boolean;
  cashflowId: string | null;
  cashflowCode: string | null;
  onCancelled: () => void;
}

export function StockIssueCancelDialog({
  open,
  onOpenChange,
  issueId,
  code,
  isIssueType,
  cashflowId,
  cashflowCode,
  onCancelled,
}: StockIssueCancelDialogProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [blockingIssues, setBlockingIssues] = useState<BlockingIssueInfo[]>([]);
  const [checkDone, setCheckDone] = useState(false);
  const [alsoCancelCf, setAlsoCancelCf] = useState(true);

  // When dialog opens for a receipt, check if it can be cancelled
  useEffect(() => {
    if (!open) {
      setBlockingIssues([]);
      setCheckDone(false);
      setAlsoCancelCf(true);
      return;
    }

    // Only check for receipts (not issues)
    if (isIssueType) {
      setCheckDone(true);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    checkReceiptCancellable(issueId)
      .then((result) => {
        if (!cancelled) {
          setBlockingIssues(result.blockingIssues);
          setCheckDone(true);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to check receipt cancellability:", error);
        if (!cancelled) {
          setCheckDone(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });

    return (): void => {
      cancelled = true;
    };
  }, [open, issueId, isIssueType]);

  const handleCancel = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await cancelStockIssue(issueId);

      // Optionally cancel linked CF
      if (alsoCancelCf && cashflowId) {
        try {
          await cancelCashFlow(cashflowId);
        } catch (cfErr: unknown) {
          console.error("Failed to cancel linked CF:", cfErr);
          // Non-critical — receipt is cancelled, CF cancel failed
        }
      }

      toast.success(t("detail.cancelled"));
      onCancelled();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to cancel stock issue:", error);
      // Check if this is the structured allocation error
      const msg = error instanceof Error ? error.message : "";
      if (msg.startsWith("RECEIPT_HAS_ALLOCATIONS:")) {
        // Re-parse blocking issues from the error for safety
        try {
          const jsonPart = msg.split(":").slice(1, -1).join(":");
          const issues = JSON.parse(jsonPart) as BlockingIssueInfo[];
          setBlockingIssues(issues);
        } catch {
          toast.error(t("detail.cancelError"));
        }
      } else {
        toast.error(t("detail.cancelError"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [issueId, alsoCancelCf, cashflowId, t, onCancelled, onOpenChange]);

  const isBlocked = blockingIssues.length > 0;
  const hasCf = !isIssueType && !!cashflowId;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("cancelDialog.title", { code })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {isChecking ? (
                <p className="text-sm text-muted-foreground">
                  {t("cancelDialog.checking")}
                </p>
              ) : isBlocked ? (
                <>
                  <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-destructive">
                        {t("cancelDialog.blocked")}
                      </p>
                      <ul className="space-y-1">
                        {blockingIssues.map((bi) => (
                          <li key={bi.issueId} className="text-sm">
                            <button
                              type="button"
                              className="text-primary hover:underline cursor-pointer font-medium"
                              onClick={() => {
                                onOpenChange(false);
                                router.push(`/stock/movements/${bi.issueId}`);
                              }}
                            >
                              {bi.issueCode}
                            </button>
                            {" — "}
                            {bi.itemName}: {bi.allocatedQty.toLocaleString("cs-CZ")}
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm text-muted-foreground">
                        {t("cancelDialog.blockedHint")}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p>{t("cancelDialog.description")}</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>{t("cancelDialog.bullet1")}</li>
                    <li>{t("cancelDialog.bullet2")}</li>
                    {isIssueType && <li>{t("cancelDialog.bullet3")}</li>}
                  </ul>
                  {hasCf && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {t("cancelDialog.hasCashflow", { cfCode: cashflowCode ?? "" })}
                        </p>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="alsoCancelCf"
                            checked={alsoCancelCf}
                            onCheckedChange={(checked) =>
                              setAlsoCancelCf(checked === true)
                            }
                          />
                          <Label
                            htmlFor="alsoCancelCf"
                            className="text-sm font-normal cursor-pointer"
                          >
                            {t("cancelDialog.alsoCancelCf")}
                          </Label>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-sm font-medium text-destructive">
                    {t("cancelDialog.warning")}
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            {isBlocked
              ? t("cancelDialog.close")
              : t("cancelDialog.cancel")}
          </AlertDialogCancel>
          {checkDone && !isBlocked && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCancel();
              }}
              disabled={isSubmitting || isChecking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("cancelDialog.confirm")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
