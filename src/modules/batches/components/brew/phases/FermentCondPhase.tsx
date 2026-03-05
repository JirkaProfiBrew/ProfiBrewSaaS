"use client";

import { useState, useEffect, useTransition, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowRight, ArrowLeft, Check } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

import type { Batch, BatchMeasurement, BatchPhase, RecipeIngredient } from "../../../types";
import {
  getBatchBrewData,
  addBatchMeasurement,
  updateBatchMeasurement,
  deleteBatchMeasurement,
  advanceBatchPhase,
  rollbackBatchPhase,
  getRecipeIngredients,
  recordIngredientAddition,
} from "../../../actions";
import { getEquipmentById } from "@/modules/equipment/actions";

// ── Helpers ────────────────────────────────────────────────────

const MEASUREMENT_TYPES = [
  "gravity",
  "temperature",
  "ph",
  "volume",
  "pressure",
] as const;

/** Parse a decimal string, accepting both "." and "," as separator. */
function parseDecimalInput(input: string): number {
  return parseFloat(input.replace(",", "."));
}

/** Normalize decimal input for DB storage: replace "," with ".". */
function normalizeDecimal(input: string): string {
  return input.replace(",", ".");
}

/** Convert Plato to Specific Gravity. */
function platoToSg(plato: number): number {
  return 1 + plato / (258.6 - 0.8796 * plato);
}

/** Convert Specific Gravity to Plato (polynomial approximation). */
function sgToPlato(sg: number): number {
  return -668.962 + 1262.45 * sg - 776.43 * sg * sg + 182.94 * sg * sg * sg;
}

