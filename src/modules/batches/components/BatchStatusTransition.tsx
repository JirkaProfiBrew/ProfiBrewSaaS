"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { advanceBatchPhase, getBottlingLines } from "../actions";
import type { BatchPhase } from "../types";
import { PHASE_TRANSITIONS } from "../types";

// ── Component ──────────────────────────────────────────────────

interface BatchStatusTransitionProps {
  batchId: string;
  currentPhase: string;
  onTransition: () => void;
}

export function BatchStatusTransition({
  batchId,
  currentPhase,
  onTransition,
}: BatchStatusTransitionProps): React.ReactNode {
  const t = useTranslations("batches");
  const tCommon = useTranslations("common");

  const [dumpDialogOpen, setDumpDialogOpen] = useState(false);
  const [dumpReason, setDumpReason] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [noReceiptWarningOpen, setNoReceiptWarningOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<BatchPhase | null>(null);

  const allowedTransitions =
    PHASE_TRANSITIONS[currentPhase as BatchPhase] ?? [];

  const canDump =
    currentPhase !== "completed" && currentPhase !== "dumped";

  const doTransition = useCallback(
    async (targetPhase: BatchPhase): Promise<void> => {
      setIsTransitioning(true);
      try {
        await advanceBatchPhase(batchId, targetPhase);
        toast.success(t("statusTransition.success"));
        onTransition();
      } catch (error: unknown) {
        console.error("Failed to transition batch phase:", error);
        toast.error(t("statusTransition.error"));
      } finally {
        setIsTransitioning(false);
      }
    },
    [batchId, onTransition, t]
  );

  const handleTransition = useCallback(
    async (targetPhase: BatchPhase): Promise<void> => {
      // Check for no-receipt warning on completion
      if (targetPhase === "completed") {
        try {
          const { mode, receiptInfo } = await getBottlingLines(batchId);
          if (mode !== "none" && !receiptInfo) {
            setPendingTransition(targetPhase);
            setNoReceiptWarningOpen(true);
            return;
          }
        } catch {
          // If check fails, proceed anyway
        }
      }

      await doTransition(targetPhase);
    },
    [batchId, doTransition]
  );

  const handleConfirmNoReceipt = useCallback(async (): Promise<void> => {
    setNoReceiptWarningOpen(false);
    if (pendingTransition) {
      await doTransition(pendingTransition);
      setPendingTransition(null);
    }
  }, [doTransition, pendingTransition]);

  const handleDump = useCallback(async (): Promise<void> => {
    if (!dumpReason.trim()) return;

    setIsTransitioning(true);
    try {
      // advanceBatchPhase handles "dumped" as a special non-linear transition
      await advanceBatchPhase(batchId, "dumped");
      toast.success(t("statusTransition.dumped"));
      setDumpDialogOpen(false);
      setDumpReason("");
      onTransition();
    } catch (error: unknown) {
      console.error("Failed to dump batch:", error);
      toast.error(t("statusTransition.error"));
    } finally {
      setIsTransitioning(false);
    }
  }, [batchId, dumpReason, onTransition, t]);

  return (
    <div className="flex items-center gap-2">
      {/* Regular transition buttons */}
      {allowedTransitions.map((phase) => (
        <Button
          key={phase}
          size="sm"
          variant="outline"
          disabled={isTransitioning}
          onClick={() => {
            void handleTransition(phase);
          }}
        >
          {t(`phase.${phase}` as Parameters<typeof t>[0])}
        </Button>
      ))}

      {/* Dump button — always available unless completed or dumped */}
      {canDump && (
        <>
          <Button
            size="sm"
            variant="destructive"
            disabled={isTransitioning}
            onClick={() => setDumpDialogOpen(true)}
          >
            {t("statusTransition.dump")}
          </Button>

          <Dialog open={dumpDialogOpen} onOpenChange={setDumpDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("statusTransition.dumpTitle")}</DialogTitle>
                <DialogDescription>
                  {t("statusTransition.dumpDescription")}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <Label htmlFor="dump-reason">
                  {t("statusTransition.dumpReasonLabel")}
                </Label>
                <Textarea
                  id="dump-reason"
                  value={dumpReason}
                  onChange={(e) => setDumpReason(e.target.value)}
                  placeholder={t("statusTransition.dumpReasonPlaceholder")}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDumpDialogOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={!dumpReason.trim() || isTransitioning}
                  onClick={() => {
                    void handleDump();
                  }}
                >
                  {t("statusTransition.confirmDump")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* No-receipt warning dialog on completion */}
      <AlertDialog open={noReceiptWarningOpen} onOpenChange={setNoReceiptWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("statusTransition.noReceiptTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("statusTransition.noReceiptDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingTransition(null);
              }}
            >
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmNoReceipt();
              }}
            >
              {t("statusTransition.completeAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
