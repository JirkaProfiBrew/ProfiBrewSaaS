"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { addOrderItem, updateOrderItem } from "../actions";
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

interface OrderItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  editingItem: OrderItem | null;
  itemOptions: ItemOption[];
  depositOptions: DepositOption[];
  onSaved: () => void;
}

// ── Helpers ──────────────────────────────────────────────────

const EMPTY_DEPOSIT_VALUE = "__none__";

function formatCZK(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Component ────────────────────────────────────────────────

export function OrderItemDialog({
  open,
  onOpenChange,
  orderId,
  editingItem,
  itemOptions,
  depositOptions,
  onSaved,
}: OrderItemDialogProps): React.ReactNode {
  const t = useTranslations("orders");
  const tCommon = useTranslations("common");

  const isEdit = editingItem !== null;

  // Form state
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [vatRate, setVatRate] = useState("21");
  const [depositId, setDepositId] = useState<string | null>(null);
  const [depositQty, setDepositQty] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when dialog opens/changes
  useEffect(() => {
    if (!open) return;

    if (editingItem) {
      setItemId(editingItem.itemId);
      setQuantity(editingItem.quantity);
      setUnitPrice(editingItem.unitPrice);
      setDiscountPct(editingItem.discountPct ?? "0");
      setVatRate(editingItem.vatRate ?? "21");
      setDepositId(editingItem.depositId ?? null);
      setDepositQty(editingItem.depositQty ?? "0");
      setNotes(editingItem.notes ?? "");
    } else {
      setItemId("");
      setQuantity("");
      setUnitPrice("");
      setDiscountPct("0");
      setVatRate("21");
      setDepositId(null);
      setDepositQty("");
      setNotes("");
    }
  }, [open, editingItem]);

  // When item is selected in create mode, auto-fill unitPrice
  const handleItemChange = useCallback(
    (value: string): void => {
      setItemId(value);
      if (!isEdit) {
        const selected = itemOptions.find((opt) => opt.value === value);
        if (selected) {
          setUnitPrice(selected.unitPrice);
        }
      }
    },
    [isEdit, itemOptions]
  );

  // When deposit is selected, auto-fill depositQty to match quantity
  const handleDepositChange = useCallback(
    (value: string): void => {
      if (value === EMPTY_DEPOSIT_VALUE) {
        setDepositId(null);
        setDepositQty("");
      } else {
        setDepositId(value);
        setDepositQty(quantity || "1");
      }
    },
    [quantity]
  );

  // When quantity changes and a deposit is selected, sync depositQty
  useEffect(() => {
    if (depositId && quantity) {
      setDepositQty(quantity);
    }
  }, [quantity, depositId]);

  // Computed total excl. VAT (live calculation)
  const computedTotalExclVat = useMemo((): string => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const discount = parseFloat(discountPct) || 0;
    const total = qty * price * (1 - discount / 100);
    return total.toFixed(2);
  }, [quantity, unitPrice, discountPct]);

  // Save handler
  const handleSave = useCallback(async (): Promise<void> => {
    if (!itemId || !quantity || !unitPrice) return;

    setIsSaving(true);
    try {
      if (isEdit && editingItem) {
        const result = await updateOrderItem(editingItem.id, {
          quantity,
          unitPrice,
          vatRate,
          discountPct,
          depositId: depositId ?? null,
          depositQty: depositId ? (depositQty || "0") : "0",
          notes: notes || null,
        });

        if ("error" in result) {
          toast.error(t("messages.itemFailed"));
          return;
        }

        toast.success(t("messages.itemUpdated"));
      } else {
        const result = await addOrderItem(orderId, {
          itemId,
          quantity,
          unitPrice,
          vatRate,
          discountPct,
          depositId: depositId ?? null,
          depositQty: depositId ? (depositQty || "0") : "0",
          notes: notes || null,
        });

        if ("error" in result) {
          toast.error(t("messages.itemFailed"));
          return;
        }

        toast.success(t("messages.itemAdded"));
      }

      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      console.error("Failed to save order item:", error);
      toast.error(t("messages.itemFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [
    isEdit,
    editingItem,
    orderId,
    itemId,
    quantity,
    unitPrice,
    vatRate,
    discountPct,
    depositId,
    depositQty,
    notes,
    onOpenChange,
    onSaved,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("items.editItem") : t("items.addItem")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Item select */}
          <div className="space-y-2">
            <Label htmlFor="item-select">
              {t("items.item")}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Select
              value={itemId || undefined}
              onValueChange={handleItemChange}
              disabled={isEdit}
            >
              <SelectTrigger id="item-select" className="w-full">
                <SelectValue placeholder={t("items.itemPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {itemOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity + Unit Price (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-quantity">
                {t("items.quantity")}
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="item-quantity"
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-unit-price">
                {t("items.unitPrice")}
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="item-unit-price"
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Discount + VAT (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-discount">{t("items.discountPct")}</Label>
              <Input
                id="item-discount"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-vat">{t("items.vatRate")}</Label>
              <Input
                id="item-vat"
                type="number"
                step="1"
                min="0"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </div>
          </div>

          {/* Computed total (readonly) */}
          <div className="space-y-2">
            <Label htmlFor="item-total">{t("items.totalExclVat")}</Label>
            <Input
              id="item-total"
              value={`${formatCZK(computedTotalExclVat)} Kč`}
              disabled
              readOnly
              className="bg-muted font-medium tabular-nums"
            />
          </div>

          {/* Deposit type + Deposit qty (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-deposit">{t("items.deposit")}</Label>
              <Select
                value={depositId ?? EMPTY_DEPOSIT_VALUE}
                onValueChange={handleDepositChange}
              >
                <SelectTrigger id="item-deposit" className="w-full">
                  <SelectValue placeholder={t("items.depositPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_DEPOSIT_VALUE}>--</SelectItem>
                  {depositOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-deposit-qty">{t("items.depositQty")}</Label>
              <Input
                id="item-deposit-qty"
                type="number"
                step="1"
                min="0"
                value={depositQty}
                disabled={!depositId}
                onChange={(e) => setDepositQty(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="item-notes">{t("items.notes")}</Label>
            <Textarea
              id="item-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving || !itemId || !quantity || !unitPrice}
          >
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
