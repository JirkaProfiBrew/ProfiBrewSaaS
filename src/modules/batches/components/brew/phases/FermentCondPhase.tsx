"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { Batch, BatchMeasurement, BatchPhase } from "../../../types";
import {
  getBatchBrewData,
  addBatchMeasurement,
  updateBatchMeasurement,
  deleteBatchMeasurement,
  advanceBatchPhase,
  getRecipeIngredients,
} from "../../../actions";
import { getEquipmentById } from "@/modules/equipment/actions";

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
  const [loading, setLoading] = useState(true);

  // Measurement dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mDate, setMDate] = useState("");
  const [mTemp, setMTemp] = useState("");
  const [mGravity, setMGravity] = useState("");
  const [mNotes, setMNotes] = useState("");

  // Load data
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const brewData = await getBatchBrewData(batchId);
      if (cancelled || !brewData) return;

      setBatch(brewData.batch);
      // Filter measurements for this phase
      const phaseMeasurements = brewData.measurements.filter(
        (m) =>
          m.phase === phase ||
          (m.phase == null && m.measurementType === "gravity")
      );
      setMeasurements(phaseMeasurements);

      // Load vessel name
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

      // Load yeast name from recipe ingredients
      if (brewData.batch.recipeId) {
        const ingr = await getRecipeIngredients(brewData.batch.recipeId);
        if (!cancelled) {
          const yeast = ingr.find((i) => i.category === "yeast");
          setYeastName(yeast?.itemName ?? null);
        }
      }

      if (!cancelled) setLoading(false);
    }
    load();
    return (): void => {
      cancelled = true;
    };
  }, [batchId, phase]);

  // Phase-specific config
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

  // Calculate progress
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

  // Open dialog for add
  function openAddDialog(): void {
    setEditingId(null);
    const now2 = new Date();
    setMDate(now2.toISOString().slice(0, 16));
    setMTemp("");
    setMGravity("");
    setMNotes("");
    setDialogOpen(true);
  }

  // Open dialog for edit
  function openEditDialog(m: BatchMeasurement): void {
    setEditingId(m.id);
    setMDate(
      m.measuredAt
        ? new Date(m.measuredAt).toISOString().slice(0, 16)
        : ""
    );
    setMTemp(m.temperatureC ?? "");
    setMGravity(m.valuePlato ?? m.value ?? "");
    setMNotes(m.notes ?? "");
    setDialogOpen(true);
  }

  // Save measurement
  function handleSaveMeasurement(): void {
    startTransition(async () => {
      try {
        if (editingId) {
          await updateBatchMeasurement(editingId, {
            temperatureC: mTemp || null,
            valuePlato: mGravity || null,
            notes: mNotes || null,
            measuredAt: mDate || undefined,
          });
          toast.success(t("brew.fermentation.measurementUpdated"));
        } else {
          await addBatchMeasurement(batchId, {
            measurementType: "gravity",
            temperatureC: mTemp || null,
            valuePlato: mGravity || null,
            isStart: false,
            isEnd: false,
            phase: phase,
            notes: mNotes || null,
            measuredAt: mDate || undefined,
          });
          toast.success(t("brew.fermentation.measurementAdded"));
        }
        setDialogOpen(false);
        // Reload measurements
        const brewData = await getBatchBrewData(batchId);
        if (brewData) {
          setMeasurements(
            brewData.measurements.filter(
              (m) =>
                m.phase === phase ||
                (m.phase == null && m.measurementType === "gravity")
            )
          );
        }
      } catch {
        toast.error(t("brew.fermentation.measurementError"));
      }
    });
  }

  // Delete measurement
  function handleDeleteMeasurement(id: string): void {
    startTransition(async () => {
      try {
        await deleteBatchMeasurement(id);
        toast.success(t("brew.fermentation.measurementDeleted"));
        setMeasurements((prev) => prev.filter((m) => m.id !== id));
      } catch {
        toast.error(t("brew.fermentation.measurementError"));
      }
    });
  }

  // Advance phase
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

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }
  if (!batch) return null;

  const formatDate = (d: Date): string =>
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
                <span>{startDate ? formatDate(startDate) : "\u2014"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">
                  {t("brew.fermentation.plannedEnd")}:
                </span>
                <span>{plannedEnd ? formatDate(plannedEnd) : "\u2014"}</span>
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
              {/* Progress bar (no shadcn Progress component available) */}
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
                    {t("brew.fermentation.temperature")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("brew.fermentation.gravity")}
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
                {measurements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {m.measuredAt
                        ? formatDateTime(new Date(m.measuredAt))
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {m.temperatureC
                        ? `${Number(m.temperatureC).toFixed(1)}`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {m.valuePlato
                        ? `${Number(m.valuePlato).toFixed(1)}`
                        : m.value
                          ? Number(m.value).toFixed(1)
                          : "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
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
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
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
                ? t("brew.fermentation.editMeasurement")
                : t("brew.fermentation.addMeasurementTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>{t("brew.fermentation.dateTime")}</Label>
              <Input
                type="datetime-local"
                value={mDate}
                onChange={(e) => setMDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("brew.fermentation.temperature")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={mTemp}
                  onChange={(e) => setMTemp(e.target.value)}
                  placeholder="12.0"
                />
              </div>
              <div>
                <Label>{t("brew.fermentation.gravity")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={mGravity}
                  onChange={(e) => setMGravity(e.target.value)}
                  placeholder="12.0"
                />
              </div>
            </div>
            <div>
              <Label>{t("brew.fermentation.notes")}</Label>
              <Input
                value={mNotes}
                onChange={(e) => setMNotes(e.target.value)}
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
