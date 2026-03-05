"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import React from "react";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Package,
  ExternalLink,
  List,
  LayoutList,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  BatchPhase,
  ProductionIssueInfo,
  BrewStepPreviewResult,
} from "../../../types";
import {
  getBatchBrewData,
  getBatchIngredients,
  getProductionIssues,
  createProductionIssue,
  advanceBatchPhase,
  getBrewingSystemForBatch,
  getBrewStepPreview,
  updateBatchPlanData,
} from "../../../actions";
import { BrewStepTimeline } from "../BrewStepTimeline";

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
  const [prodIssues, setProdIssues] = useState<ProductionIssueInfo[]>([]);
  const [brewSystem, setBrewSystem] = useState<BrewingSystem | null>(null);
  const [brewPreview, setBrewPreview] = useState<BrewStepPreviewResult | null>(null);
  const [viewMode, setViewMode] = useState<"compact" | "full">("compact");
  const [brewStartInput, setBrewStartInput] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Load data ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [brewData, batchIngr, issues, sys, preview] = await Promise.all([
          getBatchBrewData(batchId),
          getBatchIngredients(batchId),
          getProductionIssues(batchId),
          getBrewingSystemForBatch(batchId),
          getBrewStepPreview(batchId),
        ]);
        if (cancelled || !brewData) return;

        setBatch(brewData.batch);
        setSteps(brewData.steps);
        setIngredients(batchIngr);
        setBrewSystem(sys);
        setBrewPreview(preview);
        setProdIssues(issues);

        // Init brew start input from batch plannedDate (local time for datetime-local input)
        if (brewData.batch.plannedDate) {
          const d = new Date(brewData.batch.plannedDate);
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
          setBrewStartInput(local.toISOString().slice(0, 16));
        }

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
  const hasOriginal = ingredients.some((i) => i.originalQty != null);

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
        setProdIssues(issues);
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

  // ── Recalculate brew steps with new start time ──────────
  const handleRecalculate = useCallback((): void => {
    startTransition(async () => {
      try {
        // Save the new planned date
        await updateBatchPlanData(batchId, {
          plannedDate: brewStartInput || null,
        });
        // Re-fetch preview with updated date
        const preview = await getBrewStepPreview(batchId);
        setBrewPreview(preview);
        router.refresh();
      } catch {
        toast.error("Failed to recalculate");
      }
    });
  }, [batchId, brewStartInput, router, startTransition]);

  // ── Total step time (from preview) ──────────────────────
  const totalStepTime = brewPreview?.totalMinutes ?? 0;

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
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
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
                    {hasOriginal && (
                      <TableHead className="text-right">
                        {t("ingredients.columns.original")}
                      </TableHead>
                    )}
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
                          colSpan={hasOriginal ? 6 : 5}
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
                        const originalDiffers = item.originalQty != null
                          && parseFloat(item.originalQty) !== parseFloat(item.recipeQty);
                        return (
                          <TableRow key={item.recipeItemId}>
                            <TableCell className="text-sm">
                              {item.itemName}
                            </TableCell>
                            {hasOriginal && (
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {item.originalQty != null
                                  ? `${fmtQty(item.originalQty)} ${item.unitSymbol ?? ""}`
                                  : "\u2014"}
                              </TableCell>
                            )}
                            <TableCell className={`text-right text-sm ${originalDiffers ? "font-semibold" : ""}`}>
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

            {/* Linked stock issues (výdejky) */}
            {prodIssues.filter((i) => i.status !== "cancelled").length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-1">
                  {t("ingredients.linkedIssues")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {prodIssues
                    .filter((i) => i.status !== "cancelled")
                    .map((issue) => (
                      <Link
                        key={issue.id}
                        href={`/${locale}/stock/movements/${issue.id}?batchId=${batchId}&batchNumber=${encodeURIComponent(batch.batchNumber)}&from=${encodeURIComponent(`/brewery/batches/${batchId}/brew/prep`)}`}
                        className="text-sm text-primary underline hover:no-underline inline-flex items-center gap-1"
                      >
                        {issue.code}
                        <ExternalLink className="size-3" />
                      </Link>
                    ))}
                </div>
              </div>
            )}
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

          {/* Timeline Preview — compact or full */}
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle>{t("brew.prep.stepsPreview")}</CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant={viewMode === "compact" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setViewMode("compact")}
                  >
                    <List className="size-3.5 mr-1" />
                    {t("brew.prep.viewCompact")}
                  </Button>
                  <Button
                    variant={viewMode === "full" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setViewMode("full")}
                  >
                    <LayoutList className="size-3.5 mr-1" />
                    {t("brew.prep.viewFull")}
                  </Button>
                </div>
              </div>
              {/* Brew start datetime + recalculate */}
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={brewStartInput}
                  onChange={(e) => setBrewStartInput(e.target.value)}
                  className="h-8 text-sm w-auto"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={handleRecalculate}
                  disabled={isPending}
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
                  {t("brew.prep.recalculate")}
                </Button>
                {(() => {
                  const end = brewPreview?.brewEnd
                    ? new Date(brewPreview.brewEnd)
                    : null;
                  const timeFmt = (d: Date): string =>
                    d.toLocaleTimeString(locale === "cs" ? "cs-CZ" : "en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  return (
                    <span className="text-sm text-muted-foreground ml-auto whitespace-nowrap">
                      {"\u2192 "}
                      {end ? timeFmt(end) : "\u2014"}
                      {" "}({totalStepTime >= 60
                        ? `${Math.floor(totalStepTime / 60)}h ${totalStepTime % 60}min`
                        : `${totalStepTime} min`})
                    </span>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === "compact" ? (
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(brewPreview?.steps ?? []).map((step, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm py-1.5">
                            {step.name}
                            {step.temperatureC && (
                              <span className="text-muted-foreground ml-1">
                                ({Number(step.temperatureC).toFixed(0)}°C)
                              </span>
                            )}
                            {step.autoSwitch && (
                              <span className="text-xs text-muted-foreground ml-1.5">
                                Auto
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm py-1.5">
                            {step.timeMin} min
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">
                          {t("brew.prep.totalTime")}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {totalStepTime >= 60
                            ? `${Math.floor(totalStepTime / 60)}h ${totalStepTime % 60}min`
                            : `${totalStepTime} min`}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              ) : brewPreview ? (
                <BrewStepTimeline
                  steps={brewPreview.steps}
                  brewStart={new Date(brewPreview.brewStart)}
                  brewEnd={new Date(brewPreview.brewEnd)}
                  totalMinutes={brewPreview.totalMinutes}
                  fermentationDays={batch.fermentationDays ?? 14}
                  conditioningDays={batch.conditioningDays ?? 21}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

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
