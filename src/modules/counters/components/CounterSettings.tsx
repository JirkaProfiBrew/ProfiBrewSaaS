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

import { getCounters, updateCounter } from "../actions";
import { formatCounterPreview } from "../utils";
import type { Counter, CounterUpdate } from "../types";

export function CounterSettings(): React.ReactNode {
  const t = useTranslations("counters");
  const [items, setItems] = useState<Counter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<Counter | null>(null);
  const [editValues, setEditValues] = useState<CounterUpdate>({
    prefix: "",
    includeYear: true,
    padding: 3,
    separator: "-",
    resetYearly: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await getCounters();
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

  const handleEdit = useCallback((counter: Counter): void => {
    setEditingItem(counter);
    setEditValues({
      prefix: counter.prefix,
      includeYear: counter.includeYear,
      padding: counter.padding,
      separator: counter.separator,
      resetYearly: counter.resetYearly,
    });
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      await updateCounter(editingItem.id, editValues);
      setEditingItem(null);
      await load();
    } catch {
      // Error handling - toast would go here
    } finally {
      setIsSaving(false);
    }
  }, [editingItem, editValues, load]);

  const previewValue = editingItem
    ? formatCounterPreview({
        ...editingItem,
        ...editValues,
      })
    : "";

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.entity")}</TableHead>
            <TableHead>{t("columns.prefix")}</TableHead>
            <TableHead>{t("columns.includeYear")}</TableHead>
            <TableHead>{t("columns.currentNumber")}</TableHead>
            <TableHead>{t("columns.padding")}</TableHead>
            <TableHead>{t("columns.separator")}</TableHead>
            <TableHead>{t("columns.resetYearly")}</TableHead>
            <TableHead>{t("columns.preview")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((counter) => (
            <TableRow key={counter.id}>
              <TableCell>
                <Badge variant="outline">
                  {t(`entities.${counter.entity}`)}
                </Badge>
              </TableCell>
              <TableCell className="font-mono">{counter.prefix}</TableCell>
              <TableCell>
                {counter.includeYear ? t("yes") : t("no")}
              </TableCell>
              <TableCell>{counter.currentNumber}</TableCell>
              <TableCell>{counter.padding}</TableCell>
              <TableCell className="font-mono">
                {counter.separator || "—"}
              </TableCell>
              <TableCell>
                {counter.resetYearly ? t("yes") : t("no")}
              </TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {formatCounterPreview(counter)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(counter)}
                >
                  {t("edit")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {t("noCounters")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Edit Dialog */}
      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? t("editTitle", {
                    entity: t(`entities.${editingItem.entity}`),
                  })
                : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("columns.prefix")}</Label>
              <Input
                className="col-span-3 font-mono"
                value={editValues.prefix}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    prefix: e.target.value,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("columns.separator")}</Label>
              <Input
                className="col-span-3 font-mono"
                value={editValues.separator}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    separator: e.target.value,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("columns.padding")}</Label>
              <Input
                className="col-span-3"
                type="number"
                min={1}
                max={10}
                value={editValues.padding}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    padding: parseInt(e.target.value, 10) || 3,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                {t("columns.includeYear")}
              </Label>
              <Switch
                checked={editValues.includeYear}
                onCheckedChange={(checked) =>
                  setEditValues((prev) => ({
                    ...prev,
                    includeYear: checked,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                {t("columns.resetYearly")}
              </Label>
              <Switch
                checked={editValues.resetYearly}
                onCheckedChange={(checked) =>
                  setEditValues((prev) => ({
                    ...prev,
                    resetYearly: checked,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("columns.preview")}</Label>
              <div className="col-span-3 rounded-md border p-2 font-mono text-sm">
                {previewValue}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingItem(null)}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