/** Calculate ABV from OG and current gravity (both in °Plato). */
function calcAbv(ogPlato: number, currentPlato: number): number {
  const ogSg = platoToSg(ogPlato);
  const fgSg = platoToSg(currentPlato);
  return (ogSg - fgSg) * 131.25;
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

interface FormData {
  measurementType: string;
  value: string;
  valuePlato: string;
  valueSg: string;
  temperatureC: string;
  notes: string;
  measuredAt: string;
}

const EMPTY_FORM: FormData = {
  measurementType: "gravity",
  value: "",
  valuePlato: "",
  valueSg: "",
  temperatureC: "",
  notes: "",
  measuredAt: "",
};

// ── Component ──────────────────────────────────────────────────

interface FermentCondPhaseProps {
  batchId: string;
  phase: "fermentation" | "conditioning";
}

export function FermentCondPhase({ batchId, phase }: FermentCondPhaseProps): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const [isPending, startTransition] = useTransition();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [measurements, setMeasurements] = useState<BatchMeasurement[]>([]);
  const [vesselName, setVesselName] = useState<string | null>(null);
  const [vesselVolumeL, setVesselVolumeL] = useState<string | null>(null);
  const [yeastName, setYeastName] = useState<string | null>(null);
  const [phaseIngredients, setPhaseIngredients] = useState<RecipeIngredient[]>([]);
  const [loading, setLoading] = useState(true);

  // Ingredient addition dialog
  const [ingrDialogOpen, setIngrDialogOpen] = useState(false);
  const [ingrDialogItem, setIngrDialogItem] = useState<RecipeIngredient | null>(null);
  const [ingrAddedAt, setIngrAddedAt] = useState("");
  const [ingrNote, setIngrNote] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM });

  const isGravity = formData.measurementType === "gravity";

  // ── Load data ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const brewData = await getBatchBrewData(batchId);
      if (cancelled || !brewData) return;

      setBatch(brewData.batch);
      const phaseMeasurements = brewData.measurements.filter(
        (m) => m.phase === phase
      );
      setMeasurements(phaseMeasurements);

      const vesselId =
        phase === "fermentation"
          ? brewData.batch.equipmentId
          : brewData.batch.conditioningEquipmentId;
      if (vesselId) {
        const eq = await getEquipmentById(vesselId);
        if (!cancelled && eq) {
          setVesselName(eq.name);
          setVesselVolumeL(eq.volumeL);
        }
      }

      if (brewData.batch.recipeId) {
        const ingr = await getRecipeIngredients(brewData.batch.recipeId);
        if (!cancelled) {
          const yeast = ingr.find((i) => i.category === "yeast");
          setYeastName(yeast?.itemName ?? null);
          // Filter ingredients for this phase
          const stagesForPhase = phase === "fermentation"
            ? ["fermentation", "dry_hop", "dry_hop_cold", "dry_hop_warm"]
            : ["conditioning"];
          setPhaseIngredients(ingr.filter((i) => stagesForPhase.includes(i.useStage ?? "")));
        }
      }

      if (!cancelled) setLoading(false);
    }
    load();
    return (): void => {
      cancelled = true;
    };
  }, [batchId, phase]);

  // ── Phase config ───────────────────────────────────────────

  const startDateStr =
    phase === "fermentation"
      ? batch?.fermentationStart
      : batch?.conditioningStart;
  const plannedDays =
    phase === "fermentation"
      ? (batch?.fermentationDays ?? 14)
      : (batch?.conditioningDays ?? 21);
  const nextPhase: BatchPhase =
    phase === "fermentation" ? "conditioning" : "packaging";
  const nextPhaseRoute = phase === "fermentation" ? "cond" : "pack";

  const startDate = startDateStr ? new Date(startDateStr) : null;
  const now = new Date();
  const currentDay = startDate
    ? Math.max(
        0,
        Math.ceil(
          (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;
  const progress =
    plannedDays > 0 ? Math.min((currentDay / plannedDays) * 100, 100) : 0;
  const isOverdue = currentDay > plannedDays;

  const plannedEnd = startDate
    ? new Date(startDate.getTime() + plannedDays * 24 * 60 * 60 * 1000)
    : null;

  const isActive = batch?.currentPhase === phase;

  // ── OG for ABV calculation ──────────────────────────────────

  const ogPlato = batch?.ogActual
    ? parseFloat(batch.ogActual)
    : batch?.recipeOg
      ? parseFloat(batch.recipeOg)
      : null;

  // ── Chart data ─────────────────────────────────────────────

  const chartData = useMemo(() => {
    return measurements
      .filter(
        (m) => m.measuredAt !== null && (m.valuePlato !== null || m.temperatureC !== null)
      )
      .sort((a, b) => {
        const ta = a.measuredAt ? new Date(a.measuredAt).getTime() : 0;
        const tb = b.measuredAt ? new Date(b.measuredAt).getTime() : 0;
        return ta - tb;
      })
      .map((m) => ({
        date: m.measuredAt
          ? new Date(m.measuredAt).toLocaleDateString("cs-CZ", {
              day: "2-digit",
              month: "2-digit",
            })
          : "",
        plato: m.valuePlato ? parseFloat(m.valuePlato) : undefined,
        temp: m.temperatureC ? parseFloat(m.temperatureC) : undefined,
      }));
  }, [measurements]);

  const hasPlato = chartData.some((d) => d.plato !== undefined);
  const hasTemp = chartData.some((d) => d.temp !== undefined);

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

  // ── Dialog handlers ────────────────────────────────────────

  const openAddDialog = useCallback((): void => {
    setEditingId(null);
    setFormData({
      ...EMPTY_FORM,
      measuredAt: toDatetimeLocal(new Date()),
    });
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((m: BatchMeasurement): void => {
    setEditingId(m.id);
    setFormData({
      measurementType: m.measurementType,
      value: m.value ?? "",
      valuePlato: m.valuePlato ?? "",
      valueSg: m.valueSg ?? "",
      temperatureC: m.temperatureC ?? "",
      notes: m.notes ?? "",
      measuredAt: m.measuredAt ? toDatetimeLocal(new Date(m.measuredAt)) : "",
    });
    setDialogOpen(true);
  }, []);

  // ── Save / Delete / Advance ────────────────────────────────

  function handleSaveMeasurement(): void {
    const g = formData.measurementType === "gravity";
    let hasValue: boolean;
    if (g) {
      hasValue = !!(formData.valuePlato.trim() || formData.valueSg.trim());
    } else {
      hasValue = !!formData.value.trim();
    }
    // Allow saving with just temperature
    if (!hasValue && !formData.temperatureC.trim()) {
      toast.error(t("measurements.addError"));
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          measurementType: formData.measurementType,
          value: g ? null : normalizeDecimal(formData.value.trim()) || null,
          valuePlato: normalizeDecimal(formData.valuePlato.trim()) || null,
          valueSg: normalizeDecimal(formData.valueSg.trim()) || null,
          temperatureC: normalizeDecimal(formData.temperatureC.trim()) || null,
          isStart: false,
          isEnd: false,
          phase: phase,
          notes: formData.notes.trim() || null,
          measuredAt: formData.measuredAt || undefined,
        };

        if (editingId) {
          await updateBatchMeasurement(editingId, payload);
          toast.success(t("measurements.edited"));
        } else {
          await addBatchMeasurement(batchId, payload);
          toast.success(t("measurements.added"));
        }
        setDialogOpen(false);
        // Reload measurements
        const brewData = await getBatchBrewData(batchId);
        if (brewData) {
          setMeasurements(
            brewData.measurements.filter(
              (m) => m.phase === phase
            )
          );
        }
      } catch {
        toast.error(t("brew.fermentation.measurementError"));
      }
    });
  }

  function handleDeleteMeasurement(id: string): void {
    startTransition(async () => {
      try {
        await deleteBatchMeasurement(id);
        toast.success(t("measurements.deleted"));
        setMeasurements((prev) => prev.filter((m) => m.id !== id));
      } catch {
        toast.error(t("brew.fermentation.measurementError"));
      }
    });
  }

  function handleAdvancePhase(): void {
    startTransition(async () => {
      try {
        await advanceBatchPhase(batchId, nextPhase);
        toast.success(t("brew.phaseAdvanced"));
        router.push(
          `/${locale}/brewery/batches/${batchId}/brew/${nextPhaseRoute}`
        );
        router.refresh();
      } catch {
        toast.error(t("brew.fermentation.measurementError"));
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }
  if (!batch) return null;

  const formatDateDisplay = (d: Date): string =>
    d.toLocaleDateString(locale === "cs" ? "cs-CZ" : "en-US");
  const formatDateTime = (d: Date): string =>
    d.toLocaleString(locale === "cs" ? "cs-CZ" : "en-US", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-6">
      {/* Header Card — vessel, yeast, progress */}
      <Card>
        <CardContent className="pt-6">
          {phase === "fermentation" && isActive && (
            <div className="mb-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <ArrowLeft className="size-3.5 mr-1.5" />
                    {t("brew.fermentation.backToBrewing")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("brew.fermentation.backToBrewingTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-destructive font-semibold">
                      {t("brew.fermentation.backToBrewingWarning")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isPending}
                      onClick={async (): Promise<void> => {
                        startTransition(async () => {
                          try {
                            await rollbackBatchPhase(batchId, "brewing");
                            router.push(`/${locale}/brewery/batches/${batchId}/brew/brewing`);
                          } catch {
                            toast.error("Error");
                          }
                        });
                      }}
                    >
                      {t("brew.fermentation.backToBrewingConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          {phase === "conditioning" && isActive && (
            <div className="mb-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <ArrowLeft className="size-3.5 mr-1.5" />
                    {t("brew.fermentation.backToFermentation")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("brew.fermentation.backToFermentationTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-destructive font-semibold">
                      {t("brew.fermentation.backToFermentationWarning")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isPending}
                      onClick={async (): Promise<void> => {
                        startTransition(async () => {
                          try {
                            await rollbackBatchPhase(batchId, "fermentation");
                            router.push(`/${locale}/brewery/batches/${batchId}/brew/ferm`);
                          } catch {
                            toast.error("Error");
                          }
                        });
                      }}
                    >
                      {t("brew.fermentation.backToFermentationConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">
                  {t("brew.fermentation.vessel")}:
                </span>
                <span className="font-medium">
                  {vesselName
                    ? `${vesselName}${vesselVolumeL ? ` (${Number(vesselVolumeL).toFixed(0)} L)` : ""}`
                    : t("brew.fermentation.noVessel")}
                </span>
              </div>
              {phase === "fermentation" && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">
                    {t("brew.fermentation.yeast")}:
                  </span>
                  <span className="font-medium">
                    {yeastName ?? t("brew.fermentation.noYeast")}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-muted-foreground">
                  {t("brew.fermentation.started")}:
                </span>
                <span>{startDate ? formatDateDisplay(startDate) : "\u2014"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">
                  {t("brew.fermentation.plannedEnd")}:
                </span>
                <span>{plannedEnd ? formatDateDisplay(plannedEnd) : "\u2014"}</span>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium">
                  {t("brew.fermentation.day")} {currentDay}{" "}
                  {t("brew.fermentation.of")} {plannedDays}
                </span>
                {isOverdue && (
                  <Badge variant="destructive">
                    {t("brew.fermentation.overdue")}
                  </Badge>
                )}
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isOverdue ? "bg-destructive" : "bg-primary"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase ingredients */}
      {phaseIngredients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("brew.fermentation.ingredients")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("brew.fermentation.ingredientName")}</TableHead>
                  <TableHead className="text-right">{t("brew.fermentation.ingredientAmount")}</TableHead>
                  <TableHead>{t("brew.fermentation.ingredientNotes")}</TableHead>
                  <TableHead>{t("brew.fermentation.ingredientStatus")}</TableHead>
                  {isActive && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {phaseIngredients.map((ingr) => {
                  const addition = batch?.ingredientAdditions?.[ingr.id];
                  const amountNum = Number(ingr.amountG);
                  const displayAmount = ingr.unitSymbol
                    ? `${amountNum} ${ingr.unitSymbol}`
                    : amountNum >= 1000
                      ? `${(amountNum / 1000).toFixed(1)} kg`
                      : `${amountNum} g`;
                  return (
                    <TableRow key={ingr.id}>
                      <TableCell className="font-medium">{ingr.itemName}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{displayAmount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ingr.notes ?? "—"}</TableCell>
                      <TableCell>
                        {addition ? (
                          <div className="text-sm">
                            <Badge variant="default" className="bg-green-600">
                              <Check className="size-3 mr-1" />
                              {t("brew.fermentation.ingredientAdded")}
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatDateDisplay(new Date(addition.addedAt))}
                              {addition.notes && ` — ${addition.notes}`}
                            </div>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            {t("brew.fermentation.ingredientNotAdded")}
                          </Badge>
                        )}
                      </TableCell>
                      {isActive && (
                        <TableCell>
                          {!addition && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(): void => {
                                setIngrDialogItem(ingr);
                                setIngrAddedAt(toDatetimeLocal(new Date()));
                                setIngrNote("");
                                setIngrDialogOpen(true);
                              }}
                            >
                              {t("brew.fermentation.ingredientMarkAdded")}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Ingredient addition dialog */}
      <Dialog open={ingrDialogOpen} onOpenChange={setIngrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("brew.fermentation.ingredientMarkAdded")}
              {ingrDialogItem && ` — ${ingrDialogItem.itemName}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("brew.fermentation.ingredientAddedAt")}</Label>
              <Input
                type="datetime-local"
                value={ingrAddedAt}
                onChange={(e): void => setIngrAddedAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("brew.fermentation.ingredientAddNote")}</Label>
              <Input
                value={ingrNote}
                onChange={(e): void => setIngrNote(e.target.value)}
                placeholder=""
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={isPending || !ingrAddedAt}
              onClick={(): void => {
                if (!ingrDialogItem || !batch) return;
                startTransition(async () => {
                  try {
                    await recordIngredientAddition(
                      batchId,
                      ingrDialogItem.id,
                      new Date(ingrAddedAt).toISOString(),
                      ingrNote
                    );
                    // Update local state
                    setBatch({
                      ...batch,
                      ingredientAdditions: {
                        ...batch.ingredientAdditions,
                        [ingrDialogItem.id]: {
                          addedAt: new Date(ingrAddedAt).toISOString(),
                          notes: ingrNote,
                        },
                      },
                    });
                    setIngrDialogOpen(false);
                    toast.success(t("brew.fermentation.ingredientRecorded"));
                  } catch {
                    toast.error("Error");
                  }
                });
              }}
            >
              {t("brew.fermentation.ingredientConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gravity + temperature chart */}
      {chartData.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-sm font-medium">
              {t("measurements.chart.title")}
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                {hasPlato && (
                  <YAxis
                    yAxisId="plato"
                    fontSize={12}
                    unit=" °P"
                  />
                )}
                {hasTemp && (
                  <YAxis
                    yAxisId="temp"
                    orientation="right"
                    fontSize={12}
                    unit=" °C"
                  />
                )}
                <Tooltip />
                {hasPlato && (
                  <Line
                    yAxisId="plato"
                    type="monotone"
                    dataKey="plato"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name={t("measurements.chart.plato")}
                    connectNulls
                  />
                )}
                {hasTemp && (
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                    name={t("measurements.columns.temperature")}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Measurements Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("brew.fermentation.addMeasurementTitle")}</CardTitle>
          {isActive && (
            <Button variant="outline" size="sm" onClick={openAddDialog}>
              <Plus className="mr-2 size-4" />
              {t("brew.fermentation.addMeasurement")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {t("brew.fermentation.noMeasurements")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("brew.fermentation.dateTime")}</TableHead>
                  <TableHead className="text-right">
                    {t("measurements.columns.plato")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("measurements.columns.sg")}
                  </TableHead>
                  <TableHead className="text-right">ABV</TableHead>
                  <TableHead className="text-right">
                    {t("measurements.columns.temperature")}
                  </TableHead>
                  <TableHead>{t("brew.fermentation.notes")}</TableHead>
                  {isActive && (
                    <TableHead className="w-20">
                      {t("brew.fermentation.actions")}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {measurements.map((m) => {
                  const mPlato = m.valuePlato ? parseFloat(m.valuePlato) : null;
                  const abv =
                    ogPlato !== null && mPlato !== null
                      ? calcAbv(ogPlato, mPlato)
                      : null;
                  const isOgRow = m.notes === "OG";
                  return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {m.measuredAt
                        ? formatDateTime(new Date(m.measuredAt))
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {m.valuePlato
                        ? `${Number(m.valuePlato).toFixed(1)} °P`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {m.valueSg
                        ? Number(m.valueSg).toFixed(4)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {abv !== null
                        ? `${abv.toFixed(1)} %`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {m.temperatureC
                        ? `${Number(m.temperatureC).toFixed(1)} °C`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {m.notes ?? ""}
                    </TableCell>
                    {isActive && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => openEditDialog(m)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          {!isOgRow && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("brew.fermentation.deleteConfirm")}
                                </AlertDialogTitle>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("actions.cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    handleDeleteMeasurement(m.id)
                                  }
                                >
                                  {t("actions.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Measurement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("measurements.dialog.editTitle")
                : t("measurements.dialog.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Measurement type — fixed to gravity for MVP */}
            <div className="flex flex-col gap-2">
              <Label>{t("measurements.columns.type")}</Label>
              <Select value={formData.measurementType} disabled>
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
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleSaveMeasurement} disabled={isPending}>
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase Transition Button */}
      {isActive && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" disabled={isPending}>
                {phase === "fermentation"
                  ? t("brew.fermentation.moveToConditioning")
                  : t("brew.fermentation.moveToPackaging")}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {phase === "fermentation"
                    ? t("brew.fermentation.confirmMoveTitle")
                    : t("brew.fermentation.confirmMoveCondTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {phase === "fermentation"
                    ? t("brew.fermentation.confirmMoveDesc")
                    : t("brew.fermentation.confirmMoveCondDesc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleAdvancePhase}>
                  {phase === "fermentation"
                    ? t("brew.fermentation.moveToConditioning")
                    : t("brew.fermentation.moveToPackaging")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
