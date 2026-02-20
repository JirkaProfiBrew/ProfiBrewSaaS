"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getAvailableReceiptLines, saveManualAllocations } from "../actions";
import type { AvailableReceiptLine, ManualAllocationInput, ManualAllocationJsonEntry } from "../types";

// ── Props ───────────────────────────────────────────────────────

interface LotSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueLineId: string;
  itemId: string;
  warehouseId: string;
  requiredQty: number;
  existingAllocations?: ManualAllocationJsonEntry[] | null;
  onAllocated: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────

function toNumber(val: string | null | undefined): number {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

// ── Component ───────────────────────────────────────────────────

export function LotSelectionDialog({
  open,
  onOpenChange,
  issueLineId,
  itemId,
  warehouseId,
  requiredQty,
  existingAllocations,
  onAllocated,
}: LotSelectionDialogProps): React.ReactNode {
  const t = useTranslations("stockIssues");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receiptLines, setReceiptLines] = useState<AvailableReceiptLine[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // ── Fetch available receipt lines on open ───────────────────

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function fetchLines(): Promise<void> {
      setLoading(true);
      try {
        const lines = await getAvailableReceiptLines(itemId, warehouseId);
        if (!cancelled) {
          setReceiptLines(lines);
          // Build a lookup from existing allocations
          const existingMap = new Map<string, number>();
          if (existingAllocations && existingAllocations.length > 0) {
            for (const ea of existingAllocations) {
              existingMap.set(ea.receipt_line_id, ea.quantity);
            }
          }
          // Initialize allocations — pre-fill from existing or default to "0"
          const initial: Record<string, string> = {};
          for (const line of lines) {
            const existing = existingMap.get(line.receiptLineId);
            initial[line.receiptLineId] = existing != null ? String(existing) : "0";
          }
          setAllocations(initial);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : t("lotSelection.allocateError");
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchLines();

    return (): void => {
      cancelled = true;
    };
  }, [open, itemId, warehouseId, existingAllocations, t]);

  // ── Allocation change handler ─────────────────────────────

  const handleAllocationChange = useCallback(
    (receiptLineId: string, value: string): void => {
      setAllocations((prev) => ({
        ...prev,
        [receiptLineId]: value,
      }));
    },
    []
  );

  // ── Computed totals ───────────────────────────────────────

  const totalAllocated = Object.values(allocations).reduce(
    (sum, val) => sum + toNumber(val),
    0
  );

  const isValid = Math.abs(totalAllocated - requiredQty) < 0.0001;

  // ── Validate individual allocations don't exceed remaining qty

  const hasOverAllocation = receiptLines.some((line) => {
    const allocated = toNumber(allocations[line.receiptLineId]);
    const remaining = toNumber(line.remainingQty);
    return allocated > remaining + 0.0001;
  });

  // ── Submit handler ────────────────────────────────────────

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (!isValid) {
      toast.error(t("lotSelection.mismatch"));
      return;
    }

    if (hasOverAllocation) {
      toast.error(t("lotSelection.overAllocated"));
      return;
    }

    // Build allocation inputs (only rows with quantity > 0)
    const allocationInputs: ManualAllocationInput[] = [];
    for (const line of receiptLines) {
      const qty = toNumber(allocations[line.receiptLineId]);
      if (qty > 0) {
        allocationInputs.push({
          receiptLineId: line.receiptLineId,
          quantity: String(qty),
          unitPrice: line.unitPrice ?? "0",
        });
      }
    }

    setSubmitting(true);
    try {
      await saveManualAllocations(issueLineId, allocationInputs);
      toast.success(t("lotSelection.allocated"));
      onAllocated();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : t("lotSelection.allocateError");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    isValid,
    hasOverAllocation,
    receiptLines,
    allocations,
    issueLineId,
    onAllocated,
    t,
  ]);

  // ── Render ────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("lotSelection.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("lotSelection.title")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : receiptLines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("lotSelection.noLots")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("lotSelection.receiptDate")}</TableHead>
                    <TableHead>{t("lotSelection.receiptCode")}</TableHead>
                    <TableHead>{t("lotSelection.supplier")}</TableHead>
                    <TableHead>{t("lotSelection.lotNumber")}</TableHead>
                    <TableHead>{t("lotSelection.expiry")}</TableHead>
                    <TableHead className="text-right">
                      {t("lotSelection.remaining")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("lotSelection.unitPrice")}
                    </TableHead>
                    <TableHead className="w-28">
                      {t("lotSelection.allocate")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receiptLines.map((line) => {
                    const remaining = toNumber(line.remainingQty);
                    const allocated = toNumber(
                      allocations[line.receiptLineId]
                    );
                    const isOver = allocated > remaining + 0.0001;

                    return (
                      <TableRow key={line.receiptLineId}>
                        <TableCell className="text-sm">
                          {line.receiptDate}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {line.receiptCode}
                        </TableCell>
                        <TableCell className="text-sm">
                          {line.supplierName ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {line.lotNumber ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {line.expiryDate ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {remaining}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {line.unitPrice
                            ? `${toNumber(line.unitPrice).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`
                            : "\u2014"}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            step="any"
                            className={`h-8 w-24 ${isOver ? "border-destructive" : ""}`}
                            value={allocations[line.receiptLineId] ?? "0"}
                            onChange={(e) => {
                              handleAllocationChange(
                                line.receiptLineId,
                                e.target.value
                              );
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between text-sm">
              <span>
                {t("lotSelection.totalAllocated")}:{" "}
                <span
                  className={
                    isValid
                      ? "font-bold text-green-600"
                      : "font-bold text-destructive"
                  }
                >
                  {totalAllocated}
                </span>
                {" / "}
                {t("lotSelection.required")}: <span className="font-bold">{requiredQty}</span>
              </span>
              {hasOverAllocation && (
                <span className="text-sm text-destructive">
                  {t("lotSelection.overAllocated")}
                </span>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={submitting}
          >
            {t("lotSelection.cancel")}
          </Button>
          <Button
            onClick={() => {
              void handleConfirm();
            }}
            disabled={
              loading ||
              submitting ||
              !isValid ||
              hasOverAllocation ||
              receiptLines.length === 0
            }
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("lotSelection.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
