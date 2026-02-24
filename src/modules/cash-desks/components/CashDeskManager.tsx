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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

import {
  getCashDesks,
  createCashDesk,
  updateCashDesk,
  deleteCashDesk,
  getShopOptions,
} from "../actions";
import type { CashDesk, CreateCashDeskInput, UpdateCashDeskInput } from "../types";

interface ShopOption {
  value: string;
  label: string;
}

interface DialogFormValues {
  name: string;
  shopId: string;
  isActive: boolean;
}

const EMPTY_FORM: DialogFormValues = {
  name: "",
  shopId: "",
  isActive: true,
};

export function CashDeskManager(): React.ReactNode {
  const t = useTranslations("cashDesks");
  const [items, setItems] = useState<CashDesk[]>([]);
  const [shopOptions, setShopOptions] = useState<ShopOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CashDesk | null>(null);
  const [formValues, setFormValues] = useState<DialogFormValues>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CashDesk | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [desks, shops] = await Promise.all([
        getCashDesks(),
        getShopOptions(),
      ]);
      setItems(desks);
      setShopOptions(shops);
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

  const handleEdit = useCallback((desk: CashDesk): void => {
    setEditingItem(desk);
    setFormValues({
      name: desk.name,
      shopId: desk.shopId,
      isActive: desk.isActive,
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

    if (!formValues.shopId) {
      toast.error(t("messages.shopRequired"));
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        const updateData: UpdateCashDeskInput = {
          name: formValues.name,
          shopId: formValues.shopId,
          isActive: formValues.isActive,
        };
        const result = await updateCashDesk(editingItem.id, updateData);
        if ("error" in result) {
          toast.error(t("messages.saveFailed"));
          return;
        }
      } else {
        const createData: CreateCashDeskInput = {
          name: formValues.name,
          shopId: formValues.shopId,
        };
        const result = await createCashDesk(createData);
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
    async (desk: CashDesk, checked: boolean): Promise<void> => {
      const result = await updateCashDesk(desk.id, { isActive: checked });
      if ("error" in result) {
        toast.error(t("messages.saveFailed"));
        return;
      }
      toast.success(t("messages.saved"));
      await load();
    },
    [load, t]
  );

  const handleDeleteConfirm = useCallback(async (): Promise<void> => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteCashDesk(deleteTarget.id);
      if ("error" in result) {
        toast.error(t("messages.deleteFailed"));
        return;
      }
      if ("deactivated" in result) {
        toast.info(t("messages.deactivated"));
      } else {
        toast.success(t("messages.deleted"));
      }
      await load();
    } catch {
      toast.error(t("messages.deleteFailed"));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, load, t]);

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
            <TableHead>{t("columns.shop")}</TableHead>
            <TableHead>{t("columns.balance")}</TableHead>
            <TableHead>{t("columns.active")}</TableHead>
            <TableHead>{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((desk) => (
            <TableRow key={desk.id}>
              <TableCell className="font-medium">{desk.name}</TableCell>
              <TableCell>{desk.shopName ?? "-"}</TableCell>
              <TableCell>
                {Number(desk.currentBalance).toLocaleString("cs-CZ")} Kč
              </TableCell>
              <TableCell>
                <Badge variant={desk.isActive ? "default" : "secondary"}>
                  {desk.isActive
                    ? t("status.active")
                    : t("status.inactive")}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(desk)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    {t("actions.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(desk)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {t("actions.delete")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
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
              <Label className="text-right">{t("dialog.shop")}</Label>
              <div className="col-span-3">
                <Select
                  value={formValues.shopId}
                  onValueChange={(value) =>
                    setFormValues((prev) => ({
                      ...prev,
                      shopId: value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("dialog.shopPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {shopOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("dialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
