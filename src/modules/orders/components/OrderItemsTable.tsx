"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

import { removeOrderItem, getItemOptions, getDepositOptions } from "../actions";
import { OrderItemDialog } from "./OrderItemDialog";
import type { OrderItem } from "../types";

// ── Types ────────────────────────────────────────────────────

interface ItemOption {
  value: string;
  label: string;
  unitPrice: string;
  unitSymbol: string;
}

interface DepositOption {
  value: string;
  label: string;
  depositAmount: string;
}

interface OrderItemsTableProps {
  orderId: string;
  items: OrderItem[];
  isDraft: boolean;
  onMutate: () => void;
}

// ── Helpers ──────────────────────────────────────────────────

function formatAmount(value: string | null): string {
  const num = parseFloat(value ?? "0") || 0;
  return num.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Component ────────────────────────────────────────────────

export function OrderItemsTable({
  orderId,
  items,
  isDraft,
  onMutate,
}: OrderItemsTableProps): React.ReactNode {
  const t = useTranslations("orders");
  const tCommon = useTranslations("common");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);

  // Options for the dialog selects
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [depositOptions, setDepositOptions] = useState<DepositOption[]>([]);

  // Load options on mount
  useEffect(() => {
    let cancelled = false;

    Promise.all([getItemOptions(), getDepositOptions()])
      .then(([itemOpts, depositOpts]) => {
        if (!cancelled) {
          setItemOptions(itemOpts);
          setDepositOptions(depositOpts);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load item/deposit options:", error);
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  // Handlers
  const handleAddClick = useCallback((): void => {
    setEditingItem(null);
    setDialogOpen(true);
  }, []);

  const handleEditClick = useCallback((item: OrderItem): void => {
    setEditingItem(item);
    setDialogOpen(true);
  }, []);

  const handleDeleteItem = useCallback(
    async (itemId: string): Promise<void> => {
      try {
        const result = await removeOrderItem(itemId);
        if ("error" in result) {
          toast.error(t("messages.itemFailed"));
          return;
        }
        toast.success(t("messages.itemRemoved"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to remove order item:", error);
        toast.error(t("messages.itemFailed"));
      }
    },
    [onMutate, t]
  );

  const handleDialogSaved = useCallback((): void => {
    onMutate();
  }, [onMutate]);

  return (
    <div className="space-y-4">
      {/* Add button (draft only) */}
      {isDraft && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAddClick}>
            <Plus className="mr-1 size-4" />
            {t("items.addItem")}
          </Button>
        </div>
      )}

      {/* Items table */}
      {items.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t("items.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("items.item")}</TableHead>
                <TableHead className="text-right">{t("items.quantity")}</TableHead>
                <TableHead>{t("items.unit")}</TableHead>
                <TableHead className="text-right">{t("items.unitPrice")}</TableHead>
                <TableHead className="text-right">{t("items.discountPct")}</TableHead>
                <TableHead className="text-right">{t("items.vatRate")}</TableHead>
                <TableHead className="text-right">{t("items.totalExclVat")}</TableHead>
                <TableHead className="text-right">{t("items.depositTotal")}</TableHead>
                {isDraft && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.itemCode ? `${item.itemCode} — ` : ""}
                    {item.itemName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(item.quantity)}
                  </TableCell>
                  <TableCell>{item.unitSymbol ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(item.discountPct)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(item.vatRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatAmount(item.totalExclVat)}
                  </TableCell>
                  <TableCell className="text-right">
                    {parseFloat(item.depositTotal ?? "0") > 0 ? (
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">
                          {item.depositName ?? "—"}
                        </div>
                        <div className="text-muted-foreground tabular-nums text-xs">
                          {formatAmount(item.depositQty)} × {formatAmount(item.depositAmount ?? "0")} = {formatAmount(item.depositTotal)}
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {isDraft && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => handleEditClick(item)}
                        >
                          <Pencil className="size-4" />
                        </Button>

                        {/* Delete button with confirmation */}
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
                              <AlertDialogTitle>
                                {t("items.deleteConfirm")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {item.itemName ?? t("items.item")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {tCommon("cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  void handleDeleteItem(item.id);
                                }}
                              >
                                {tCommon("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Item Dialog */}
      <OrderItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orderId={orderId}
        editingItem={editingItem}
        itemOptions={itemOptions}
        depositOptions={depositOptions}
        onSaved={handleDialogSaved}
      />
    </div>
  );
}
