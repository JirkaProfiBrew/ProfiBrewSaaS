"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import React from "react";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Package,
  Send,
  StickyNote,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type {
  Batch,
  BatchStep,
  BatchIngredientRow,
  BatchNote,
  BatchPhase,
} from "../../../types";
import {
  getBatchBrewData,
  getBatchIngredients,
  getProductionIssues,
  createProductionIssue,
  advanceBatchPhase,
  getBrewingSystemForBatch,
  addBatchNote,
} from "../../../actions";

// ── Brewing system shape (from getBrewingSystemForBatch) ────
interface BrewingSystem {
  name: string;
  batchSizeL: string;
  efficiencyPct: string;
  kettleVolumeL: string | null;
  evaporationRatePctPerHour: string | null;
  whirlpoolLossPct: string | null;
  waterPerKgMalt: string | null;
  grainAbsorptionLPerKg: string | null;
  waterReserveL: string | null;
  fermentationLossPct: string | null;
  timePreparation: number | null;
  timeLautering: number | null;
  timeWhirlpool: number | null;
  timeTransfer: number | null;
  timeCleanup: number | null;
}

// ── Props ────────────────────────────────────────────────────
interface Props {
  batchId: string;
}

// ── Ingredient category order ───────────────────────────────
const INGREDIENT_CATEGORIES = [
  "malt",
  "hop",
  "yeast",
  "fermentable",
  "other",
] as const;

/** Format quantity — up to 3 decimals, strip trailing zeros */
function fmtQty(val: string): string {
  const n = Number(val);
  if (Number.isNaN(n)) return val;
  // Use max 3 decimal places, then strip trailing zeros
  return parseFloat(n.toFixed(3)).toString();
}

