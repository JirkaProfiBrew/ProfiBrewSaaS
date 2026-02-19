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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { transitionBatchStatus } from "../actions";
import type { BatchStatus } from "../types";
import { BATCH_STATUS_TRANSITIONS } from "../types";

// ── Component ──────────────────────────────────────────────────

interface BatchStatusTransitionProps {
  batchId: string;
  currentStatus: string;
  onTransition: () => void;
}

export function BatchStatusTransition({
  batchId,
  currentStatus,
  onTransition,
}: BatchStatusTransitionProps): React.ReactNode {
  const t = useTranslations("batches");
  const tCommon = useTranslations("common");

  const [dumpDialogOpen, setDumpDialogOpen] = useState(false);
  const [dumpReason, setDumpReason] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const allowedTransitions =
    BATCH_STATUS_TRANSITIONS[currentStatus as BatchStatus] ?? [];

  const canDump =
    currentStatus !== "completed" && currentStatus !== "dumped";

  const handleTransition = useCallback(
    async (newStatus: BatchStatus): Promise<void> => {
      setIsTransitioning(true);
      try {
        await transitionBatchStatus(batchId, newStatus);
        toast.success(t("statusTransition.success"));
        onTransition();
      } catch (error: unknown) {
        console.error("Failed to transition batch status:", error);
        toast.error(t("statusTransition.error"));
      } finally {
        setIsTransitioning(false);
      }
    },
    [batchId, onTransition, t]
  );

  const handleDump = useCallback(async (): Promise<void> => {
    if (!dumpReason.trim()) return;

    setIsTransitioning(true);
    try {
      await transitionBatchStatus(batchId, "dumped", dumpReason.trim());
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
      {allowedTransitions.map((status) => (
        <Button
          key={status}
          size="sm"
          variant="outline"
          disabled={isTransitioning}
          onClick={() => {
            void handleTransition(status);
          }}
        >
          {t(`status.${status}` as Parameters<typeof t>[0])}
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
    </div>
  );
}
