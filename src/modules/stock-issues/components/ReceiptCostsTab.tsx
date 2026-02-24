"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { addReceiptCost, updateReceiptCost, removeReceiptCost } from "../actions";
import type { ReceiptCost, StockIssueLine, CostAllocation } from "../types";

// ── Helpers ─────────────────────────────────────────────────────

function toNumber(val: string | null | undefined): number {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
}

// ── Props ───────────────────────────────────────────────────────

interface ReceiptCostsTabProps {
  issueId: string;
  costs: ReceiptCost[];
  lines: StockIssueLine[];
  isDraft: boolean;
  onMutate: () => void;
}

// ── Component ───────────────────────────────────────────────────

export function ReceiptCostsTab({
  issueId,
  costs,
  lines,
  isDraft,
  onMutate,
}: ReceiptCostsTabProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const tCommon = useTranslations("common");

  // Computed summaries
  const linesSubtotal = lines.reduce(
    (sum, l) => sum + toNumber(l.requestedQty) * toNumber(l.unitPrice),
    0
  );
  const costsTotal = costs.reduce((sum, c) => sum + toNumber(c.amount), 0);
  const grandTotal = lines.reduce(
    (sum, l) => sum + toNumber(l.requestedQty) * toNumber(l.fullUnitPrice ?? l.unitPrice),
    0
  );

  // ── Add cost ────────────────────────────────────────────────

  const handleAddCost = useCallback(async (): Promise<void> => {
    try {
      await addReceiptCost(issueId, {
        description: "",
        amount: "0",
        allocation: "by_value",
      });
      onMutate();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("costs.addError");
      toast.error(message);
    }
  }, [issueId, onMutate, t]);

  // ── Remove cost ──────────────────────────────────────────────

  const handleRemoveCost = useCallback(
    async (costId: string): Promise<void> => {
      try {
        await removeReceiptCost(costId);
        toast.success(t("costs.removed"));
        onMutate();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : t("costs.removeError");
        toast.error(message);
      }
    },
    [onMutate, t]
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("costs.title")}</h3>
        {isDraft && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void handleAddCost();
            }}
          >
            <Plus className="mr-1 size-4" />
            {t("costs.addCost")}
          </Button>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {t("costs.description")}
      </p>

      {/* Table */}
      {costs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("costs.noCosts")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("costs.descriptionCol")}</TableHead>
                <TableHead className="w-36">{t("costs.amount")}</TableHead>
                <TableHead className="w-44">{t("costs.allocation")}</TableHead>
                {isDraft && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((cost) => (
                <CostRow
                  key={cost.id}
                  cost={cost}
                  isDraft={isDraft}
                  onMutate={onMutate}
                  onRemove={handleRemoveCost}
                />
              ))}
            </TableBody>
            <TableFooter>
              {/* Summary */}
              <TableRow>
                <TableCell className="text-right font-medium">
                  {t("costs.summary.goodsSubtotal")}
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(linesSubtotal)}
                </TableCell>
                <TableCell />
                {isDraft && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell className="text-right font-medium">
                  {t("costs.summary.overhead")}
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(costsTotal)}
                </TableCell>
                <TableCell />
                {isDraft && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell className="text-right font-bold">
                  {t("costs.summary.grandTotal")}
                </TableCell>
                <TableCell className="font-bold">
                  {formatCurrency(grandTotal)}
                </TableCell>
                <TableCell />
                {isDraft && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Cost Row (inline-editable) ──────────────────────────────────

interface CostRowProps {
  cost: ReceiptCost;
  isDraft: boolean;
  onMutate: () => void;
  onRemove: (costId: string) => Promise<void>;
}

function CostRow({
  cost,
  isDraft,
  onMutate,
  onRemove,
}: CostRowProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const tCommon = useTranslations("common");

  const [description, setDescription] = useState(cost.description);
  const [amount, setAmount] = useState(cost.amount);
  const [allocation, setAllocation] = useState<CostAllocation>(cost.allocation);

  const handleBlurField = useCallback(
    async (
      field: "description" | "amount",
      value: string,
      original: string
    ): Promise<void> => {
      if (value === original) return;
      try {
        await updateReceiptCost(cost.id, { [field]: value });
        onMutate();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : t("costs.updateError");
        toast.error(message);
      }
    },
    [cost.id, onMutate, t]
  );

  const handleAllocationChange = useCallback(
    async (value: CostAllocation): Promise<void> => {
      setAllocation(value);
      try {
        await updateReceiptCost(cost.id, { allocation: value });
        onMutate();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : t("costs.updateError");
        toast.error(message);
      }
    },
    [cost.id, onMutate, t]
  );

  return (
    <TableRow>
      {/* Description */}
      <TableCell>
        {isDraft ? (
          <Input
            className="h-8"
            value={description}
            placeholder={t("costs.descriptionPlaceholder")}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
            onBlur={() => {
              void handleBlurField("description", description, cost.description);
            }}
          />
        ) : (
          <span>{description || "\u2014"}</span>
        )}
      </TableCell>

      {/* Amount */}
      <TableCell>
        {isDraft ? (
          <Input
            type="number"
            min="0"
            step="any"
            className="h-8 w-32"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
            onBlur={() => {
              void handleBlurField("amount", amount, cost.amount);
            }}
          />
        ) : (
          <span>
            {formatCurrency(toNumber(cost.amount))}
          </span>
        )}
      </TableCell>

      {/* Allocation */}
      <TableCell>
        {isDraft ? (
          <Select
            value={allocation}
            onValueChange={(v) => {
              void handleAllocationChange(v as CostAllocation);
            }}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="by_value">
                {t("costs.allocationByValue")}
              </SelectItem>
              <SelectItem value="by_quantity">
                {t("costs.allocationByQuantity")}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm">
            {allocation === "by_value"
              ? t("costs.allocationByValue")
              : t("costs.allocationByQuantity")}
          </span>
        )}
      </TableCell>

      {/* Actions */}
      {isDraft && (
        <TableCell>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tCommon("confirmDelete")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {tCommon("confirmDeleteDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void onRemove(cost.id);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {tCommon("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TableCell>
      )}
    </TableRow>
  );
}
