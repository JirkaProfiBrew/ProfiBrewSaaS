"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Save, Factory, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  getBottlingLines,
  saveBottlingData,
  createProductionReceipt,
} from "../actions";
import type { BottlingLineData, ReceiptInfo } from "../actions";

// ── Types ─────────────────────────────────────────────────────

interface ProductLine extends BottlingLineData {
  // extends server data — no extra fields needed
}

interface BatchBottlingTabProps {
  batchId: string;
  batchNumber: string;
  itemId: string | null;
  actualVolumeL: string | null;
  recipeBatchSizeL: string | null;
  onMutate: () => void;
}

// ── Component ──────────────────────────────────────────────────

export function BatchBottlingTab({
  batchId,
  batchNumber,
  itemId,
  actualVolumeL,
  recipeBatchSizeL,
  onMutate,
}: BatchBottlingTabProps): React.ReactNode {
  const t = useTranslations("batches");

  const [mode, setMode] = useState<"none" | "bulk" | "packaged" | null>(null);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [receiptInfo, setReceiptInfo] = useState<ReceiptInfo | null>(null);
  const [bottledDate, setBottledDate] = useState<string>(
    new Date().toISOString().split("T")[0]!
  );
  const [shelfLifeDays, setShelfLifeDays] = useState<number | null>(null);
  const [productionPrice, setProductionPrice] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stocking, setStocking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);

  // Load bottling lines from server (auto-generated based on stock_mode)
  const loadData = useCallback((): void => {
    setLoading(true);
    getBottlingLines(batchId)
      .then((result) => {
        setMode(result.mode);
        setLines(result.lines);
        setReceiptInfo(result.receiptInfo);
        setShelfLifeDays(result.shelfLifeDays);
        setProductionPrice(result.productionPrice);
        setPricingMode(result.pricingMode);
        if (result.bottledDate) {
          setBottledDate(result.bottledDate);
        }
        setDirty(false);
        // If there are existing bottling items with non-zero qty → consider saved
        if (result.lines.some((l) => l.quantity > 0)) {
          setSavedOnce(true);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error("Failed to load bottling lines:", err);
        setMode("none");
        setLoading(false);
      });
  }, [batchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      const result = await saveBottlingData(
        batchId,
        lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          baseItemQuantity: l.baseItemQuantity,
        })),
        bottledDate
      );
      if ("error" in result && result.error) {
        if (result.error === "RECEIPT_EXISTS") {
          toast.error(t("bottling.saveError"));
        } else {
          toast.error(t("bottling.saveError"));
        }
        return;
      }
      toast.success(t("bottling.saved"));
      setDirty(false);
      setSavedOnce(true);
      onMutate();
    } catch (err: unknown) {
      console.error("Failed to save bottling:", err);
      toast.error(t("bottling.saveError"));
    } finally {
      setSaving(false);
    }
  }, [batchId, lines, bottledDate, onMutate, t]);

  // Stock handler — called from confirm dialog
  const handleStock = useCallback(async (): Promise<void> => {
    setStocking(true);
    try {
      const result = await createProductionReceipt(batchId);
      if ("error" in result) {
        const errorKey = ({
          NO_BOTTLING_DATA: "stock.errorNoBottling",
          NO_WAREHOUSE: "stock.errorNoWarehouse",
          RECEIPT_ALREADY_EXISTS: "stock.errorAlreadyExists",
          NO_PRODUCTION_ITEM: "stock.errorNoProductionItem",
        } as Record<string, string>)[result.error] ?? "stock.error";
        toast.error(t(`bottling.${errorKey}` as Parameters<typeof t>[0]));
        return;
      }
      toast.success(
        t("bottling.stock.success", { code: result.receiptCode })
      );
      // Reload data to show receipt info
      loadData();
      onMutate();
    } catch (err: unknown) {
      console.error("Failed to stock beer:", err);
      toast.error(t("bottling.stock.error"));
    } finally {
      setStocking(false);
      setStockDialogOpen(false);
    }
  }, [batchId, loadData, onMutate, t]);

  // Summary calculations
  const beerCostPerLiter = productionPrice ? Number(productionPrice) : 0;
  const isPackagedMode = mode === "packaged";

  const summary = useMemo(() => {
    const totalBottled = lines.reduce(
      (sum, l) => sum + l.quantity * l.baseItemQuantity,
      0
    );
    const tankVolume = actualVolumeL ? Number(actualVolumeL) : null;
    const recipeVolume = recipeBatchSizeL ? Number(recipeBatchSizeL) : null;

    const diffTank = tankVolume !== null ? totalBottled - tankVolume : null;
    const diffRecipe = recipeVolume !== null ? totalBottled - recipeVolume : null;

    const nonZeroCount = lines.filter((l) => l.quantity > 0).length;

    // Total value for packaged mode
    let totalValue = 0;
    if (isPackagedMode) {
      for (const l of lines) {
        const beerCost = beerCostPerLiter * l.baseItemQuantity;
        const unitCost = beerCost + l.packagingCost + l.fillingCost;
        totalValue += unitCost * l.quantity;
      }
      totalValue = Math.round(totalValue * 100) / 100;
    }

    return { totalBottled, tankVolume, recipeVolume, diffTank, diffRecipe, nonZeroCount, totalValue };
  }, [lines, actualVolumeL, recipeBatchSizeL, beerCostPerLiter, isPackagedMode]);

  // Compute expiry date from bottledDate + shelfLifeDays
  const expiryDate = useMemo((): string | null => {
    if (!bottledDate || !shelfLifeDays) return null;
    const d = new Date(bottledDate);
    d.setDate(d.getDate() + shelfLifeDays);
    return d.toISOString().split("T")[0]!;
  }, [bottledDate, shelfLifeDays]);

  // Pricing mode label
  const pricingModeLabel = useMemo((): string => {
    if (pricingMode === "recipe_calc") return t("bottling.priceSource.recipe_calc");
    if (pricingMode === "actual_costs") return t("bottling.priceSource.actual_costs");
    return t("bottling.priceSource.fixed");
  }, [pricingMode, t]);

  const isReceiptConfirmed = receiptInfo?.status === "confirmed";
  const canSave = !isReceiptConfirmed && dirty && !saving;
  const canStock =
    !receiptInfo &&
    !dirty &&
    savedOnce &&
    summary.nonZeroCount > 0 &&
    !stocking;

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
      <div className="text-muted-foreground text-center py-8">
        <p>{t("bottling.modeNone")}</p>
        <p className="text-sm mt-1">
          <Link href="/settings/shops" className="underline hover:text-foreground">
            {t("bottling.modeNoneHint")}
          </Link>
        </p>
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

      {/* Bottled date + production price row */}
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("bottling.bottledDate")}</label>
          <Input
            type="date"
            className="w-44 h-9"
            value={bottledDate}
            onChange={(e) => {
              setBottledDate(e.target.value);
              setDirty(true);
            }}
            disabled={isReceiptConfirmed}
          />
        </div>
        {productionPrice !== null && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("bottling.productionPrice")}</label>
            <div className="text-sm tabular-nums">
              {Number(productionPrice).toFixed(2)} Kč/L
              <span className="ml-2 text-muted-foreground">({pricingModeLabel})</span>
            </div>
          </div>
        )}
        {expiryDate && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("bottling.expiryDate")}</label>
            <div className="text-sm tabular-nums">{expiryDate}</div>
          </div>
        )}
      </div>

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
            {isPackagedMode && (
              <>
                <TableHead className="w-[100px] text-right">{t("bottling.beerCost")}</TableHead>
                <TableHead className="w-[90px] text-right">{t("bottling.packagingCost")}</TableHead>
                <TableHead className="w-[90px] text-right">{t("bottling.fillingCost")}</TableHead>
                <TableHead className="w-[100px] text-right">{t("bottling.unitCost")}</TableHead>
                <TableHead className="w-[110px] text-right">{t("bottling.totalCost")}</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const lineTotal = line.quantity * line.baseItemQuantity;
            const beerCostLine = isPackagedMode
              ? Math.round(beerCostPerLiter * line.baseItemQuantity * 100) / 100
              : 0;
            const unitCost = isPackagedMode
              ? Math.round((beerCostLine + line.packagingCost + line.fillingCost) * 100) / 100
              : 0;
            const lineTotalCost = isPackagedMode
              ? Math.round(unitCost * line.quantity * 100) / 100
              : 0;
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
                    disabled={isReceiptConfirmed}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {lineTotal > 0 ? lineTotal.toFixed(1) : "-"}
                </TableCell>
                {isPackagedMode && (
                  <>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {beerCostLine > 0 ? beerCostLine.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {line.packagingCost > 0 ? line.packagingCost.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {line.fillingCost > 0 ? line.fillingCost.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {unitCost > 0 ? unitCost.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {lineTotalCost > 0 ? lineTotalCost.toFixed(2) : "-"}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={isPackagedMode ? 3 : 3} className="text-right font-semibold">
              {t("bottling.summary.totalBottled")}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {summary.totalBottled.toFixed(1)} L
            </TableCell>
            {isPackagedMode && (
              <>
                <TableCell colSpan={4} className="text-right font-semibold">
                  {t("bottling.totalValue")}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {summary.totalValue > 0 ? `${summary.totalValue.toFixed(2)} Kč` : "-"}
                </TableCell>
              </>
            )}
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
        {isPackagedMode && summary.totalValue > 0 && (
          <SummaryRow
            label={t("bottling.totalValue")}
            value={`${summary.totalValue.toFixed(2)} Kč`}
            bold
          />
        )}
      </div>

      {/* Buttons row */}
      <div className="flex items-center justify-between">
        {/* Save button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => void handleSave()}
                  disabled={!canSave}
                >
                  <Save className="mr-1 size-4" />
                  {t("bottling.save")}
                </Button>
              </span>
            </TooltipTrigger>
            {isReceiptConfirmed && receiptInfo && (
              <TooltipContent>
                {t("bottling.saveDisabledReceipt", { code: receiptInfo.code })}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Stock button — hidden if receipt exists */}
        {!receiptInfo && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="default"
                    onClick={() => setStockDialogOpen(true)}
                    disabled={!canStock}
                  >
                    <Factory className="mr-1 size-4" />
                    {t("bottling.stock.button")}
                  </Button>
                </span>
              </TooltipTrigger>
              {!canStock && !stocking && (
                <TooltipContent>
                  {summary.nonZeroCount === 0 || !savedOnce
                    ? t("bottling.stock.buttonDisabledEmpty")
                    : dirty
                      ? t("bottling.stock.buttonDisabledUnsaved")
                      : null}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Receipt info box */}
      {receiptInfo && (
        <div className="rounded-lg border p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("bottling.receipt.title")}:</span>
            <span className="font-medium">{receiptInfo.code}</span>
            <Badge variant={receiptInfo.status === "confirmed" ? "default" : "secondary"}>
              {receiptInfo.status}
            </Badge>
          </div>
          <Link
            href={`/stock/movements/${receiptInfo.id}?batchId=${batchId}&batchNumber=${encodeURIComponent(batchNumber)}&tab=bottling`}
            className="text-sm flex items-center gap-1 hover:underline text-primary"
          >
            {t("bottling.receipt.open")}
            <ExternalLink className="size-3" />
          </Link>
        </div>
      )}

      {/* Stock confirm dialog */}
      <AlertDialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bottling.stock.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span>{t("bottling.stock.confirmDescription")}</span>
              <br />
              <span>{t("bottling.stock.confirmLines", { count: summary.nonZeroCount })}</span>
              <br />
              <span>{t("bottling.stock.confirmVolume", { volume: summary.totalBottled.toFixed(1) })}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stocking}>
              {t("bottling.stock.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={stocking}
              onClick={(e) => {
                e.preventDefault();
                void handleStock();
              }}
            >
              {t("bottling.stock.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
