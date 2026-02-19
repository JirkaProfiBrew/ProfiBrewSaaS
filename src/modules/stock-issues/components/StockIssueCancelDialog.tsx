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

import { cancelStockIssue } from "../actions";

interface StockIssueCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  code: string;
  isIssueType: boolean;
  onCancelled: () => void;
}

export function StockIssueCancelDialog({
  open,
  onOpenChange,
  issueId,
  code,
  isIssueType,
  onCancelled,
}: StockIssueCancelDialogProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancel = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await cancelStockIssue(issueId);
      toast.success(t("detail.cancelled"));
      onCancelled();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to cancel stock issue:", error);
      toast.error(t("detail.cancelError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("cancelDialog.title", { code })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>{t("cancelDialog.description")}</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>{t("cancelDialog.bullet1")}</li>
                <li>{t("cancelDialog.bullet2")}</li>
                {isIssueType && <li>{t("cancelDialog.bullet3")}</li>}
              </ul>
              <p className="text-sm font-medium text-destructive">
                {t("cancelDialog.warning")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            {t("cancelDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleCancel();
            }}
            disabled={isSubmitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("cancelDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
