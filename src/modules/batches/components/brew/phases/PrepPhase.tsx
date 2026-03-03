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
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
} from "../../../types";
import {
  getBatchBrewData,
  getBatchIngredients,
  getProductionIssues,
  createProductionIssue,
  advanceBatchPhase,
  getBrewingSystemForBatch,
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
  "adjunct",
  "other",
] as const;

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
        setHasConfirmedIssue(true);
        // Reload ingredients to update issued quantities
        const updated = await getBatchIngredients(batchId);
        setIngredients(updated);
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

  // ── Total step time ──────────────────────────────────────
  const totalStepTime = steps.reduce(
    (sum, s) => sum + (s.timeMin ?? 0),
    0
  );

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
            {isPrep && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleIssue}
                disabled={isPending || hasConfirmedIssue}
              >
                <Package className="mr-2 size-4" />
                {hasConfirmedIssue
                  ? t("brew.prep.ingredientsIssued")
                  : t("brew.prep.issueIngredients")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {hasConfirmedIssue && (
              <Badge variant="secondary" className="mb-3">
                <CheckCircle2 className="mr-1 size-3" />
                {t("brew.prep.ingredientsIssued")}
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
                          colSpan={4}
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
                        return (
                          <TableRow key={item.recipeItemId}>
                            <TableCell className="text-sm">
                              {item.itemName}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {Number(item.recipeQty).toFixed(1)}{" "}
                              {item.unitSymbol}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {Number(item.issuedQty).toFixed(1)}{" "}
                              {item.unitSymbol}
                            </TableCell>
                            <TableCell className="text-right">
                              {isSufficient ? (
                                <CheckCircle2 className="size-4 text-green-600 inline" />
                              ) : (
                                <span className="inline-flex items-center gap-1 text-sm text-destructive">
                                  <AlertTriangle className="size-4" />
                                  {missing.toFixed(1)}
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

          {/* Steps Preview */}
          <Card>
            <CardHeader>
              <CardTitle>{t("brew.prep.stepsPreview")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        {t("brew.prep.stepNo")}
                      </TableHead>
                      <TableHead>
                        {t("brew.prep.stepName")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("brew.prep.stepTemp")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("brew.prep.stepTime")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {steps.map((step, idx) => (
                      <TableRow key={step.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="text-sm">
                          {step.name}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {step.temperatureC
                            ? `${Number(step.temperatureC).toFixed(0)}`
                            : "\u2014"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {step.timeMin ?? "\u2014"} min
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="font-medium text-sm"
                      >
                        {t("brew.prep.totalTime")}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {totalStepTime} min (
                        {Math.floor(totalStepTime / 60)}h{" "}
                        {totalStepTime % 60}min)
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
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
