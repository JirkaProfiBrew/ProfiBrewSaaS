"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { getBottlingLines, saveBottlingData } from "../actions";
import type { BottlingLineData } from "../actions";

// ── Types ─────────────────────────────────────────────────────

interface ProductLine extends BottlingLineData {
  // extends server data — no extra fields needed
}

interface BatchBottlingTabProps {
  batchId: string;
  itemId: string | null;
  actualVolumeL: string | null;
  recipeBatchSizeL: string | null;
  onMutate: () => void;
}

// ── Component ──────────────────────────────────────────────────

export function BatchBottlingTab({
  batchId,
  itemId,
  actualVolumeL,
  recipeBatchSizeL,
  onMutate,
}: BatchBottlingTabProps): React.ReactNode {
  const t = useTranslations("batches");

  const [mode, setMode] = useState<"none" | "bulk" | "packaged" | null>(null);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load bottling lines from server (auto-generated based on stock_mode)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getBottlingLines(batchId)
      .then((result) => {
        if (cancelled) return;
        setMode(result.mode);
        setLines(result.lines);
        setDirty(false);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error("Failed to load bottling lines:", err);
        if (!cancelled) {
          setMode("none");
          setLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [batchId]);

  // Update quantity for a product line
  const handleQtyChange = useCallback(
    (itemIdKey: string, value: string, isBulk: boolean): void => {
      const qty = isBulk ? parseFloat(value) : parseInt(value, 10);
      setLines((prev) =>
        prev.map((l) =>
          l.itemId === itemIdKey
            ? { ...l, quantity: isNaN(qty) ? 0 : Math.max(0, qty) }
            : l
        )
      );
      setDirty(true);
    },
    []
  );

  // Save handler
  const handleSave = useCallback(async (): Promise<void> => {
    setSaving(true);
    try {
      await saveBottlingData(
        batchId,
        lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          baseItemQuantity: l.baseItemQuantity,
        }))
      );
      toast.success(t("bottling.saved"));
      setDirty(false);
      onMutate();
    } catch (err: unknown) {
      console.error("Failed to save bottling:", err);
      toast.error(t("bottling.saveError"));
    } finally {
      setSaving(false);
    }
  }, [batchId, lines, onMutate, t]);

  // Summary calculations
  const summary = useMemo(() => {
    const totalBottled = lines.reduce(
      (sum, l) => sum + l.quantity * l.baseItemQuantity,
      0
    );
    const tankVolume = actualVolumeL ? Number(actualVolumeL) : null;
    const recipeVolume = recipeBatchSizeL ? Number(recipeBatchSizeL) : null;

    const diffTank = tankVolume !== null ? totalBottled - tankVolume : null;
    const diffRecipe = recipeVolume !== null ? totalBottled - recipeVolume : null;

    return { totalBottled, tankVolume, recipeVolume, diffTank, diffRecipe };
  }, [lines, actualVolumeL, recipeBatchSizeL]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        ...
      </div>
    );
  }

  // ── Mode: none ──
  if (mode === "none") {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("bottling.modeNone")}
      </div>
    );
  }

  // ── No production item ──
  if (!itemId) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("bottling.empty")}
      </div>
    );
  }

  // ── No products (packaged) or no item data ──
  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("bottling.noProducts")}
      </div>
    );
  }

  const isBulkMode = mode === "bulk";

  return (
    <div className="flex flex-col gap-6">
      {/* Mode subtitle */}
      <p className="text-sm text-muted-foreground">
        {isBulkMode ? t("bottling.modeBulk") : t("bottling.modePackaged")}
      </p>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("bottling.product")}</TableHead>
            <TableHead className="w-[120px] text-right">
              {isBulkMode ? t("bottling.unit") : t("bottling.volume")}
            </TableHead>
            <TableHead className="w-[140px] text-right">
              {isBulkMode ? t("bottling.amount") : t("bottling.quantity")}
            </TableHead>
            <TableHead className="w-[120px] text-right">
              {t("bottling.lineTotal")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const lineTotal = line.quantity * line.baseItemQuantity;
            return (
              <TableRow key={line.itemId}>
                <TableCell className="font-medium">
                  {line.name}
                  {line.code && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({line.code})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.isBulk ? "L" : line.baseItemQuantity}
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    step={line.isBulk ? "0.1" : "1"}
                    className={cn(
                      "h-8 text-right ml-auto",
                      line.isBulk ? "w-28" : "w-20"
                    )}
                    value={line.quantity || ""}
                    onChange={(e) =>
                      handleQtyChange(line.itemId, e.target.value, line.isBulk)
                    }
                    placeholder="0"
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {lineTotal > 0 ? lineTotal.toFixed(1) : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="text-right font-semibold">
              {t("bottling.summary.totalBottled")}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {summary.totalBottled.toFixed(1)} L
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {/* Summary */}
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <SummaryRow
          label={t("bottling.summary.totalBottled")}
          value={`${summary.totalBottled.toFixed(1)} L`}
          bold
        />
        {summary.recipeVolume !== null && (
          <SummaryRow
            label={t("bottling.summary.recipeVolume")}
            value={`${summary.recipeVolume.toFixed(1)} L`}
          />
        )}
        {summary.tankVolume !== null && (
          <SummaryRow
            label={t("bottling.summary.tankVolume")}
            value={`${summary.tankVolume.toFixed(1)} L`}
          />
        )}

        {summary.diffRecipe !== null && (
          <SummaryRow
            label={t("bottling.summary.diffRecipe")}
            value={formatDiff(summary.diffRecipe, t)}
            className={diffColor(summary.diffRecipe)}
          />
        )}
        {summary.diffTank !== null && (
          <SummaryRow
            label={t("bottling.summary.diffTank")}
            value={formatDiff(summary.diffTank, t)}
            className={diffColor(summary.diffTank)}
            bold
          />
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
          <Save className="mr-1 size-4" />
          {t("bottling.save")}
        </Button>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  bold,
  className,
}: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}): React.ReactNode {
  return (
    <div className={cn("flex justify-between", bold && "font-semibold", className)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function formatDiff(
  diff: number,
  t: ReturnType<typeof useTranslations<"batches">>
): string {
  if (diff === 0) return `0 L — ${t("bottling.summary.exact")}`;
  const sign = diff > 0 ? "+" : "";
  const label = diff > 0 ? t("bottling.summary.surplus") : t("bottling.summary.loss");
  return `${sign}${diff.toFixed(1)} L — ${label}`;
}

function diffColor(diff: number): string {
  if (diff > 0) return "text-green-600";
  if (diff < 0) return "text-red-600";
  return "text-muted-foreground";
}
