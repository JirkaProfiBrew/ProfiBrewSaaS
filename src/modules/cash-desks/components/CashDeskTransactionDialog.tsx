"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { createCashDeskTransaction } from "../actions";
import { getCategoryOptions } from "@/modules/cashflows/actions";
import type { CategoryOption } from "@/modules/cashflows/types";

interface CashDeskTransactionDialogProps {
  cashDeskId: string;
  type: "income" | "expense";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CashDeskTransactionDialog({
  cashDeskId,
  type,
  open,
  onOpenChange,
  onCreated,
}: CashDeskTransactionDialogProps): React.ReactNode {
  const t = useTranslations("cashDesks");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Load categories when dialog opens or type changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const opts = await getCategoryOptions(type);
        if (!cancelled) {
          setCategories(opts);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, type]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setAmount("");
      setDescription("");
      setCategoryId("");
    }
  }, [open]);

  const handlePreset = useCallback((preset: string): void => {
    setDescription(preset);
  }, []);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error(t("transaction.amountPlaceholder"));
      return;
    }

    setLoading(true);
    try {
      const result = await createCashDeskTransaction(cashDeskId, {
        type,
        amount,
        description,
        categoryId: categoryId || null,
      });
      if ("error" in result) {
        toast.error(t("transaction.createFailed"));
        return;
      }
      toast.success(t("transaction.created"));
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error(t("transaction.createFailed"));
    } finally {
      setLoading(false);
    }
  }, [amount, cashDeskId, categoryId, description, onCreated, onOpenChange, t, type]);

  const incomePresets = [
    { key: "beerSale", label: t("transaction.presets.beerSale") },
    { key: "ciderSale", label: t("transaction.presets.ciderSale") },
    { key: "other", label: t("transaction.presets.other") },
  ];

  const expensePresets = [
    { key: "smallExpense", label: t("transaction.presets.smallExpense") },
    { key: "materialPurchase", label: t("transaction.presets.materialPurchase") },
    { key: "other", label: t("transaction.presets.other") },
  ];

  const presets = type === "income" ? incomePresets : expensePresets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === "income"
              ? t("transaction.incomeTitle")
              : t("transaction.expenseTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Amount */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t("transaction.amount")}</Label>
            <Input
              className="col-span-3"
              type="number"
              min={0}
              step="0.01"
              placeholder={t("transaction.amountPlaceholder")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Quick description presets */}
          <div className="grid grid-cols-4 items-start gap-4">
            <div />
            <div className="col-span-3 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset(preset.label)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t("transaction.description")}</Label>
            <Input
              className="col-span-3"
              placeholder={t("transaction.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t("transaction.category")}</Label>
            <div className="col-span-3">
              <Select
                value={categoryId}
                onValueChange={(value) => setCategoryId(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("transaction.categoryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("transaction.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? t("transaction.creating") : t("transaction.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
