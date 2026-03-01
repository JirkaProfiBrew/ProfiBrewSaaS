"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import React from "react";
import { ArrowRight, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import type { Batch, BatchStep, RecipeIngredient, BatchPhase } from "../../../types";
import {
  getBatchBrewData,
  getRecipeIngredients,
  advanceBatchPhase,
  getAvailableVessels,
  updateBatchPlanData,
} from "../../../actions";

// ── Vessel row from getAvailableVessels ─────────────────────
interface VesselRow {
  id: string;
  name: string;
  equipmentType: string;
  volumeL: string | null;
  status: string;
  currentBatchId: string | null;
  currentBatchNumber: string | null;
}

// ── Props ────────────────────────────────────────────────────
interface Props {
  batchId: string;
}

export function PlanPhase({ batchId }: Props): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const [isPending, startTransition] = useTransition();

  // ── State ────────────────────────────────────────────────
  const [batch, setBatch] = useState<Batch | null>(null);
  const [steps, setSteps] = useState<BatchStep[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [vessels, setVessels] = useState<VesselRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [plannedDate, setPlannedDate] = useState("");
  const [fermDays, setFermDays] = useState<number>(14);
  const [condDays, setCondDays] = useState<number>(21);
  const [fermVesselId, setFermVesselId] = useState<string>("");
  const [condVesselId, setCondVesselId] = useState<string>("");

  // ── Load data ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [brewData, vesselData] = await Promise.all([
          getBatchBrewData(batchId),
          getAvailableVessels(),
        ]);
        if (cancelled || !brewData) return;

        setBatch(brewData.batch);
        setSteps(brewData.steps);
        setVessels(vesselData);

        // Init editable fields from batch
        if (brewData.batch.plannedDate) {
          const d = new Date(brewData.batch.plannedDate);
          setPlannedDate(d.toISOString().slice(0, 16));
        }
        setFermDays(brewData.batch.fermentationDays ?? 14);
        setCondDays(brewData.batch.conditioningDays ?? 21);
        setFermVesselId(brewData.batch.equipmentId ?? "");
        setCondVesselId(brewData.batch.conditioningEquipmentId ?? "");

        // Load ingredients from recipe
        if (brewData.batch.recipeId) {
          const recipeIngr = await getRecipeIngredients(brewData.batch.recipeId);
          if (!cancelled) {
            setIngredients(recipeIngr);
          }
        }
      } catch {
        toast.error("Failed to load plan data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return (): void => {
      cancelled = true;
    };
  }, [batchId]);

  // ── Grouped ingredients ──────────────────────────────────
  const malts = ingredients.filter((i) => i.category === "malt");
  const hops = ingredients.filter((i) => i.category === "hop");
  const yeasts = ingredients.filter((i) => i.category === "yeast");

  // ── Time estimates ───────────────────────────────────────
  const mashingTimeMin = steps
    .filter((s) => s.brewPhase === "mashing")
    .reduce((sum, s) => sum + (s.timeMin ?? 0), 0);
  const totalTimeMin = steps.reduce((sum, s) => sum + (s.timeMin ?? 0), 0);

  // ── Estimated end ────────────────────────────────────────
  const estimatedEnd =
    plannedDate && fermDays != null && condDays != null
      ? (() => {
          const d = new Date(plannedDate);
          d.setDate(d.getDate() + fermDays + condDays + 1);
          return d.toLocaleDateString(locale === "cs" ? "cs-CZ" : "en-US");
        })()
      : "\u2014";

  const isEditable =
    batch?.currentPhase === "plan" || batch?.currentPhase == null;

  // ── Auto-save plan changes ───────────────────────────────
  const savePlanField = useCallback(
    async (field: string, value: unknown): Promise<void> => {
      try {
        await updateBatchPlanData(batchId, { [field]: value });
      } catch {
        toast.error("Save failed");
      }
    },
    [batchId]
  );

  // ── Advance to preparation ──────────────────────────────
  function handleStartPrep(): void {
    startTransition(async () => {
      try {
        await advanceBatchPhase(batchId, "preparation" as BatchPhase);
        toast.success(t("brew.phaseAdvanced"));
        router.push(`/${locale}/brewery/batches/${batchId}/brew/prep`);
        router.refresh();
      } catch {
        toast.error("Error advancing phase");
      }
    });
  }

  // ── Vessel filtering ─────────────────────────────────────
  const fermVessels = vessels.filter((v) => v.equipmentType === "fermenter");
  const condVessels = vessels.filter((v) =>
    ["conditioning", "brite_tank"].includes(v.equipmentType)
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

  if (!batch) {
    return (
      <div className="p-8 text-muted-foreground">
        {t("brew.plan.noRecipe")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Column 1: Recipe ──────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t("brew.plan.recipe")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {batch.recipeId ? (
              <>
                <div>
                  <p className="font-medium">{batch.recipeName}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
                    {batch.recipeOg && (
                      <span>
                        {t("brew.plan.og")} {Number(batch.recipeOg).toFixed(1)}
                        &deg;P
                      </span>
                    )}
                    {batch.recipeIbu && (
                      <span>
                        {t("brew.plan.ibu")}{" "}
                        {Number(batch.recipeIbu).toFixed(0)}
                      </span>
                    )}
                    {batch.recipeEbc && (
                      <span>
                        {t("brew.plan.ebc")}{" "}
                        {Number(batch.recipeEbc).toFixed(0)}
                      </span>
                    )}
                    {batch.recipeBatchSizeL && (
                      <span>
                        {t("brew.plan.volume")}{" "}
                        {Number(batch.recipeBatchSizeL).toFixed(0)} L
                      </span>
                    )}
                  </div>
                </div>

                <Separator />

                {malts.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">
                      {t("brew.plan.malts")}
                    </p>
                    {malts.map((m) => (
                      <div
                        key={m.id}
                        className="text-sm text-muted-foreground flex justify-between"
                      >
                        <span>{m.itemName}</span>
                        <span>
                          {m.amountG} {m.unitSymbol ?? "g"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {hops.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">
                      {t("brew.plan.hops")}
                    </p>
                    {hops.map((h) => (
                      <div
                        key={h.id}
                        className="text-sm text-muted-foreground flex justify-between"
                      >
                        <span>{h.itemName}</span>
                        <span>
                          {h.amountG} {h.unitSymbol ?? "g"} &middot;{" "}
                          {h.useTimeMin ?? 0} min
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {yeasts.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">
                      {t("brew.plan.yeasts")}
                    </p>
                    {yeasts.map((y) => (
                      <div
                        key={y.id}
                        className="text-sm text-muted-foreground flex justify-between"
                      >
                        <span>{y.itemName}</span>
                        <span>
                          {y.amountG} {y.unitSymbol ?? "g"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {isEditable && batch.sourceRecipeId && (
                  <Link
                    href={`/${locale}/brewery/recipes/${batch.sourceRecipeId}`}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
                  >
                    {t("brew.plan.editRecipe")}{" "}
                    <ExternalLink className="size-3" />
                  </Link>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                {t("brew.plan.noRecipe")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Column 2: Schedule ────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t("brew.plan.schedule")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t("brew.plan.plannedStart")}</Label>
              <Input
                type="datetime-local"
                value={plannedDate}
                onChange={(e): void => {
                  setPlannedDate(e.target.value);
                  void savePlanField(
                    "plannedDate",
                    e.target.value || null
                  );
                }}
                disabled={!isEditable}
              />
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("brew.plan.estimatedMashing")}
                </span>
                <span>{mashingTimeMin} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("brew.plan.estimatedTotal")}
                </span>
                <span>
                  {totalTimeMin} min ({Math.floor(totalTimeMin / 60)}h{" "}
                  {totalTimeMin % 60}min)
                </span>
              </div>
            </div>

            <Separator />

            <div>
              <Label>{t("brew.plan.fermentationDays")}</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={fermDays}
                onChange={(e): void => {
                  const v = Number(e.target.value);
                  setFermDays(v);
                  void savePlanField("fermentationDays", v);
                }}
                disabled={!isEditable}
              />
            </div>

            <div>
              <Label>{t("brew.plan.conditioningDays")}</Label>
              <Input
                type="number"
                min={1}
                max={180}
                value={condDays}
                onChange={(e): void => {
                  const v = Number(e.target.value);
                  setCondDays(v);
                  void savePlanField("conditioningDays", v);
                }}
                disabled={!isEditable}
              />
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("brew.plan.estimatedEnd")}
              </span>
              <span className="font-medium">{estimatedEnd}</span>
            </div>
          </CardContent>
        </Card>

        {/* ── Column 3: Vessels ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t("brew.plan.vessels")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t("brew.plan.fermentingVessel")}</Label>
              <Select
                value={fermVesselId}
                onValueChange={(v): void => {
                  setFermVesselId(v);
                  void savePlanField("equipmentId", v || null);
                }}
                disabled={!isEditable}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("brew.plan.selectVessel")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {fermVessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.volumeL &&
                        ` (${Number(v.volumeL).toFixed(0)} L)`}
                      {v.status !== "available" &&
                        v.currentBatchId !== batchId &&
                        ` \u2014 ${t("brew.plan.vesselOccupied")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t("brew.plan.conditioningVessel")}</Label>
              <Select
                value={condVesselId}
                onValueChange={(v): void => {
                  setCondVesselId(v);
                  void savePlanField(
                    "conditioningEquipmentId",
                    v || null
                  );
                }}
                disabled={!isEditable}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("brew.plan.selectVessel")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {condVessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.volumeL &&
                        ` (${Number(v.volumeL).toFixed(0)} L)`}
                      {v.status !== "available" &&
                        v.currentBatchId !== batchId &&
                        ` \u2014 ${t("brew.plan.vesselOccupied")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-1">
              {vessels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("brew.plan.noVessels")}
                </p>
              ) : (
                vessels.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{v.name}</span>
                    <Badge
                      variant={
                        v.status === "available" ? "secondary" : "outline"
                      }
                    >
                      {v.status === "available"
                        ? t("brew.plan.vesselFree")
                        : `${t("brew.plan.vesselOccupied")}${v.currentBatchNumber ? ` \u00b7 ${v.currentBatchNumber}` : ""}`}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Action Button ──────────────────────────────────── */}
      {isEditable && (
        <div className="flex justify-end">
          <Button onClick={handleStartPrep} disabled={isPending} size="lg">
            {t("brew.plan.startPrep")}{" "}
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
