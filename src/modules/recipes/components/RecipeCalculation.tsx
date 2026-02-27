"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, CheckCircle, AlertCircle, Droplets, Wheat } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";

import { cn } from "@/lib/utils";
import type { Recipe, RecipeItem, RecipeCalculationResult } from "../types";
import { useBeerStyles, useBrewingSystemOptions } from "../hooks";
import { calculateAndSaveRecipe, getLatestRecipeCalculation } from "../actions";

// ── Props ──────────────────────────────────────────────────────

interface RecipeCalculationProps {
  recipeId: string;
  recipe: Recipe | null;
  items: RecipeItem[];
  onMutate: () => void;
}

// ── Helpers ────────────────────────────────────────────────────

function isInRange(
  value: string | null,
  min: string | null,
  max: string | null
): "in_range" | "out_of_range" | "unknown" {
  if (value == null || (min == null && max == null)) return "unknown";
  const v = parseFloat(value);
  if (isNaN(v)) return "unknown";

  const lo = min != null ? parseFloat(min) : -Infinity;
  const hi = max != null ? parseFloat(max) : Infinity;

  if (isNaN(lo) && isNaN(hi)) return "unknown";
  return v >= lo && v <= hi ? "in_range" : "out_of_range";
}

function formatDecimal(value: string | null, decimals: number = 1): string {
  if (value == null) return "—";
  const n = parseFloat(value);
  if (isNaN(n)) return value;
  return n.toFixed(decimals);
}

// ── Component ──────────────────────────────────────────────────

