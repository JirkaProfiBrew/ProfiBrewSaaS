"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

import {
  addStockIssueLine,
  updateStockIssueLine,
  removeStockIssueLine,
} from "../actions";
import type { StockIssueLine } from "../types";

// ── Props ───────────────────────────────────────────────────────

interface StockIssueLineTableProps {
  issueId: string;
  lines: StockIssueLine[];
  movementType: string;
  isDraft: boolean;
  onMutate: () => void;
  itemOptions: Array<{ value: string; label: string; code: string }>;
  additionalCost?: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function resolveItemName(
  itemId: string,
  options: Array<{ value: string; label: string }>
): string {
  const found = options.find((o) => o.value === itemId);
  return found ? found.label : itemId;
}

function toNumber(val: string | null | undefined): number {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
}

// ── Component ───────────────────────────────────────────────────

export function StockIssueLineTable({
  issueId,
  lines,
  movementType,
  isDraft,
  onMutate,
  itemOptions,
  additionalCost,
}: StockIssueLineTableProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const isReceipt = movementType === "receipt";

  // ── Add line handler ────────────────────────────────────────

  const handleAddLine = useCallback(
    async (itemId: string): Promise<void> => {
      setAddDialogOpen(false);
      setSearchValue("");
      try {
        await addStockIssueLine(issueId, {
          itemId,
          requestedQty: "1",
          issuedQty: "1",
          unitPrice: "0",
        });
        toast.success(t("lines.lineAdded"));
        onMutate();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : t("lines.lineAddError");
        toast.error(message);
      }
    },
    [issueId, onMutate, t]
  );

  // ── Inline update handler ───────────────────────────────────

  const handleUpdateField = useCallback(
    async (
      lineId: string,
      field: "requestedQty" | "issuedQty" | "unitPrice" | "notes",
      value: string
    ): Promise<void> => {
      try {
        await updateStockIssueLine(lineId, { [field]: value });
        onMutate();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : t("lines.lineUpdateError");
        toast.error(message);
      }
    },
    [onMutate, t]
  );

  // ── Remove handler ──────────────────────────────────────────

  const handleRemoveLine = useCallback(
    async (lineId: string): Promise<void> => {
      try {
        await removeStockIssueLine(lineId);
        toast.success(t("lines.lineRemoved"));
        onMutate();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : t("lines.lineRemoveError");
        toast.error(message);
      }
    },
    [onMutate, t]
  );

  // ── Computed totals ─────────────────────────────────────────

  const subtotal = lines.reduce(
    (sum, line) => sum + toNumber(line.totalCost),
    0
  );
  const additionalCostNum = toNumber(additionalCost);
  const grandTotal = subtotal + additionalCostNum;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("tabs.lines")}</h3>
        {isDraft && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddDialogOpen(true);
            }}
          >
            <Plus className="mr-1 size-4" />
            {t("lines.addLine")}
          </Button>
        )}
      </div>

      {/* Table */}
      {lines.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("lines.noLines")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t("lines.lineNo")}</TableHead>
                <TableHead>{t("lines.item")}</TableHead>
                <TableHead className="w-28">{t("lines.requestedQty")}</TableHead>
                <TableHead className="w-28">{t("lines.issuedQty")}</TableHead>
                <TableHead className="w-24">{t("lines.missingQty")}</TableHead>
                <TableHead className="w-28">{t("lines.unitPrice")}</TableHead>
                <TableHead className="w-28">{t("lines.totalCost")}</TableHead>
                <TableHead>{t("lines.notes")}</TableHead>
                {isDraft && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <StockIssueLineRow
                  key={line.id}
                  line={line}
                  index={index}
                  isDraft={isDraft}
                  isReceipt={isReceipt}
                  itemOptions={itemOptions}
                  onUpdateField={handleUpdateField}
                  onRemove={handleRemoveLine}
                />
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-right font-medium"
                >
                  {t("lines.subtotal")}
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(subtotal)}
                </TableCell>
                <TableCell colSpan={isDraft ? 2 : 1} />
              </TableRow>
              {additionalCostNum > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-right font-medium"
                  >
                    {t("lines.additionalCost")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(additionalCostNum)}
                  </TableCell>
                  <TableCell colSpan={isDraft ? 2 : 1} />
                </TableRow>
              )}
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-right font-bold"
                >
                  {t("lines.grandTotal")}
                </TableCell>
                <TableCell className="font-bold">
                  {formatCurrency(grandTotal)}
                </TableCell>
                <TableCell colSpan={isDraft ? 2 : 1} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Add Line Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{t("lines.selectItem")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("lines.searchItem")}
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput
              placeholder={t("lines.searchItem")}
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>{t("lines.noLines")}</CommandEmpty>
              <CommandGroup>
                {itemOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      void handleAddLine(option.value);
                    }}
                  >
                    <span className="mr-2 text-xs text-muted-foreground">
                      {option.code}
                    </span>
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Line Row (inline-editable) ──────────────────────────────────

