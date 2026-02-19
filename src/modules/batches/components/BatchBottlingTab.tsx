"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "@/components/ui/table";

import { addBottlingItem, deleteBottlingItem, getProductionItemOptions } from "../actions";
import type { BottlingItem } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────

interface BatchBottlingTabProps {
  batchId: string;
  bottlingItems: BottlingItem[];
  actualVolumeL: string | null;
  onMutate: () => void;
}

export function BatchBottlingTab({
  batchId,
  bottlingItems,
  actualVolumeL,
  onMutate,
}: BatchBottlingTabProps): React.ReactNode {
  const t = useTranslations("batches");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productOptions, setProductOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [formData, setFormData] = useState({
    itemId: "",
    quantity: "",
    bottledAt: "",
    notes: "",
  });

  // Load production items for the select
  useEffect(() => {
    let cancelled = false;

    getProductionItemOptions()
      .then((options) => {
        if (!cancelled) setProductOptions(options);
      })
      .catch((error: unknown) => {
        console.error("Failed to load production items:", error);
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  const resetForm = useCallback((): void => {
    setFormData({
      itemId: "",
      quantity: "",
      bottledAt: "",
      notes: "",
    });
  }, []);

  const handleAdd = useCallback(async (): Promise<void> => {
    if (!formData.itemId || !formData.quantity) return;

    const qty = parseInt(formData.quantity, 10);
    if (isNaN(qty) || qty <= 0) return;

    setIsSubmitting(true);
    try {
      await addBottlingItem(batchId, {
        itemId: formData.itemId,
        quantity: qty,
        bottledAt: formData.bottledAt || undefined,
        notes: formData.notes || null,
      });
      toast.success(t("bottling.added"));
      setDialogOpen(false);
      resetForm();
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to add bottling item:", error);
      toast.error(t("bottling.addError"));
    } finally {
      setIsSubmitting(false);
    }
  }, [batchId, formData, onMutate, resetForm, t]);

  const handleDelete = useCallback(
    async (bottlingId: string): Promise<void> => {
      try {
        await deleteBottlingItem(bottlingId);
        toast.success(t("bottling.deleted"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to delete bottling item:", error);
        toast.error(t("bottling.deleteError"));
      }
    },
    [onMutate, t]
  );

  // Summary: total bottled, remaining
  const summary = useMemo(() => {
    const totalBottled = bottlingItems.reduce((sum, item) => {
      const units = item.baseUnits ? parseFloat(item.baseUnits) : 0;
      return sum + units;
    }, 0);
    const totalVolume = actualVolumeL ? parseFloat(actualVolumeL) : 0;
    const remaining = totalVolume - totalBottled;

    return { totalBottled, totalVolume, remaining };
  }, [bottlingItems, actualVolumeL]);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      {actualVolumeL && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {t("bottling.totalVolume")}
            </p>
            <p className="text-lg font-semibold">
              {summary.totalVolume.toFixed(1)} L
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {t("bottling.totalBottled")}
            </p>
            <p className="text-lg font-semibold">
              {summary.totalBottled.toFixed(1)} L
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {t("bottling.remaining")}
            </p>
            <p className="text-lg font-semibold">
              {summary.remaining.toFixed(1)} L
            </p>
          </div>
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 size-4" />
          {t("bottling.add")}
        </Button>
      </div>

      {/* Table */}
      {bottlingItems.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          {t("bottling.empty")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("bottling.columns.product")}</TableHead>
              <TableHead>{t("bottling.columns.quantity")}</TableHead>
              <TableHead>{t("bottling.columns.volume")}</TableHead>
              <TableHead>{t("bottling.columns.date")}</TableHead>
              <TableHead>{t("bottling.columns.notes")}</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bottlingItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {item.itemName ?? "-"}
                  {item.itemCode && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({item.itemCode})
                    </span>
                  )}
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>
                  {item.baseUnits ? `${item.baseUnits} L` : "-"}
                </TableCell>
                <TableCell>{formatDate(item.bottledAt)}</TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {item.notes ?? "-"}
                </TableCell>
                <TableCell>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      void handleDelete(item.id);
                    }}
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bottling.addTitle")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("bottling.columns.product")}</Label>
              <Select
                value={formData.itemId}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, itemId: val }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t("bottling.selectProduct")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {productOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t("bottling.columns.quantity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: e.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t("bottling.columns.date")}</Label>
                <Input
                  type="date"
                  value={formData.bottledAt}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      bottledAt: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t("bottling.columns.notes")}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("bottling.cancel")}
            </Button>
            <Button
              disabled={!formData.itemId || !formData.quantity || isSubmitting}
              onClick={() => {
                void handleAdd();
              }}
            >
              {t("bottling.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