export function RecipeCalculation({
  recipeId,
  recipe,
  items,
  onMutate,
}: RecipeCalculationProps): React.ReactNode {
  const t = useTranslations("recipes");
  const tCommon = useTranslations("common");

  const { data: beerStyles } = useBeerStyles();
  const { data: brewingSystemOpts } = useBrewingSystemOptions();
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcSnapshot, setCalcSnapshot] = useState<RecipeCalculationResult | null>(null);

  // Load latest calculation snapshot on mount
  useEffect(() => {
    void getLatestRecipeCalculation(recipeId).then(setCalcSnapshot);
  }, [recipeId]);

  // Find the matching beer style for comparison
  const matchedStyle = useMemo(() => {
    if (!recipe?.beerStyleId) return null;
    return beerStyles.find((s) => s.id === recipe.beerStyleId) ?? null;
  }, [recipe?.beerStyleId, beerStyles]);

  const handleRecalculate = useCallback(async (): Promise<void> => {
    setIsCalculating(true);
    try {
      const result = await calculateAndSaveRecipe(recipeId);
      setCalcSnapshot(result);
      toast.success(t("calculation.recalculated"));
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to recalculate recipe:", error);
      toast.error(tCommon("saveFailed"));
    } finally {
      setIsCalculating(false);
    }
  }, [recipeId, t, tCommon, onMutate]);

  // Parameter rows for display
  const parameterRows = useMemo(() => {
    if (!recipe) return [];

    return [
      {
        label: "OG (°P)",
        value: recipe.og,
        min: matchedStyle?.ogMin ?? null,
        max: matchedStyle?.ogMax ?? null,
      },
      {
        label: "FG (°P)",
        value: recipe.fg,
        min: matchedStyle?.fgMin ?? null,
        max: matchedStyle?.fgMax ?? null,
      },
      {
        label: "ABV (%)",
        value: recipe.abv,
        min: matchedStyle?.abvMin ?? null,
        max: matchedStyle?.abvMax ?? null,
      },
      {
        label: "IBU",
        value: recipe.ibu,
        min: matchedStyle?.ibuMin ?? null,
        max: matchedStyle?.ibuMax ?? null,
      },
      {
        label: "EBC",
        value: recipe.ebc,
        min: matchedStyle?.ebcMin ?? null,
        max: matchedStyle?.ebcMax ?? null,
      },
    ];
  }, [recipe, matchedStyle]);

  // Cost breakdown from ingredient data
  // When a calcSnapshot exists, use its resolved per-ingredient prices (avg_stock / last_purchase).
  // Snapshot ingredients include recipeItemId + costPerUnit — safe for duplicate items.
  // Otherwise, fall back to client-side items.costPrice.
  const costBreakdown = useMemo(() => {
    // Build a lookup by recipeItemId (unique per recipe line)
    const snapshotMap = new Map<
      string,
      { cost: number; costPerUnit: number; unitSymbol?: string; amount: number; priceSource: string }
    >();
    if (calcSnapshot?.ingredients) {
      for (const ing of calcSnapshot.ingredients) {
        if (ing.recipeItemId) {
          snapshotMap.set(ing.recipeItemId, {
            cost: ing.cost,
            costPerUnit: ing.costPerUnit,
            unitSymbol: ing.unitSymbol,
            amount: ing.amount,
            priceSource: ing.priceSource,
          });
        }
      }
    }

    return items.map((item) => {
      const recipeAmount = parseFloat(item.amountG) || 0;
      const unitSymbol = item.unitSymbol ?? "g";

      // Match snapshot by recipe item ID (unique, safe for duplicate items)
      const snapshotIng = snapshotMap.get(item.id);

      // Use snapshot data directly — amounts already in stock units, costs per stock unit
      let displayAmount: number;
      let costPerUnit: number;
      let totalCost: number;
      let displayUnitSymbol: string;

      if (snapshotIng) {
        // Snapshot has amount in stock units and cost per stock unit
        displayAmount = snapshotIng.amount;
        costPerUnit = snapshotIng.costPerUnit;
        totalCost = Math.round(snapshotIng.cost * 100) / 100;
        displayUnitSymbol = snapshotIng.unitSymbol ?? unitSymbol;
      } else {
        // No snapshot — fallback to client-side data (recipe units, 1:1)
        displayAmount = recipeAmount;
        costPerUnit = item.itemCostPrice ? parseFloat(item.itemCostPrice) : 0;
        totalCost = Math.round(displayAmount * costPerUnit * 100) / 100;
        displayUnitSymbol = unitSymbol;
      }

      return {
        id: item.id,
        name: item.itemName ?? item.itemId,
        amount: displayAmount,
        unitSymbol: displayUnitSymbol,
        costPerUnit: Math.round(costPerUnit * 100) / 100,
        totalCost,
      };
    });
  }, [items, calcSnapshot]);

  const totalCost = useMemo(
    () => costBreakdown.reduce((sum, item) => sum + item.totalCost, 0),
    [costBreakdown]
  );

  const batchSizeL = recipe?.batchSizeL ? parseFloat(recipe.batchSizeL) : 0;
  const costPerLiter =
    batchSizeL > 0 ? Math.round((totalCost / batchSizeL) * 100) / 100 : 0;

  if (!recipe) {
    return (
      <div className="text-center text-muted-foreground">
        {t("calculation.noRecipe")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Calculated parameters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("calculation.parameters")}</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRecalculate()}
              disabled={isCalculating}
            >
              <RefreshCw
                className={cn("mr-1 size-4", isCalculating && "animate-spin")}
              />
              {t("calculation.recalculate")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {parameterRows.map((param) => {
              const rangeStatus = isInRange(param.value, param.min, param.max);
              return (
                <div
                  key={param.label}
                  className="flex flex-col gap-1 rounded-lg border p-3"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {param.label}
                  </span>
                  <span className="text-2xl font-bold">
                    {formatDecimal(param.value)}
                  </span>
                  {matchedStyle && param.min != null && param.max != null && (
                    <div className="flex items-center gap-1 text-xs">
                      {rangeStatus === "in_range" ? (
                        <CheckCircle className="size-3 text-green-600" />
                      ) : rangeStatus === "out_of_range" ? (
                        <AlertCircle className="size-3 text-amber-500" />
                      ) : null}
                      <span className="text-muted-foreground">
                        {formatDecimal(param.min)} – {formatDecimal(param.max)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {matchedStyle && (
            <div className="mt-4">
              <Badge variant="outline">
                {matchedStyle.groupName
                  ? `${matchedStyle.groupName} — ${matchedStyle.name}`
                  : matchedStyle.name}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Volume pipeline + material requirements */}
      {calcSnapshot?.pipeline && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Volume pipeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="size-4" />
                {t("calculation.pipeline.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: t("calculation.pipeline.preBoil"), value: calcSnapshot.pipeline.preBoilL },
                  { label: t("calculation.pipeline.postBoil"), value: calcSnapshot.pipeline.postBoilL, loss: calcSnapshot.pipeline.losses.kettleL, lossLabel: t("calculation.pipeline.kettleLoss") },
                  { label: t("calculation.pipeline.intoFermenter"), value: calcSnapshot.pipeline.intoFermenterL, loss: calcSnapshot.pipeline.losses.whirlpoolL, lossLabel: t("calculation.pipeline.whirlpoolLoss") },
                  { label: t("calculation.pipeline.finishedBeer"), value: calcSnapshot.pipeline.finishedBeerL, loss: calcSnapshot.pipeline.losses.fermentationL, lossLabel: t("calculation.pipeline.fermentationLoss") },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-sm">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{row.value} L</span>
                      {row.loss != null && row.loss > 0 && (
                        <span className="text-xs text-muted-foreground">
                          (−{row.loss} L)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{t("calculation.pipeline.totalLoss")}</span>
                  <span className="font-semibold text-amber-600">
                    {calcSnapshot.pipeline.losses.totalL} L
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Material requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wheat className="size-4" />
                {t("calculation.requirements.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{t("calculation.requirements.maltRequired")}</span>
                  <span className="text-2xl font-bold">
                    {calcSnapshot.maltRequiredKg ?? 0} {t("calculation.requirements.maltUnit")}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{t("calculation.requirements.waterRequired")}</span>
                  <span className="text-2xl font-bold">
                    {calcSnapshot.waterRequiredL ?? 0} {t("calculation.requirements.waterUnit")}
                  </span>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {calcSnapshot.brewingSystemUsed
                  ? t("calculation.brewingSystemNote", {
                      name: brewingSystemOpts.find((bs) => bs.id === recipe?.brewingSystemId)?.name ?? "",
                    })
                  : t("calculation.defaultSystemNote")}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cost breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{t("calculation.costBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("calculation.itemName")}</TableHead>
                <TableHead className="text-right">
                  {t("calculation.itemAmount")}
                </TableHead>
                <TableHead className="text-right">
                  {t("calculation.itemUnitCost")}
                </TableHead>
                <TableHead className="text-right">
                  {t("calculation.itemTotalCost")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    {t("ingredients.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                costBreakdown.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">
                      {`${row.amount % 1 === 0 ? row.amount : row.amount.toFixed(2)} ${row.unitSymbol}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.costPerUnit > 0
                        ? `${row.costPerUnit.toFixed(2)} / ${row.unitSymbol}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.totalCost > 0
                        ? row.totalCost.toFixed(2)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {costBreakdown.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold">
                    {t("calculation.ingredientsCost")}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {calcSnapshot
                      ? (calcSnapshot.ingredientsCost ?? calcSnapshot.costPrice ?? totalCost).toFixed(2)
                      : totalCost.toFixed(2)}
                  </TableCell>
                </TableRow>

                {/* Overhead rows — only if snapshot has overhead data */}
                {calcSnapshot?.ingredientOverheadCost !== undefined && (
                  <>
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("calculation.ingredientOverhead", {
                          pct: calcSnapshot.ingredientOverheadPct ?? 0,
                        })}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(calcSnapshot.ingredientOverheadCost ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("calculation.brewCost")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(calcSnapshot.brewCost ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("calculation.overheadCost")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(calcSnapshot.overheadCost ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="font-bold">
                        {t("calculation.totalProductionCost")}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {calcSnapshot.totalProductionCost.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="font-bold">
                        {t("calculation.productionCostPerLiter")}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {calcSnapshot.costPerLiter.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    {calcSnapshot.pricingMode && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-xs text-muted-foreground">
                          {t("calculation.pricingSource")}: {t(`calculation.pricingModes.${calcSnapshot.pricingMode}`)}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )}

                {/* Fallback for old snapshots without overhead data */}
                {calcSnapshot?.ingredientOverheadCost === undefined && (
                  <>
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("calculation.ingredientOverhead", { pct: 0 })}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        0.00
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("calculation.brewCost")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        0.00
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("calculation.overheadCost")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        0.00
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="font-bold">
                        {t("calculation.totalProductionCost")}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {totalCost.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="font-bold">
                        {t("calculation.productionCostPerLiter")}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {costPerLiter.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
