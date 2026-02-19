"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
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

import { addBatchMeasurement, deleteBatchMeasurement } from "../actions";
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

const MEASUREMENT_TYPES = [
  "gravity",
  "temperature",
  "ph",
  "volume",
  "pressure",
];

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    measurementType: "gravity",
    value: "",
    valuePlato: "",
    valueSg: "",
    temperatureC: "",
    notes: "",
    measuredAt: "",
  });

  const resetForm = useCallback((): void => {
    setFormData({
      measurementType: "gravity",
      value: "",
      valuePlato: "",
      valueSg: "",
      temperatureC: "",
      notes: "",
      measuredAt: "",
    });
  }, []);

  const handleAdd = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await addBatchMeasurement(batchId, {
        measurementType: formData.measurementType,
        value: formData.value || null,
        valuePlato: formData.valuePlato || null,
        valueSg: formData.valueSg || null,
        temperatureC: formData.temperatureC || null,
        isStart: false,
        isEnd: false,
        notes: formData.notes || null,
        measuredAt: formData.measuredAt || undefined,
      });
      toast.success(t("measurements.added"));
      setDialogOpen(false);
      resetForm();
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to add measurement:", error);
      toast.error(t("measurements.addError"));
    } finally {
      setIsSubmitting(false);
    }
  }, [batchId, formData, onMutate, resetForm, t]);

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
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
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
              <TableHead className="w-[60px]" />
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
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      void handleDelete(m.id);
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

      {/* Add measurement dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("measurements.addTitle")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("measurements.columns.type")}</Label>
              <Select
                value={formData.measurementType}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, measurementType: val }))
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

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t("measurements.columns.value")}</Label>
                <Input
                  value={formData.value}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, value: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t("measurements.columns.plato")}</Label>
                <Input
                  value={formData.valuePlato}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      valuePlato: e.target.value,
                    }))
                  }
                  placeholder="°P"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t("measurements.columns.sg")}</Label>
                <Input
                  value={formData.valueSg}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      valueSg: e.target.value,
                    }))
                  }
                  placeholder="SG"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t("measurements.columns.temperature")}</Label>
                <Input
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
            </div>

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
              onClick={() => {
                void handleAdd();
              }}
            >
              {t("measurements.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
