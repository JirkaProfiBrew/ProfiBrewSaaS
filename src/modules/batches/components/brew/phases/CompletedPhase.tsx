"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { Batch } from "../../../types";
import {
  getBatchBrewData,
  getBrewingSystemForBatch,
  updateBrewingSystemEfficiency,
  duplicateBatch,
} from "../../../actions";

interface Props {
  batchId: string;
}

interface ComparisonRow {
  label: string;
  recipe: number | null;
  actual: number | null;
  threshold: number;
}

export function CompletedPhase({ batchId }: Props): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [batch, setBatch] = useState<Batch | null>(null);
  const [brewSystemEfficiency, setBrewSystemEfficiency] = useState<
    number | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const [brewData, sys] = await Promise.all([
        getBatchBrewData(batchId),
        getBrewingSystemForBatch(batchId),
      ]);
      if (cancelled || !brewData) return;
      setBatch(brewData.batch);
      setBrewSystemEfficiency(sys ? Number(sys.efficiencyPct) : null);
      setLoading(false);
    }
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [batchId]);

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }
  if (!batch) return null;

  // Build comparison rows
  const rows: ComparisonRow[] = [
    {
      label: t("brew.completed.og"),
      recipe: batch.recipeOg ? Number(batch.recipeOg) : null,
      actual: batch.ogActual ? Number(batch.ogActual) : null,
      threshold: 0.5,
    },
    {
      label: t("brew.completed.fg"),
      recipe: batch.recipeFg ? Number(batch.recipeFg) : null,
      actual: batch.fgActual ? Number(batch.fgActual) : null,
      threshold: 0.5,
    },
    {
      label: t("brew.completed.abv"),
      recipe: batch.recipeAbv ? Number(batch.recipeAbv) : null,
      actual: batch.abvActual ? Number(batch.abvActual) : null,
      threshold: 0.3,
    },
    {
      label: t("brew.completed.ibu"),
      recipe: batch.recipeIbu ? Number(batch.recipeIbu) : null,
      actual: null,
      threshold: 3,
    },
    {
      label: t("brew.completed.ebc"),
      recipe: batch.recipeEbc ? Number(batch.recipeEbc) : null,
      actual: null,
      threshold: 2,
    },
    {
      label: t("brew.completed.volume"),
      recipe: batch.recipeBatchSizeL
        ? Number(batch.recipeBatchSizeL)
        : null,
      actual: batch.actualVolumeL ? Number(batch.actualVolumeL) : null,
      threshold: 5,
    },
  ];

  // Efficiency comparison for suggested changes
  const recipeEfficiency = brewSystemEfficiency;
  const efficiencyDelta =
    recipeEfficiency != null && batch.ogActual && batch.recipeOg
      ? (Number(batch.ogActual) / Number(batch.recipeOg)) *
          recipeEfficiency -
        recipeEfficiency
      : null;
  const showEfficiencyWarning =
    efficiencyDelta != null && Math.abs(efficiencyDelta) > 2;

  // Finance
  const actualVolume = batch.actualVolumeL
    ? Number(batch.actualVolumeL)
    : null;

  return (
    <div className="space-y-6">
      {/* Badge */}
      <Badge variant="secondary" className="text-base px-4 py-1">
        {t("brew.completed.batchCompleted")}
      </Badge>

      {/* Section 1: Recipe vs Actual */}
      <Card>
        <CardHeader>
          <CardTitle>{t("brew.completed.recipeVsActual")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("brew.completed.parameter")}</TableHead>
                <TableHead className="text-right">
                  {t("brew.completed.recipeValue")}
                </TableHead>
                <TableHead className="text-right">
                  {t("brew.completed.actualValue")}
                </TableHead>
                <TableHead className="text-right">
                  {t("brew.completed.difference")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const delta =
                  row.recipe != null && row.actual != null
                    ? row.actual - row.recipe
                    : null;
                const isClose =
                  delta != null && Math.abs(delta) <= row.threshold;
                return (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right">
                      {row.recipe != null ? row.recipe.toFixed(1) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.actual != null ? row.actual.toFixed(1) : "\u2014"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        delta == null
                          ? ""
                          : isClose
                            ? "text-green-600"
                            : "text-destructive"
                      )}
                    >
                      {delta != null
                        ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`
                        : "\u2014"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 2: Suggested Constant Adjustments */}
      {showEfficiencyWarning && recipeEfficiency != null && (
        <Card>
          <CardHeader>
            <CardTitle>{t("brew.completed.suggestedChanges")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t("brew.completed.efficiency")}:{" "}
              {t("brew.completed.recipeValue")}{" "}
              {recipeEfficiency.toFixed(1)}%,{" "}
              {t("brew.completed.actualValue")}{" "}
              {(recipeEfficiency + efficiencyDelta!).toFixed(1)}%
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("brew.completed.applyToSystem")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("brew.completed.applyToSystem")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("brew.completed.applyConfirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const newEff = recipeEfficiency + efficiencyDelta!;
                          await updateBrewingSystemEfficiency(batchId, newEff);
                          setBrewSystemEfficiency(newEff);
                          toast.success(t("brew.completed.applied"));
                        } catch {
                          toast.error("Error");
                        }
                      });
                    }}
                  >
                    {t("brew.completed.applyToSystem")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* Section 3: Finance */}
      <Card>
        <CardHeader>
          <CardTitle>{t("brew.completed.finance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("brew.completed.ingredientCost")}
              </span>
              <span>{"\u2014"}</span>
            </div>
            {actualVolume != null && actualVolume > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("brew.completed.costPerLiter")}
                </span>
                <span>{"\u2014"}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              try {
                const newBatch = await duplicateBatch(batchId);
                toast.success(t("brew.completed.duplicateBatch"));
                router.push(
                  `/${locale}/brewery/batches/${newBatch.id}/brew`
                );
              } catch {
                toast.error("Error");
              }
            });
          }}
        >
          <Copy className="mr-1 size-4" />
          {t("brew.completed.duplicateBatch")}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            router.push(`/${locale}/brewery/batches/${batchId}`)
          }
        >
          {t("brew.classicView")}
        </Button>
      </div>
    </div>
  );
}
