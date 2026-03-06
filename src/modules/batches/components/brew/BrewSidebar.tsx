"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ScrollText,
  Droplets,
  Ruler,
  StickyNote,
  BarChart3,
  ArrowLeftRight,
  Landmark,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type {
  Batch,
  BatchStep,
  BatchMeasurement,
  BatchNote,
  BatchLotEntry,
  BatchInputLot,
  ExciseSummary,
  RecipeIngredient,
} from "../../types";
import {
  getBatchLotTracking,
  getBatchInputLots,
  getBatchExciseSummary,
  getRecipeIngredients,
  updateBatch,
  upsertSidebarMeasurement,
} from "../../actions";
import type { RecipeCalculationResult } from "@/modules/recipes/types";

const SIDEBAR_PANELS = [
  { key: "recipe",     icon: ScrollText,     labelKey: "sidebar.recipePreview" },
  { key: "volumes",    icon: Droplets,       labelKey: "sidebar.volumes" },
  { key: "measured",   icon: Ruler,          labelKey: "sidebar.measured" },
  { key: "notes",      icon: StickyNote,     labelKey: "sidebar.notes" },
  { key: "comparison", icon: BarChart3,      labelKey: "sidebar.comparison" },
  { key: "tracking",   icon: ArrowLeftRight, labelKey: "sidebar.tracking" },
  { key: "excise",     icon: Landmark,       labelKey: "sidebar.excise" },
] as const;

type PanelKey = (typeof SIDEBAR_PANELS)[number]["key"];

interface BrewSidebarProps {
  batch: Batch;
  steps: BatchStep[];
  measurements: BatchMeasurement[];
  notes: BatchNote[];
  calcResult: RecipeCalculationResult | null;
}

