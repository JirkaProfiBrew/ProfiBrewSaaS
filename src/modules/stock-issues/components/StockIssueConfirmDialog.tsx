"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

import { confirmStockIssue } from "../actions";

interface StockIssueConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  code: string;
  onConfirmed: () => void;
}

export function StockIssueConfirmDialog({
  open,
  onOpenChange,
  issueId,
  code,
  onConfirmed,
}: StockIssueConfirmDialogProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async (): Promise<void> => {
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
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("confirmDialog.title", { code })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>{t("confirmDialog.description")}</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>{t("confirmDialog.bullet1")}</li>
                <li>{t("confirmDialog.bullet2")}</li>
              </ul>
              <p className="text-sm font-medium text-destructive">
                {t("confirmDialog.warning")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            {t("confirmDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={isSubmitting}
          >
            {t("confirmDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
