"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

import {
  addBatchMeasurement,
  updateBatchMeasurement,
  deleteBatchMeasurement,
} from "../actions";
import type { BatchMeasurement } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a Date to datetime-local input value (YYYY-MM-DDTHH:mm). */
function toDatetimeLocal(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const MEASUREMENT_TYPES = [
  "gravity",
  "temperature",
  "ph",
  "volume",
  "pressure",
];

/** Parse a decimal string, accepting both "." and "," as separator. */
function parseDecimalInput(input: string): number {
  return parseFloat(input.replace(",", "."));
}

/** Normalize decimal input for DB storage: replace "," with ".". */
function normalizeDecimal(input: string): string {
  return input.replace(",", ".");
}

/**
 * Convert Plato to Specific Gravity.
 * Formula: SG = 1 + (plato / (258.6 - 0.8796 * plato))
 */
function platoToSg(plato: number): number {
  return 1 + plato / (258.6 - 0.8796 * plato);
}

/**
 * Convert Specific Gravity to Plato.
 * Polynomial approximation: plato = -668.962 + 1262.45·SG - 776.43·SG² + 182.94·SG³
 */
function sgToPlato(sg: number): number {
  return -668.962 + 1262.45 * sg - 776.43 * sg * sg + 182.94 * sg * sg * sg;
}

// ── Component ──────────────────────────────────────────────────

interface BatchMeasurementsTabProps {
  batchId: string;
  measurements: BatchMeasurement[];
  onMutate: () => void;
}

export function BatchMeasurementsTab({
  batchId,
  measurements,
  onMutate,
}: BatchMeasurementsTabProps): React.ReactNode {
  const t = useTranslations("batches");
  const tCommon = useTranslations("common");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Get current datetime in datetime-local format (YYYY-MM-DDTHH:mm). */
  const getCurrentDateTime = useCallback((): string => {
    return toDatetimeLocal(new Date());
  }, []);

  const [formData, setFormData] = useState({
    measurementType: "gravity",
    value: "",
    valuePlato: "",
    valueSg: "",
    temperatureC: "",
    notes: "",
    measuredAt: "",
  });

  const isGravity = formData.measurementType === "gravity";

  const resetForm = useCallback((): void => {
    setFormData({
      measurementType: "gravity",
      value: "",
      valuePlato: "",
      valueSg: "",
      temperatureC: "",
      notes: "",
      measuredAt: getCurrentDateTime(),
    });
  }, [getCurrentDateTime]);

  // ── Open dialog handlers ──────────────────────────────────

  const openAddDialog = useCallback((): void => {
    setDialogMode("add");
    setEditingId(null);
    resetForm();
    setDialogOpen(true);
  }, [resetForm]);

  const openEditDialog = useCallback((m: BatchMeasurement): void => {
    setDialogMode("edit");
    setEditingId(m.id);
    setFormData({
      measurementType: m.measurementType,
      value: m.value ?? "",
      valuePlato: m.valuePlato ?? "",
      valueSg: m.valueSg ?? "",
      temperatureC: m.temperatureC ?? "",
      notes: m.notes ?? "",
      measuredAt: m.measuredAt ? toDatetimeLocal(m.measuredAt) : "",
    });
    setDialogOpen(true);
  }, []);

  // ── Plato ↔ SG linked handlers ────────────────────────────

  const handlePlatoChange = useCallback((rawValue: string): void => {
    setFormData((prev) => {
      const next = { ...prev, valuePlato: rawValue };
      const plato = parseDecimalInput(rawValue);
      if (!isNaN(plato) && plato >= 0 && plato <= 40) {
        next.valueSg = platoToSg(plato).toFixed(4);
      } else if (rawValue.trim() === "") {
        next.valueSg = "";
      }
      return next;
    });
  }, []);

  const handleSgChange = useCallback((rawValue: string): void => {
    setFormData((prev) => {
      const next = { ...prev, valueSg: rawValue };
      const sg = parseDecimalInput(rawValue);
      if (!isNaN(sg) && sg >= 0.99 && sg <= 1.2) {
        next.valuePlato = sgToPlato(sg).toFixed(1);
      } else if (rawValue.trim() === "") {
        next.valuePlato = "";
      }
      return next;
    });
  }, []);

  // ── Save handlers ─────────────────────────────────────────

  const buildPayload = useCallback((): {
    measurementType: string;
    value: string | null;
    valuePlato: string | null;
    valueSg: string | null;
    temperatureC: string | null;
    isStart: boolean;
    isEnd: boolean;
    notes: string | null;
    measuredAt: string | undefined;
  } | null => {
    const g = formData.measurementType === "gravity";
    let hasValue: boolean;
    if (g) {
      hasValue = !!(formData.valuePlato.trim() || formData.valueSg.trim());
    } else {
      hasValue = !!formData.value.trim();
    }
    if (!hasValue) return null;

    return {
      measurementType: formData.measurementType,
      value: g ? null : normalizeDecimal(formData.value.trim()) || null,
      valuePlato: normalizeDecimal(formData.valuePlato.trim()) || null,
      valueSg: normalizeDecimal(formData.valueSg.trim()) || null,
      temperatureC: normalizeDecimal(formData.temperatureC.trim()) || null,
      isStart: false,
      isEnd: false,
      notes: formData.notes.trim() || null,
      measuredAt: formData.measuredAt || undefined,
    };
  }, [formData]);

  const handleAdd = useCallback(async (): Promise<void> => {
    const payload = buildPayload();
    if (!payload) {
      toast.error(t("measurements.addError"));
      return;
    }

    setIsSubmitting(true);
    try {
      await addBatchMeasurement(batchId, payload);
      toast.success(t("measurements.added"));
      setDialogOpen(false);
      resetForm();
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to add measurement:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`${t("measurements.addError")}: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [batchId, buildPayload, onMutate, resetForm, t]);

  const handleEdit = useCallback(async (): Promise<void> => {
    if (!editingId) return;
    const payload = buildPayload();
    if (!payload) {
      toast.error(t("measurements.editError"));
      return;
    }

    setIsSubmitting(true);
    try {
      await updateBatchMeasurement(editingId, payload);
      toast.success(t("measurements.edited"));
      setDialogOpen(false);
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to update measurement:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`${t("measurements.editError")}: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingId, buildPayload, onMutate, t]);

  const handleDialogSave = useCallback((): void => {
    if (dialogMode === "edit") {
      void handleEdit();
    } else {
      void handleAdd();
    }
  }, [dialogMode, handleAdd, handleEdit]);

  const handleDelete = useCallback(
    async (measurementId: string): Promise<void> => {
      try {
        await deleteBatchMeasurement(measurementId);
        toast.success(t("measurements.deleted"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to delete measurement:", error);
        toast.error(t("measurements.deleteError"));
      }
    },
    [onMutate, t]
  );

  // Prepare chart data — gravity (Plato) over time
  const chartData = useMemo(() => {
    return measurements
      .filter((m) => m.valuePlato !== null && m.measuredAt !== null)
      .map((m) => ({
        date: m.measuredAt
          ? new Date(m.measuredAt).toLocaleDateString("cs-CZ", {
              day: "2-digit",
              month: "2-digit",
            })
          : "",
        plato: m.valuePlato ? parseFloat(m.valuePlato) : 0,
      }));
  }, [measurements]);

  return (
    <div className="flex flex-col gap-6">
      {/* Gravity chart */}
      {chartData.length > 1 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-medium">
            {t("measurements.chart.title")}
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} unit=" °P" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="plato"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
                name={t("measurements.chart.plato")}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end">
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="mr-1 size-4" />
          {t("measurements.add")}
        </Button>
      </div>

      {/* Measurements table */}
      {measurements.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          {t("measurements.empty")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("measurements.columns.type")}</TableHead>
              <TableHead>{t("measurements.columns.value")}</TableHead>
              <TableHead>{t("measurements.columns.plato")}</TableHead>
              <TableHead>{t("measurements.columns.sg")}</TableHead>
              <TableHead>{t("measurements.columns.temperature")}</TableHead>
              <TableHead>{t("measurements.columns.date")}</TableHead>
              <TableHead>{t("measurements.columns.notes")}</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {measurements.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Badge variant="outline">
                    {t(`measurements.type.${m.measurementType}` as Parameters<typeof t>[0])}
                  </Badge>
                </TableCell>
                <TableCell>{m.value ?? "-"}</TableCell>
                <TableCell>
                  {m.valuePlato ? `${m.valuePlato} °P` : "-"}
                </TableCell>
                <TableCell>{m.valueSg ?? "-"}</TableCell>
                <TableCell>
                  {m.temperatureC ? `${m.temperatureC} °C` : "-"}
                </TableCell>
                <TableCell>{formatDate(m.measuredAt)}</TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {m.notes ?? "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => openEditDialog(m)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{tCommon("confirmDelete")}</AlertDialogTitle>
                          <AlertDialogDescription>{tCommon("confirmDeleteDescription")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              void handleDelete(m.id);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {tCommon("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add / Edit measurement dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit"
                ? t("measurements.dialog.editTitle")
                : t("measurements.addTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Measurement type */}
            <div className="flex flex-col gap-2">
              <Label>{t("measurements.columns.type")}</Label>
              <Select
                value={formData.measurementType}
                onValueChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    measurementType: val,
                    value: "",
                    valuePlato: "",
                    valueSg: "",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`measurements.type.${type}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Gravity-specific: Plato + SG (linked) */}
            {isGravity ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t("measurements.columns.plato")}</Label>
                  <Input
                    inputMode="decimal"
                    value={formData.valuePlato}
                    onChange={(e) => handlePlatoChange(e.target.value)}
                    placeholder="12,5"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("measurements.columns.sg")}</Label>
                  <Input
                    inputMode="decimal"
                    value={formData.valueSg}
                    onChange={(e) => handleSgChange(e.target.value)}
                    placeholder="1,050"
                  />
                </div>
              </div>
            ) : (
              /* Non-gravity: generic Value field */
              <div className="flex flex-col gap-2">
                <Label>{t("measurements.columns.value")}</Label>
                <Input
                  inputMode="decimal"
                  value={formData.value}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, value: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            )}

            {/* Temperature — always visible */}
            <div className="flex flex-col gap-2">
              <Label>{t("measurements.columns.temperature")}</Label>
              <Input
                inputMode="decimal"
                value={formData.temperatureC}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    temperatureC: e.target.value,
                  }))
                }
                placeholder="°C"
              />
            </div>

            {/* Date */}
            <div className="flex flex-col gap-2">
              <Label>{t("measurements.columns.date")}</Label>
              <Input
                type="datetime-local"
                value={formData.measuredAt}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    measuredAt: e.target.value,
                  }))
                }
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <Label>{t("measurements.columns.notes")}</Label>
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
              {t("measurements.cancel")}
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={handleDialogSave}
            >
              {t("measurements.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
