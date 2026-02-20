"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, ListChecks } from "lucide-react";
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
import type { StockIssueLine, ManualAllocationJsonEntry } from "../types";
import { LotAttributesSection } from "./LotAttributesSection";
import { LotSelectionDialog } from "./LotSelectionDialog";

// ── Props ───────────────────────────────────────────────────────

interface StockIssueLineTableProps {
  issueId: string;
  lines: StockIssueLine[];
  movementType: string;
  status: string;
  isDraft: boolean;
  onMutate: () => void;
  itemOptions: Array<{
    value: string;
    label: string;
    code: string;
    isBrewMaterial: boolean;
    materialType: string | null;
    issueMode: string;
  }>;
  additionalCost?: string;
  warehouseId: string;
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
  status,
  isDraft,
  onMutate,
  itemOptions,
  additionalCost,
  warehouseId,
}: StockIssueLineTableProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [lotDialogState, setLotDialogState] = useState<{
    lineId: string;
    itemId: string;
    qty: number;
    existingAllocations: ManualAllocationJsonEntry[] | null;
  } | null>(null);

  const isReceipt = movementType === "receipt";
  const isConfirmedIssue = !isReceipt && status === "confirmed";

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
      field: "requestedQty" | "issuedQty" | "unitPrice" | "notes" | "lotNumber" | "expiryDate",
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

  // ── Lot attributes update ──────────────────────────────────

  const handleUpdateLotAttributes = useCallback(
    async (lineId: string, attrs: Record<string, unknown>): Promise<void> => {
      try {
        await updateStockIssueLine(lineId, { lotAttributes: attrs });
        onMutate();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : t("lines.lineUpdateError");
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

  // ── Column count for footer ─────────────────────────────────

  // Base columns: lineNo, item, qty/requested, unitPrice, totalCost, notes
  let colCount = 6;
  if (isReceipt) colCount += 3; // lotNumber, expiryDate, lotAttributes
  if (isConfirmedIssue) colCount += 2; // actualQty, missingQty
  if (isDraft) colCount += 1; // actions

  const footerLabelSpan = colCount - 2; // everything except totalCost + trailing
  const footerTrailSpan = isDraft ? 1 : 0;

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
                {isReceipt ? (
                  // Receipts: single "Quantity" column
                  <TableHead className="w-28">{t("lines.quantity")}</TableHead>
                ) : (
                  // Issues: "Requested" column
                  <TableHead className="w-28">{t("lines.requestedQty")}</TableHead>
                )}
                {isConfirmedIssue && (
                  <>
                    <TableHead className="w-28">{t("lines.actualQty")}</TableHead>
                    <TableHead className="w-24">{t("lines.missingQty")}</TableHead>
                  </>
                )}
                <TableHead className="w-28">{t("lines.unitPrice")}</TableHead>
                <TableHead className="w-28">{t("lines.totalCost")}</TableHead>
                <TableHead>{t("lines.notes")}</TableHead>
                {isReceipt && <TableHead className="w-28">{t("lines.lotNumber")}</TableHead>}
                {isReceipt && <TableHead className="w-28">{t("lines.expiryDate")}</TableHead>}
                {isReceipt && <TableHead className="w-12" />}
                {isDraft && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => {
                const itemInfo = itemOptions.find((o) => o.value === line.itemId);
                const isManualLot = itemInfo?.issueMode === "manual_lot";
                return (
                  <StockIssueLineRow
                    key={line.id}
                    line={line}
                    index={index}
                    isDraft={isDraft}
                    isReceipt={isReceipt}
                    isConfirmedIssue={isConfirmedIssue}
                    itemOptions={itemOptions}
                    onUpdateField={handleUpdateField}
                    onRemove={handleRemoveLine}
                    materialType={itemInfo?.materialType ?? null}
                    isBrewMaterial={itemInfo?.isBrewMaterial ?? false}
                    onUpdateLotAttributes={handleUpdateLotAttributes}
                    isManualLot={isManualLot}
                    manualAllocations={line.manualAllocations}
                    onOpenLotDialog={
                      isDraft && !isReceipt && isManualLot
                        ? () => {
                            setLotDialogState({
                              lineId: line.id,
                              itemId: line.itemId,
                              qty: Number(line.requestedQty),
                              existingAllocations: line.manualAllocations,
                            });
                          }
                        : undefined
                    }
                  />
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell
                  colSpan={footerLabelSpan}
                  className="text-right font-medium"
                >
                  {t("lines.subtotal")}
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(subtotal)}
                </TableCell>
                {footerTrailSpan > 0 && <TableCell colSpan={footerTrailSpan} />}
              </TableRow>
              {additionalCostNum > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={footerLabelSpan}
                    className="text-right font-medium"
                  >
                    {t("lines.additionalCost")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(additionalCostNum)}
                  </TableCell>
                  {footerTrailSpan > 0 && <TableCell colSpan={footerTrailSpan} />}
                </TableRow>
              )}
              <TableRow>
                <TableCell
                  colSpan={footerLabelSpan}
                  className="text-right font-bold"
                >
                  {t("lines.grandTotal")}
                </TableCell>
                <TableCell className="font-bold">
                  {formatCurrency(grandTotal)}
                </TableCell>
                {footerTrailSpan > 0 && <TableCell colSpan={footerTrailSpan} />}
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

      {/* Lot Selection Dialog (manual_lot items) */}
      {lotDialogState && (
        <LotSelectionDialog
          open={!!lotDialogState}
          onOpenChange={(open) => {
            if (!open) setLotDialogState(null);
          }}
          issueLineId={lotDialogState.lineId}
          itemId={lotDialogState.itemId}
          warehouseId={warehouseId}
          requiredQty={lotDialogState.qty}
          existingAllocations={lotDialogState.existingAllocations}
          onAllocated={() => {
            setLotDialogState(null);
            onMutate();
          }}
        />
      )}
    </div>
  );
}

// ── Line Row (inline-editable) ──────────────────────────────────

interface StockIssueLineRowProps {
  line: StockIssueLine;
  index: number;
  isDraft: boolean;
  isReceipt: boolean;
  isConfirmedIssue: boolean;
  itemOptions: Array<{ value: string; label: string }>;
  onUpdateField: (
    lineId: string,
    field: "requestedQty" | "issuedQty" | "unitPrice" | "notes" | "lotNumber" | "expiryDate",
    value: string
  ) => Promise<void>;
  onRemove: (lineId: string) => Promise<void>;
  materialType: string | null;
  isBrewMaterial: boolean;
  onUpdateLotAttributes: (lineId: string, attrs: Record<string, unknown>) => Promise<void>;
  isManualLot: boolean;
  manualAllocations: ManualAllocationJsonEntry[] | null;
  onOpenLotDialog?: () => void;
}

function StockIssueLineRow({
  line,
  index,
  isDraft,
  isReceipt,
  isConfirmedIssue,
  itemOptions,
  onUpdateField,
  onRemove,
  materialType,
  isBrewMaterial,
  onUpdateLotAttributes,
  isManualLot,
  manualAllocations,
  onOpenLotDialog,
}: StockIssueLineRowProps): React.ReactNode {
  const tRow = useTranslations("stockIssues");
  const [requestedQty, setRequestedQty] = useState(line.requestedQty);
  const [unitPrice, setUnitPrice] = useState(line.unitPrice ?? "0");
  const [notes, setNotes] = useState(line.notes ?? "");
  const [lotNumber, setLotNumber] = useState(line.lotNumber ?? "");
  const [expiryDate, setExpiryDate] = useState(line.expiryDate ?? "");

  const requestedNum = toNumber(requestedQty);
  const issuedNum = toNumber(line.issuedQty);
  const unitPriceNum = toNumber(unitPrice);

  // Compute total: for receipts use requestedQty * unitPrice, for issues use computed values
  const displayTotal = isReceipt
    ? requestedNum * unitPriceNum
    : toNumber(line.totalCost);

  // Missing: only for confirmed issues
  const missing = isConfirmedIssue
    ? Math.max(0, requestedNum - issuedNum)
    : 0;

  const handleBlur = useCallback(
    (
      field: "requestedQty" | "issuedQty" | "unitPrice" | "notes" | "lotNumber" | "expiryDate",
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
      <TableCell>
        <div className="font-medium">
          {resolveItemName(line.itemId, itemOptions)}
        </div>
        {isManualLot && !isReceipt && (
          <div className="mt-0.5 text-xs">
            {manualAllocations && manualAllocations.length > 0 ? (
              <span className="text-green-600">
                <ListChecks className="mr-1 inline size-3" />
                {tRow("lotSelection.lotsSelected", { count: manualAllocations.length })}
              </span>
            ) : (
              <span className="text-amber-500">
                {tRow("lotSelection.noLotsSelected")}
              </span>
            )}
          </div>
        )}
      </TableCell>

      {/* Quantity / Requested Qty */}
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

      {/* Actual Qty + Missing (only for confirmed issues) */}
      {isConfirmedIssue && (
        <>
          <TableCell>
            <span>{issuedNum}</span>
          </TableCell>
          <TableCell>
            {missing > 0 ? (
              <span className="text-destructive font-medium">{missing}</span>
            ) : (
              <span className="text-muted-foreground">{"\u2014"}</span>
            )}
          </TableCell>
        </>
      )}

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
        {formatCurrency(displayTotal)}
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
          <span className="text-sm text-muted-foreground">{notes || "\u2014"}</span>
        )}
      </TableCell>

      {/* Lot Number (receipt only) */}
      {isReceipt && (
        <TableCell>
          {isDraft ? (
            <Input
              className="h-8 w-24"
              value={lotNumber}
              placeholder="LOT..."
              onChange={(e) => {
                setLotNumber(e.target.value);
              }}
              onBlur={() => {
                handleBlur("lotNumber", lotNumber, line.lotNumber ?? "");
              }}
            />
          ) : (
            <span className="text-sm">{lotNumber || "\u2014"}</span>
          )}
        </TableCell>
      )}

      {/* Expiry Date (receipt only) */}
      {isReceipt && (
        <TableCell>
          {isDraft ? (
            <Input
              type="date"
              className="h-8 w-28"
              value={expiryDate}
              onChange={(e) => {
                setExpiryDate(e.target.value);
              }}
              onBlur={() => {
                handleBlur("expiryDate", expiryDate, line.expiryDate ?? "");
              }}
            />
          ) : (
            <span className="text-sm">{expiryDate || "\u2014"}</span>
          )}
        </TableCell>
      )}

      {/* Lot Attributes (receipt only, brew materials) */}
      {isReceipt && (
        <TableCell>
          {isBrewMaterial && materialType && (
            <LotAttributesSection
              materialType={materialType}
              lotAttributes={line.lotAttributes}
              isDraft={isDraft}
              onUpdate={(attrs) => {
                void onUpdateLotAttributes(line.id, attrs);
              }}
            />
          )}
        </TableCell>
      )}

      {/* Actions */}
      {isDraft && (
        <TableCell>
          <div className="flex items-center gap-1">
            {onOpenLotDialog && isManualLot && !isReceipt && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title={tRow("lotSelection.selectLots")}
                onClick={onOpenLotDialog}
              >
                <ListChecks className="size-4" />
              </Button>
            )}
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
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