export function BrewSidebar({
  batch,
  steps,
  measurements,
  notes,
  calcResult,
}: BrewSidebarProps): React.ReactNode {
  const t = useTranslations("batches");
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  // Lazy-loaded data for tracking and excise panels
  const [inputLots, setInputLots] = useState<BatchInputLot[] | null>(null);
  const [outputLots, setOutputLots] = useState<BatchLotEntry[] | null>(null);
  const [exciseSummary, setExciseSummary] = useState<ExciseSummary | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[] | null>(null);

  // Load data when panels open
  useEffect(() => {
    if (openPanel === "tracking" && inputLots === null) {
      getBatchInputLots(batch.id).then(setInputLots);
      getBatchLotTracking(batch.id).then((entries) =>
        setOutputLots(entries.filter((e) => e.direction === "out"))
      );
    }
    if (openPanel === "excise" && exciseSummary === null) {
      getBatchExciseSummary(batch.id).then(setExciseSummary);
    }
    if (openPanel === "recipe" && ingredients === null && batch.recipeId) {
      getRecipeIngredients(batch.recipeId).then(setIngredients);
    }
  }, [openPanel, batch.id, batch.recipeId, inputLots, outputLots, exciseSummary, ingredients]);

  return (
    <>
      {/* Icon strip */}
      <TooltipProvider delayDuration={0}>
        <div className="hidden md:flex shrink-0 w-12 flex-col items-center gap-1 border-l bg-muted/30 py-2">
          {SIDEBAR_PANELS.map(({ key, icon: Icon, labelKey }) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-9",
                    openPanel === key && "bg-accent"
                  )}
                  onClick={() => setOpenPanel(openPanel === key ? null : key)}
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t(`brew.${labelKey}`)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Panel Sheet */}
      <Sheet open={openPanel !== null} onOpenChange={(open) => !open && setOpenPanel(null)}>
        <SheetContent side="right" className="w-96 p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle>
              {openPanel && t(`brew.${SIDEBAR_PANELS.find(p => p.key === openPanel)?.labelKey ?? "sidebar.recipePreview"}`)}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4 overflow-y-auto h-[calc(100vh-5rem)]">
            {openPanel === "recipe" && (
              <RecipePanel batch={batch} steps={steps} ingredients={ingredients} calcResult={calcResult} t={t} />
            )}
            {openPanel === "volumes" && (
              <VolumesPanel batch={batch} calcResult={calcResult} t={t} />
            )}
            {openPanel === "measured" && (
              <MeasuredPanel batch={batch} measurements={measurements} calcResult={calcResult} t={t} />
            )}
            {openPanel === "notes" && (
              <NotesPanel notes={notes} t={t} />
            )}
            {openPanel === "comparison" && (
              <ComparisonPanel batch={batch} steps={steps} calcResult={calcResult} t={t} />
            )}
            {openPanel === "tracking" && (
              <TrackingPanel inputLots={inputLots} outputLots={outputLots} t={t} />
            )}
            {openPanel === "excise" && (
              <ExcisePanel exciseSummary={exciseSummary} t={t} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Sub-panels ────────────────────────────────────────────────

type TFunc = ReturnType<typeof useTranslations>;

function RecipePanel({ batch, steps, ingredients, calcResult, t }: { batch: Batch; steps: BatchStep[]; ingredients: RecipeIngredient[] | null; calcResult: RecipeCalculationResult | null; t: TFunc }): React.ReactNode {
  const mashSteps = steps.filter((s) => s.brewPhase === "mashing");
  const boilStep = steps.find((s) => s.stepType === "boil");
  const boilMin = boilStep?.timeMin ?? 60;

  // Calculate total malt weight for percentages
  const malts = ingredients?.filter((i) => i.category === "malt") ?? [];
  const totalMaltG = malts.reduce((sum, i) => sum + Number(i.amountG), 0);

  const hops = ingredients?.filter((i) => i.category === "hop") ?? [];
  const yeasts = ingredients?.filter((i) => i.category === "yeast") ?? [];
  const others = ingredients?.filter(
    (i) => i.category === "fermentable" || i.category === "other"
  ) ?? [];

  // Use calculated values with fallback to batch (design target) fields
  const og = calcResult?.og ?? (batch.recipeOg ? Number(batch.recipeOg) : null);
  const fg = calcResult?.fg ?? (batch.recipeFg ? Number(batch.recipeFg) : null);
  const abv = calcResult?.abv ?? (batch.recipeAbv ? Number(batch.recipeAbv) : null);
  const ibu = calcResult?.ibu ?? (batch.recipeIbu ? Number(batch.recipeIbu) : null);
  const ebc = calcResult?.ebc ?? (batch.recipeEbc ? Number(batch.recipeEbc) : 0);

  // Approximate SRM → hex for a small color swatch
  const ebcColor = ebc > 0
    ? `hsl(${Math.max(0, 40 - ebc * 0.5)}, ${Math.min(100, 60 + ebc)}%, ${Math.max(8, 50 - ebc * 0.6)}%)`
    : undefined;

  return (
    <div className="space-y-4">
      {/* Recipe name */}
      <p className="font-semibold">{batch.recipeName ?? "\u2014"}</p>

      {/* Key values — compact grid */}
      <div className="grid grid-cols-3 gap-2">
        {og != null && (
          <div className="rounded-md border px-2 py-1.5 text-center">
            <p className="text-[10px] uppercase text-muted-foreground leading-none mb-0.5">
              {t("brew.sidebar.recipeOg")}
            </p>
            <p className="text-sm font-bold">{og.toFixed(1)}</p>
          </div>
        )}
        {fg != null && (
          <div className="rounded-md border px-2 py-1.5 text-center">
            <p className="text-[10px] uppercase text-muted-foreground leading-none mb-0.5">
              {t("brew.sidebar.recipeFg")}
            </p>
            <p className="text-sm font-bold">{fg.toFixed(1)}</p>
          </div>
        )}
        {abv != null && (
          <div className="rounded-md border px-2 py-1.5 text-center">
            <p className="text-[10px] uppercase text-muted-foreground leading-none mb-0.5">
              {t("brew.sidebar.recipeAbv")}
            </p>
            <p className="text-sm font-bold">{abv.toFixed(1)}%</p>
          </div>
        )}
        {ibu != null && (
          <div className="rounded-md border px-2 py-1.5 text-center">
            <p className="text-[10px] uppercase text-muted-foreground leading-none mb-0.5">
              {t("brew.sidebar.recipeIbu")}
            </p>
            <p className="text-sm font-bold">{ibu.toFixed(0)}</p>
          </div>
        )}
        {ebc > 0 && (
          <div className="rounded-md border px-2 py-1.5 text-center">
            <p className="text-[10px] uppercase text-muted-foreground leading-none mb-0.5">
              {t("brew.sidebar.recipeEbc")}
            </p>
            <p className="text-sm font-bold flex items-center justify-center gap-1">
              {ebc.toFixed(0)}
              {ebcColor && (
                <span
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: ebcColor }}
                />
              )}
            </p>
          </div>
        )}
        {batch.recipeBatchSizeL && (
          <div className="rounded-md border px-2 py-1.5 text-center">
            <p className="text-[10px] uppercase text-muted-foreground leading-none mb-0.5">
              {t("brew.sidebar.recipeVolume")}
            </p>
            <p className="text-sm font-bold">{Number(batch.recipeBatchSizeL).toFixed(0)} L</p>
          </div>
        )}
      </div>

      {/* Mashing profile */}
      {mashSteps.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
              {t("brew.sidebar.mashProfile")}
            </p>
            <div className="space-y-0.5">
              {mashSteps.map((step) => (
                <div key={step.id} className="flex justify-between text-sm">
                  <span>
                    {step.name}
                    {step.temperatureC && (
                      <span className="text-muted-foreground ml-1">
                        {Number(step.temperatureC).toFixed(0)}°C
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {step.timeMin ?? 0} min
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Boil */}
      <Separator />
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("brew.sidebar.boilMin", { min: boilMin })}
      </p>

      {/* Ingredients */}
      {ingredients && ingredients.length > 0 ? (
        <div className="space-y-3">
          {/* Malts with % */}
          {malts.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                {t("ingredients.category.malt" as Parameters<typeof t>[0])}
              </p>
              <div className="space-y-0.5">
                {malts.map((item) => {
                  const pct = totalMaltG > 0 ? (Number(item.amountG) / totalMaltG) * 100 : 0;
                  return (
                    <div key={item.id} className="flex items-center text-sm gap-1">
                      <span className="flex-1 truncate">{item.itemName}</span>
                      <span className="text-muted-foreground shrink-0">
                        {Number(item.amountG).toFixed(0)} {item.unitSymbol ?? "g"}
                      </span>
                      <span className="text-muted-foreground shrink-0 w-10 text-right text-xs">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hops with addition time */}
          {hops.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                {t("ingredients.category.hop" as Parameters<typeof t>[0])}
              </p>
              <div className="space-y-0.5">
                {hops.map((item) => (
                  <div key={item.id} className="flex items-center text-sm gap-1">
                    <span className="flex-1 truncate">{item.itemName}</span>
                    <span className="text-muted-foreground shrink-0">
                      {Number(item.amountG).toFixed(0)} {item.unitSymbol ?? "g"}
                    </span>
                    {item.useTimeMin != null && (
                      <span className="text-muted-foreground shrink-0 w-14 text-right text-xs">
                        @ {item.useTimeMin} min
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yeast */}
          {yeasts.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                {t("ingredients.category.yeast" as Parameters<typeof t>[0])}
              </p>
              <div className="space-y-0.5">
                {yeasts.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="truncate">{item.itemName}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {Number(item.amountG).toFixed(0)} {item.unitSymbol ?? "g"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other / Fermentable */}
          {others.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                {t("ingredients.category.other" as Parameters<typeof t>[0])}
              </p>
              <div className="space-y-0.5">
                {others.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="truncate">{item.itemName}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {Number(item.amountG).toFixed(0)} {item.unitSymbol ?? "g"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("brew.sidebar.noIngredients")}</p>
      )}
    </div>
  );
}

function VolumesPanel({ batch, calcResult, t }: { batch: Batch; calcResult: RecipeCalculationResult | null; t: TFunc }): React.ReactNode {
  const fmt = (v: number | undefined | null): string =>
    v != null ? `${v.toFixed(1)} L` : "\u2014";

  const water = calcResult?.water;
  const pipeline = calcResult?.pipeline;

  return (
    <div className="space-y-3 text-sm">
      {/* Water section */}
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
          {t("brew.sidebar.volumes")}
        </p>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("brew.sidebar.mashWater")}</span>
            <span>{fmt(water?.mashWaterL)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("brew.sidebar.spargeWater")}</span>
            <span>{fmt(water?.spargeWaterL)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">{t("brew.sidebar.totalWater")}</span>
            <span>{fmt(water?.totalWaterL)}</span>
          </div>
          {water?.grainAbsorptionL != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("brew.sidebar.waterReserve")}</span>
              <span>{fmt(water.grainAbsorptionL)}</span>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Volumes section */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("brew.sidebar.mashVolume")}</span>
          <span>{fmt(water?.mashVolumeL)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("brew.sidebar.preboilVolume")}</span>
          <span>{fmt(pipeline?.preBoilL)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("brew.sidebar.postBoilVolume")}</span>
          <span>{fmt(pipeline?.postBoilL)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span className="text-muted-foreground">{t("brew.sidebar.intoFermenter")}</span>
          <span>{fmt(pipeline?.intoFermenterL)}</span>
        </div>
      </div>

      <Separator />

      {/* Actual */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("brew.sidebar.recipeVolume")}</span>
        <span>{batch.recipeBatchSizeL ? `${Number(batch.recipeBatchSizeL).toFixed(1)} L` : "\u2014"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("brew.brewing.fermenterVolume")}</span>
        <span>{batch.actualVolumeL ? `${Number(batch.actualVolumeL).toFixed(1)} L` : "\u2014"}</span>
      </div>
    </div>
  );
}

const MEASUREMENT_KEYS = [
  "mashWater",
  "spargeWater",
  "preBoilVolume",
  "postBoilVolume",
  "fermenterVolume",
  "ogMeasured",
] as const;

type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

function MeasuredPanel({ batch, measurements, calcResult, t }: { batch: Batch; measurements: BatchMeasurement[]; calcResult: RecipeCalculationResult | null; t: TFunc }): React.ReactNode {
  const [values, setValues] = useState<Record<MeasurementKey, string>>(() => {
    const init: Record<string, string> = {};
    for (const key of MEASUREMENT_KEYS) {
      if (key === "ogMeasured") {
        // OG reads from batch.ogActual (single source of truth)
        init[key] = batch.ogActual ?? "";
      } else {
        const existing = measurements.find((m) => m.notes === key);
        init[key] = existing?.value ?? "";
      }
    }
    return init as Record<MeasurementKey, string>;
  });
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleChange = useCallback(
    (key: MeasurementKey, value: string): void => {
      setValues((prev) => ({ ...prev, [key]: value }));

      if (saveTimers.current[key]) {
        clearTimeout(saveTimers.current[key]);
      }
      saveTimers.current[key] = setTimeout(async () => {
        if (value === "") return;
        try {
          if (key === "ogMeasured") {
            // OG → update batch column (single source of truth)
            await updateBatch(batch.id, { ogActual: value });
          } else {
            // Volume keys → upsert measurement (no duplicates)
            await upsertSidebarMeasurement(batch.id, key, value);
          }
        } catch {
          // Silent — user can retry
        }
      }, 800);
    },
    [batch.id]
  );

  const water = calcResult?.water;
  const pipeline = calcResult?.pipeline;

  const planned: Record<MeasurementKey, number | null> = {
    mashWater: water?.mashWaterL ?? null,
    spargeWater: water?.spargeWaterL ?? null,
    preBoilVolume: pipeline?.preBoilL ?? null,
    postBoilVolume: pipeline?.postBoilL ?? null,
    fermenterVolume: pipeline?.intoFermenterL ?? (batch.recipeBatchSizeL ? Number(batch.recipeBatchSizeL) : null),
    ogMeasured: calcResult?.og ?? (batch.recipeOg ? Number(batch.recipeOg) : null),
  };

  const fmtVal = (v: number | null, decimals = 1): string =>
    v != null ? v.toFixed(decimals) : "\u2014";

  const getDelta = (key: MeasurementKey): { value: number; pct: number; formatted: string } | null => {
    const actual = values[key] ? Number(values[key]) : null;
    const plan = planned[key];
    if (actual == null || plan == null || isNaN(actual)) return null;
    const d = actual - plan;
    const pct = plan !== 0 ? Math.abs(d / plan) * 100 : (d === 0 ? 0 : 100);
    const sign = d > 0 ? "+" : "";
    return { value: d, pct, formatted: `${sign}${d.toFixed(1)}` };
  };

  const deltaColor = (delta: { value: number; pct: number } | null): string => {
    if (delta == null) return "text-muted-foreground";
    if (delta.pct === 0) return "text-green-600";
    if (delta.pct <= 3) return "text-green-600";
    if (delta.pct <= 10) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-1">
      {!calcResult && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{t("brew.sidebar.noCalcResult")}</span>
        </div>
      )}
      {/* Header row */}
      <div className="grid grid-cols-[1fr_60px_70px_55px] gap-1 text-[10px] uppercase text-muted-foreground font-medium pb-1 border-b">
        <span />
        <span className="text-right">{t("brew.brewing.planned")}</span>
        <span className="text-right">{t("brew.brewing.actual")}</span>
        <span className="text-right">{"\u0394"}</span>
      </div>

      {MEASUREMENT_KEYS.map((key) => {
        const delta = getDelta(key);
        const unit = key === "ogMeasured" ? "\u00b0P" : "L";

        return (
          <div key={key} className="grid grid-cols-[1fr_60px_70px_55px] gap-1 items-center py-1 border-b border-border/40 last:border-0">
            <span className="text-xs font-medium leading-tight">
              {t(`brew.brewing.${key}`)}
              <span className="ml-0.5 text-muted-foreground">({unit})</span>
            </span>
            <span className="text-xs text-muted-foreground text-right tabular-nums">
              {fmtVal(planned[key])}
            </span>
            <Input
              type="number"
              step={key === "ogMeasured" ? "0.1" : "1"}
              min={0}
              className="h-7 text-xs text-right tabular-nums px-1"
              placeholder={"\u2014"}
              value={values[key]}
              onChange={(e) => handleChange(key, e.target.value)}
            />
            <span className={cn("text-xs text-right tabular-nums", deltaColor(delta))}>
              {delta ? delta.formatted : "\u2014"}
            </span>
          </div>
        );
      })}

      {/* Other saved measurements from DB */}
      {measurements.filter((m) => !MEASUREMENT_KEYS.includes(m.notes as MeasurementKey)).length > 0 && (
        <>
          <Separator className="my-2" />
          <div className="space-y-2">
            {measurements
              .filter((m) => !MEASUREMENT_KEYS.includes(m.notes as MeasurementKey))
              .map((m) => (
                <div key={m.id} className="text-sm border-b pb-2 last:border-0">
                  <div className="flex justify-between">
                    <span className="font-medium">{m.measurementType}</span>
                    <span className="text-muted-foreground">
                      {m.measuredAt ? new Date(m.measuredAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {m.valuePlato && `${Number(m.valuePlato).toFixed(1)} \u00b0P`}
                    {m.temperatureC && ` \u00b7 ${Number(m.temperatureC).toFixed(1)} \u00b0C`}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function NotesPanel({ notes, t }: { notes: BatchNote[]; t: TFunc }): React.ReactNode {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("brew.sidebar.noNotes")}</p>;
  }
  return (
    <div className="space-y-3">
      {notes.map(n => (
        <div key={n.id} className="text-sm border-b pb-2 last:border-0">
          <p>{n.text}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function ComparisonPanel({ batch, steps, calcResult, t }: { batch: Batch; steps: BatchStep[]; calcResult: RecipeCalculationResult | null; t: TFunc }): React.ReactNode {
  const totalPlannedMin = steps.reduce((sum, s) => sum + (s.timeMin ?? 0), 0);
  const totalActualMin = steps.reduce((sum, s) => sum + (s.actualDurationMin ?? s.timeMin ?? 0), 0);

  const og = calcResult?.og ?? (batch.recipeOg ? Number(batch.recipeOg) : null);
  const fg = calcResult?.fg ?? (batch.recipeFg ? Number(batch.recipeFg) : null);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">OG (°P)</span>
        <span>
          {og != null ? og.toFixed(1) : "\u2014"}
          {" \u2192 "}
          {batch.ogActual ? Number(batch.ogActual).toFixed(1) : "\u2014"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">FG (°P)</span>
        <span>
          {fg != null ? fg.toFixed(1) : "\u2014"}
          {" \u2192 "}
          {batch.fgActual ? Number(batch.fgActual).toFixed(1) : "\u2014"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("brew.sidebar.recipeVolume")} (L)</span>
        <span>
          {batch.recipeBatchSizeL ? Number(batch.recipeBatchSizeL).toFixed(0) : "\u2014"}
          {" \u2192 "}
          {batch.actualVolumeL ? Number(batch.actualVolumeL).toFixed(1) : "\u2014"}
        </span>
      </div>
      <Separator />
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("brew.brewing.totalTime")} (min)</span>
        <span>{totalPlannedMin} \u2192 {totalActualMin}</span>
      </div>
    </div>
  );
}

function TrackingPanel({ inputLots, outputLots, t }: {
  inputLots: BatchInputLot[] | null;
  outputLots: BatchLotEntry[] | null;
  t: TFunc;
}): React.ReactNode {
  const params = useParams();
  const pathname = usePathname();
  const locale = params.locale as string;
  const fromParam = encodeURIComponent(pathname);

  if (!inputLots) {
    return <p className="text-sm text-muted-foreground py-4">Loading...</p>;
  }

  const fmtDate = (d: string): string => {
    try {
      return new Date(d).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "2-digit" });
    } catch { return d; }
  };

  return (
    <div className="space-y-4">
      {/* Input lots (ingredients) */}
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          {t("brew.sidebar.inputLots")}
        </p>
        {inputLots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("brew.sidebar.noInputLots")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-left border-b">
                <th className="pb-1 font-medium">{t("brew.sidebar.receiptDate")}</th>
                <th className="pb-1 font-medium">{t("brew.sidebar.issueDate")}</th>
                <th className="pb-1 font-medium">{t("brew.sidebar.item")}</th>
                <th className="pb-1 font-medium text-right">{t("brew.sidebar.amount")}</th>
                <th className="pb-1 font-medium">{t("brew.sidebar.lot")}</th>
              </tr>
            </thead>
            <tbody>
              {inputLots.map((lot) => (
                <tr key={lot.id} className="border-b border-muted/30">
                  <td className="py-1">
                    {lot.receiptIssueId ? (
                      <Link href={`/${locale}/stock/movements/${lot.receiptIssueId}?from=${fromParam}`} className="text-primary hover:underline">
                        {fmtDate(lot.receiptDate)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1">
                    <Link href={`/${locale}/stock/movements/${lot.issueId}?from=${fromParam}`} className="text-primary hover:underline">
                      {fmtDate(lot.issueDate)}
                    </Link>
                  </td>
                  <td className="py-1">{lot.itemName}</td>
                  <td className="py-1 text-right tabular-nums">{lot.quantity} {lot.unit}</td>
                  <td className="py-1 text-muted-foreground">{lot.lotNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Separator />

      {/* Output lots (beer) */}
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          {t("brew.sidebar.outputLots")}
        </p>
        {!outputLots || outputLots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("brew.sidebar.noOutputLots")}</p>
        ) : (
          <div className="space-y-1">
            {outputLots.map((lot) => (
              <div key={lot.id} className="text-sm flex justify-between">
                <span>{lot.itemName}</span>
                <span className="text-muted-foreground">
                  {lot.amount} {lot.unit}
                  {lot.lotNumber && ` \u00b7 ${lot.lotNumber}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExcisePanel({ exciseSummary, t }: { exciseSummary: ExciseSummary | null; t: TFunc }): React.ReactNode {
  if (!exciseSummary) {
    return <p className="text-sm text-muted-foreground py-4">Loading...</p>;
  }

  const fmt = (n: number): string => n.toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Translate excise movement type labels
  const labelFor = (m: { phase: string; label: string }): string => {
    try { return t(`brew.sidebar.exciseType.${m.phase}` as Parameters<typeof t>[0]); } catch { return m.label; }
  };

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("brew.sidebar.plannedTax")}</span>
          <span>{fmt(exciseSummary.plannedTaxCzk)} {t("brew.sidebar.taxCzk")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("brew.sidebar.currentTax")}</span>
          <span>{fmt(exciseSummary.currentTaxCzk)} {t("brew.sidebar.taxCzk")}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>{t("brew.sidebar.taxDiff")}</span>
          <span className={exciseSummary.diffCzk < 0 ? "text-green-600" : "text-destructive"}>
            {fmt(exciseSummary.diffCzk)} {t("brew.sidebar.taxCzk")}
          </span>
        </div>
      </div>

      {exciseSummary.taxPoint === "release" && exciseSummary.plannedTaxCzk === 0 && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          {t("brew.sidebar.taxPointRelease")}
        </p>
      )}

      <Separator />

      {/* Movements */}
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          {t("brew.sidebar.exciseMovements")}
        </p>
        {exciseSummary.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("brew.sidebar.noExciseMovements")}</p>
        ) : (
          <div className="space-y-1">
            {exciseSummary.movements.map((m, idx) => (
              <div key={idx} className="text-sm flex justify-between">
                <span className="text-muted-foreground">{labelFor(m)}</span>
                <span>{m.volumeL > 0 ? "+" : ""}{m.volumeL.toFixed(1)} L · {fmt(m.taxCzk)} {t("brew.sidebar.taxCzk")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Current state */}
      <div className="text-sm flex justify-between font-medium">
        <span>{t("brew.sidebar.exciseCurrentVolume")}</span>
        <span>{(exciseSummary.currentVolumeHl * 100).toFixed(1)} L</span>
      </div>
    </div>
  );
}