export function PrepPhase({ batchId }: Props): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const [isPending, startTransition] = useTransition();

  // ── State ────────────────────────────────────────────────
  const [batch, setBatch] = useState<Batch | null>(null);
  const [steps, setSteps] = useState<BatchStep[]>([]);
  const [ingredients, setIngredients] = useState<BatchIngredientRow[]>([]);
  const [hasConfirmedIssue, setHasConfirmedIssue] = useState(false);
  const [brewSystem, setBrewSystem] = useState<BrewingSystem | null>(null);
  const [notes, setNotes] = useState<BatchNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Load data ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [brewData, batchIngr, issues, sys] = await Promise.all([
          getBatchBrewData(batchId),
          getBatchIngredients(batchId),
          getProductionIssues(batchId),
          getBrewingSystemForBatch(batchId),
        ]);
        if (cancelled || !brewData) return;

        setBatch(brewData.batch);
        setSteps(brewData.steps);
        setIngredients(batchIngr);
        setBrewSystem(sys);
        setNotes(brewData.notes);

        // Check if there's a confirmed production issue (ingredient issue-out)
        const hasConfirmed = issues.some(
          (i) =>
            i.status === "confirmed" &&
            i.movementPurpose === "production_out"
        );
        setHasConfirmedIssue(hasConfirmed);
      } catch {
        toast.error("Failed to load preparation data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return (): void => {
      cancelled = true;
    };
  }, [batchId]);

  // ── Group ingredients by category ────────────────────────
  const groupedIngredients = INGREDIENT_CATEGORIES.map((cat) => ({
    category: cat,
    items: ingredients.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  // ── Water calculations ───────────────────────────────────
  const totalMaltKg =
    ingredients
      .filter((i) => i.category === "malt")
      .reduce((sum, i) => sum + Number(i.recipeQty), 0);

  const waterPerKg = Number(brewSystem?.waterPerKgMalt ?? 3);
  const grainAbsorption = Number(
    brewSystem?.grainAbsorptionLPerKg ?? 0.8
  );
  const mashWater = totalMaltKg * waterPerKg;
  const spargeWater =
    totalMaltKg > 0
      ? Math.max(
          0,
          Number(batch?.recipeBatchSizeL ?? 0) * 1.1 -
            mashWater +
            totalMaltKg * grainAbsorption
        )
      : 0;
  const totalWater = mashWater + spargeWater;

  const isPrep = batch?.currentPhase === "preparation";

  // ── Issue state (D4: partial/repeated issue) ────────────
  const allIssued = ingredients.length > 0 && ingredients.every(
    (i) => Number(i.missingQty) <= 0
  );
  const someIssued = ingredients.some((i) => Number(i.issuedQty) > 0);

  // ── Issue materials ──────────────────────────────────────
  function handleIssue(): void {
    startTransition(async () => {
      try {
        const result = await createProductionIssue(batchId);
        if ("error" in result) {
          if (result.error === "ALL_ISSUED") {
            toast.info(t("brew.prep.allIssued"));
          } else {
            toast.error(t("brew.prep.issueError"));
          }
          return;
        }
        toast.success(t("brew.prep.issueSuccess"));
        // Reload ingredients to update issued quantities
        const updated = await getBatchIngredients(batchId);
        setIngredients(updated);
        // Reload issue status
        const issues = await getProductionIssues(batchId);
        setHasConfirmedIssue(
          issues.some(
            (i) =>
              i.status === "confirmed" &&
              i.movementPurpose === "production_out"
          )
        );
      } catch {
        toast.error(t("brew.prep.issueError"));
      }
    });
  }

  // ── Start brewing ────────────────────────────────────────
  function handleStartBrewing(): void {
    startTransition(async () => {
      try {
        await advanceBatchPhase(batchId, "brewing" as BatchPhase);
        toast.success(t("brew.phaseAdvanced"));
        router.push(
          `/${locale}/brewery/batches/${batchId}/brew/brewing`
        );
        router.refresh();
      } catch {
        toast.error("Failed to start brewing");
      }
    });
  }

  // ── Add note ────────────────────────────────────────────
  function handleAddNote(): void {
    const text = newNote.trim();
    if (!text) return;
    startTransition(async () => {
      try {
        const note = await addBatchNote(batchId, text);
        setNotes((prev) => [note, ...prev]);
        setNewNote("");
        toast.success(t("notes.added"));
      } catch {
        toast.error(t("notes.addError"));
      }
    });
  }

  // ── Total step time (includes brewing system stages) ─────
  const recipeStepTime = steps.reduce(
    (sum, s) => sum + (s.timeMin ?? 0),
    0
  );
  const totalStepTime = recipeStepTime
    + (brewSystem?.timePreparation ?? 0)
    + (brewSystem?.timeLautering ?? 0)
    + (brewSystem?.timeWhirlpool ?? 0)
    + (brewSystem?.timeTransfer ?? 0)
    + (brewSystem?.timeCleanup ?? 0);

  // ── Loading / empty ──────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-1/3 rounded bg-muted" />
          <div className="h-48 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!batch) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Column 1: Ingredients & Stock ─────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{t("brew.prep.ingredients")}</CardTitle>
            {isPrep && !allIssued && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleIssue}
                disabled={isPending}
              >
                <Package className="mr-2 size-4" />
                {someIssued
                  ? t("brew.prep.issueRemaining")
                  : t("brew.prep.issueIngredients")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {allIssued && (
              <Badge variant="secondary" className="mb-3">
                <CheckCircle2 className="mr-1 size-3" />
                {t("brew.prep.ingredientsIssued")}
              </Badge>
            )}
            {someIssued && !allIssued && (
              <Badge variant="outline" className="mb-3 border-amber-500 text-amber-600">
                <AlertTriangle className="mr-1 size-3" />
                {t("brew.prep.ingredientsPartial")}
              </Badge>
            )}

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("ingredients.columns.name")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("ingredients.columns.recipeQty")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("ingredients.columns.stock")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("ingredients.columns.issued")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("brew.prep.delta")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedIngredients.map((group) => (
                    <React.Fragment key={group.category}>
                      {/* Category header row */}
                      <TableRow className="bg-muted/50">
                        <TableCell
                          colSpan={5}
                          className="font-medium text-sm py-1.5"
                        >
                          {t(
                            `ingredients.category.${group.category}`
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Ingredient rows */}
                      {group.items.map((item) => {
                        const missing = Number(item.missingQty);
                        const isSufficient = missing <= 0;
                        const stock = Number(item.currentStock);
                        const needsMore = stock < Number(item.recipeQty);
                        return (
                          <TableRow key={item.recipeItemId}>
                            <TableCell className="text-sm">
                              {item.itemName}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {fmtQty(item.recipeQty)}{" "}
                              {item.unitSymbol}
                            </TableCell>
                            <TableCell className={`text-right text-sm ${needsMore ? "text-amber-600" : ""}`}>
                              {fmtQty(item.currentStock)}{" "}
                              {item.unitSymbol}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {fmtQty(item.issuedQty)}{" "}
                              {item.unitSymbol}
                            </TableCell>
                            <TableCell className="text-right">
                              {isSufficient ? (
                                <CheckCircle2 className="size-4 text-green-600 inline" />
                              ) : (
                                <span className="inline-flex items-center gap-1 text-sm text-destructive">
                                  <AlertTriangle className="size-4" />
                                  {fmtQty(String(missing))}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ── Column 2: Water & Volumes + Steps Preview ────── */}
        <div className="space-y-6">
          {/* Water Calculations */}
          <Card>
            <CardHeader>
              <CardTitle>{t("brew.prep.volumesPreview")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("brew.prep.mashWater")}
                </span>
                <span>{mashWater.toFixed(1)} L</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("brew.prep.spargeWater")}
                </span>
                <span>{spargeWater.toFixed(1)} L</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm font-medium">
                <span>{t("brew.prep.totalWater")}</span>
                <span>{totalWater.toFixed(1)} L</span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Preview (E2) */}
          <Card>
            <CardHeader>
              <CardTitle>{t("brew.prep.stepsPreview")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t("brew.prep.stepName")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("brew.prep.stepTime")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("brew.prep.stepStart")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("brew.prep.stepEnd")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const timeFmt = (d: Date): string =>
                        d.toLocaleTimeString(locale === "cs" ? "cs-CZ" : "en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                      const start = batch.plannedDate
                        ? new Date(batch.plannedDate)
                        : null;
                      let cursor = start ? new Date(start) : null;

                      interface TimelineStep {
                        name: string;
                        durationMin: number;
                        temp?: string;
                        startTime: string;
                        endTime: string;
                      }

                      const timeline: TimelineStep[] = [];

                      const addStep = (name: string, min: number, temp?: string): void => {
                        if (min <= 0) return;
                        const s = cursor ? timeFmt(cursor) : "\u2014";
                        if (cursor) cursor.setMinutes(cursor.getMinutes() + min);
                        const e = cursor ? timeFmt(cursor) : "\u2014";
                        timeline.push({ name, durationMin: min, temp, startTime: s, endTime: e });
                      };

                      // 1. Preparation
                      addStep(t("brew.prep.timelinePrep"), brewSystem?.timePreparation ?? 0);

                      // 2. Mashing steps (from recipe)
                      for (const step of steps.filter((s) => s.brewPhase === "mashing")) {
                        addStep(
                          step.name,
                          step.timeMin ?? 0,
                          step.temperatureC ? `${Number(step.temperatureC).toFixed(0)}°C` : undefined
                        );
                      }

                      // 3. Lautering
                      addStep(t("brew.prep.timelineLautering"), brewSystem?.timeLautering ?? 0);

                      // 4. Boil
                      const boilStep = steps.find((s) => s.stepType === "boil");
                      addStep(t("brew.prep.timelineBoil"), boilStep?.timeMin ?? 60);

                      // 5. Whirlpool
                      addStep(t("brew.prep.timelineWhirlpool"), brewSystem?.timeWhirlpool ?? 0);

                      // 6. Transfer + Cooling
                      addStep(t("brew.prep.timelineTransfer"), brewSystem?.timeTransfer ?? 0);

                      // 7. Cleanup
                      addStep(t("brew.prep.timelineCleanup"), brewSystem?.timeCleanup ?? 0);

                      return timeline.map((tl, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">
                            {tl.name}
                            {tl.temp && (
                              <span className="text-muted-foreground ml-1">
                                ({tl.temp})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {tl.durationMin} min
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {tl.startTime}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {tl.endTime}
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium text-sm">
                        {t("brew.prep.totalTime")}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {totalStepTime} min
                      </TableCell>
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Notes ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center space-y-0 gap-2">
          <StickyNote className="size-4 text-muted-foreground" />
          <CardTitle>{t("tabs.notes")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Add note form */}
          {isPrep && (
            <div className="flex gap-2">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={t("notes.placeholder")}
                rows={2}
                className="resize-none"
              />
              <Button
                size="sm"
                disabled={!newNote.trim() || isPending}
                onClick={handleAddNote}
                className="shrink-0 self-end"
              >
                <Send className="mr-1 size-4" />
                {t("notes.add")}
              </Button>
            </div>
          )}

          {/* Notes list */}
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {t("notes.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <p className="whitespace-pre-wrap">{note.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.createdAt
                      ? new Date(note.createdAt).toLocaleString(
                          locale === "cs" ? "cs-CZ" : "en-US",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Action: Start Brewing ──────────────────────────── */}
      {isPrep && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" disabled={isPending}>
                {t("brew.prep.startBrewing")}{" "}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("brew.prep.startBrewing")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("brew.prep.confirmStartBrewing")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleStartBrewing}>
                  {t("brew.prep.startBrewing")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
