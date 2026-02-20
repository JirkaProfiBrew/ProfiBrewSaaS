"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

import {
  getDeposits,
  createDeposit,
  updateDeposit,
} from "../actions";
import type { Deposit, CreateDepositInput, UpdateDepositInput } from "../types";

interface DialogFormValues {
  name: string;
  depositAmount: string;
  isActive: boolean;
}

const EMPTY_FORM: DialogFormValues = {
  name: "",
  depositAmount: "",
  isActive: true,
};

export function DepositManager(): React.ReactNode {
  const t = useTranslations("deposits");
  const [items, setItems] = useState<Deposit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Deposit | null>(null);
  const [formValues, setFormValues] = useState<DialogFormValues>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await getDeposits();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = useCallback((): void => {
    setEditingItem(null);
    setFormValues(EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((deposit: Deposit): void => {
    setEditingItem(deposit);
    setFormValues({
      name: deposit.name,
      depositAmount: deposit.depositAmount,
      isActive: deposit.isActive,
    });
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback((): void => {
    setDialogOpen(false);
    setEditingItem(null);
    setFormValues(EMPTY_FORM);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!formValues.name.trim()) {
      toast.error(t("messages.nameRequired"));
      return;
    }

    if (!formValues.depositAmount || isNaN(Number(formValues.depositAmount))) {
      toast.error(t("messages.amountRequired"));
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        // Update existing
        const updateData: UpdateDepositInput = {
          name: formValues.name,
          depositAmount: formValues.depositAmount,
          isActive: formValues.isActive,
        };
        const result = await updateDeposit(editingItem.id, updateData);
        if ("error" in result) {
          toast.error(t("messages.saveFailed"));
          return;
        }
      } else {
        // Create new
        const createData: CreateDepositInput = {
          name: formValues.name,
          depositAmount: formValues.depositAmount,
        };
        const result = await createDeposit(createData);
        if ("error" in result) {
          toast.error(t("messages.saveFailed"));
          return;
        }
      }

      toast.success(t("messages.saved"));
      handleClose();
      await load();
    } catch {
      toast.error(t("messages.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [editingItem, formValues, handleClose, load, t]);

  const handleToggleActive = useCallback(
    async (deposit: Deposit, checked: boolean): Promise<void> => {
      const result = await updateDeposit(deposit.id, { isActive: checked });
      if ("error" in result) {
        toast.error(t("messages.saveFailed"));
        return;
      }
      toast.success(t("messages.saved"));
      await load();
    },
    [load, t]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {t("actions.add")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.name")}</TableHead>
            <TableHead>{t("columns.amount")}</TableHead>
            <TableHead>{t("columns.active")}</TableHead>
            <TableHead>{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((deposit) => (
            <TableRow key={deposit.id}>
              <TableCell className="font-medium">{deposit.name}</TableCell>
              <TableCell>
                {Number(deposit.depositAmount).toLocaleString("cs-CZ")} Kč
              </TableCell>
              <TableCell>
                <Badge variant={deposit.isActive ? "default" : "secondary"}>
                  {deposit.isActive
                    ? t("status.active")
                    : t("status.inactive")}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(deposit)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    {t("actions.edit")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-center text-muted-foreground"
              >
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t("dialog.editTitle") : t("dialog.createTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("dialog.name")}</Label>
              <Input
                className="col-span-3"
                placeholder={t("dialog.namePlaceholder")}
                value={formValues.name}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("dialog.amount")}</Label>
              <Input
                className="col-span-3"
                type="number"
                min={0}
                step="0.01"
                placeholder={t("dialog.amountPlaceholder")}
                value={formValues.depositAmount}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    depositAmount: e.target.value,
                  }))
                }
              />
            </div>

            {editingItem && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">{t("dialog.active")}</Label>
                <Switch
                  checked={formValues.isActive}
                  onCheckedChange={(checked) =>
                    setFormValues((prev) => ({
                      ...prev,
                      isActive: checked,
                    }))
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {t("dialog.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {t("dialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