interface StockIssueLineRowProps {
  line: StockIssueLine;
  index: number;
  isDraft: boolean;
  isReceipt: boolean;
  itemOptions: Array<{ value: string; label: string }>;
  onUpdateField: (
    lineId: string,
    field: "requestedQty" | "issuedQty" | "unitPrice" | "notes",
    value: string
  ) => Promise<void>;
  onRemove: (lineId: string) => Promise<void>;
}

function StockIssueLineRow({
  line,
  index,
  isDraft,
  isReceipt,
  itemOptions,
  onUpdateField,
  onRemove,
}: StockIssueLineRowProps): React.ReactNode {
  const [requestedQty, setRequestedQty] = useState(line.requestedQty);
  const [issuedQty, setIssuedQty] = useState(line.issuedQty ?? line.requestedQty);
  const [unitPrice, setUnitPrice] = useState(line.unitPrice ?? "0");
  const [notes, setNotes] = useState(line.notes ?? "");

  const requestedNum = toNumber(requestedQty);
  const issuedNum = toNumber(issuedQty);
  const missing = requestedNum > issuedNum ? requestedNum - issuedNum : 0;
  const unitPriceNum = toNumber(unitPrice);
  const total = issuedNum * unitPriceNum;

  const handleBlur = useCallback(
    (
      field: "requestedQty" | "issuedQty" | "unitPrice" | "notes",
      value: string,
      originalValue: string
    ): void => {
      if (value !== originalValue) {
        void onUpdateField(line.id, field, value);
      }
    },
    [line.id, onUpdateField]
  );

  return (
    <TableRow>
      {/* Line number */}
      <TableCell className="text-center text-muted-foreground">
        {line.lineNo ?? index + 1}
      </TableCell>

      {/* Item */}
      <TableCell className="font-medium">
        {resolveItemName(line.itemId, itemOptions)}
      </TableCell>

      {/* Requested Qty */}
      <TableCell>
        {isDraft ? (
          <Input
            type="number"
            min="0"
            step="any"
            className="h-8 w-24"
            value={requestedQty}
            onChange={(e) => {
              setRequestedQty(e.target.value);
            }}
            onBlur={() => {
              handleBlur("requestedQty", requestedQty, line.requestedQty);
            }}
          />
        ) : (
          <span>{requestedQty}</span>
        )}
      </TableCell>

      {/* Issued Qty */}
      <TableCell>
        {isDraft ? (
          <Input
            type="number"
            min="0"
            step="any"
            className="h-8 w-24"
            value={issuedQty}
            onChange={(e) => {
              setIssuedQty(e.target.value);
            }}
            onBlur={() => {
              handleBlur(
                "issuedQty",
                issuedQty,
                line.issuedQty ?? line.requestedQty
              );
            }}
          />
        ) : (
          <span>{issuedQty}</span>
        )}
      </TableCell>

      {/* Missing */}
      <TableCell>
        {missing > 0 ? (
          <span className="text-destructive font-medium">{missing}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Unit Price */}
      <TableCell>
        {isDraft && isReceipt ? (
          <Input
            type="number"
            min="0"
            step="any"
            className="h-8 w-24"
            value={unitPrice}
            onChange={(e) => {
              setUnitPrice(e.target.value);
            }}
            onBlur={() => {
              handleBlur("unitPrice", unitPrice, line.unitPrice ?? "0");
            }}
          />
        ) : (
          <span>{formatCurrency(unitPriceNum)}</span>
        )}
      </TableCell>

      {/* Total */}
      <TableCell className="font-medium">
        {formatCurrency(total)}
      </TableCell>

      {/* Notes */}
      <TableCell>
        {isDraft ? (
          <Input
            className="h-8"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
            onBlur={() => {
              handleBlur("notes", notes, line.notes ?? "");
            }}
          />
        ) : (
          <span className="text-sm text-muted-foreground">{notes || "—"}</span>
        )}
      </TableCell>

      {/* Actions */}
      {isDraft && (
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={() => {
              void onRemove(line.id);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
