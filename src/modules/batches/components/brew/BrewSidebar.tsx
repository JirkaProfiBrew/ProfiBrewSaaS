"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  ScrollText,
  Droplets,
  Ruler,
  StickyNote,
  BarChart3,
  ArrowLeftRight,
  Landmark,
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type {
  Batch,
  BatchStep,
  BatchMeasurement,
  BatchNote,
  BatchLotEntry,
  ExciseSummary,
  RecipeIngredient,
} from "../../types";
import {
  getBatchLotTracking,
  getBatchExciseSummary,
  getRecipeIngredients,
} from "../../actions";

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
}

export function BrewSidebar({
  batch,
  steps,
  measurements,
  notes,
}: BrewSidebarProps): React.ReactNode {
  const t = useTranslations("batches");
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  // Lazy-loaded data for tracking and excise panels
  const [lotEntries, setLotEntries] = useState<BatchLotEntry[] | null>(null);
  const [exciseSummary, setExciseSummary] = useState<ExciseSummary | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[] | null>(null);

  // Load data when panels open
  useEffect(() => {
    if (openPanel === "tracking" && lotEntries === null) {
      getBatchLotTracking(batch.id).then(setLotEntries);
    }
    if (openPanel === "excise" && exciseSummary === null) {
      getBatchExciseSummary(batch.id).then(setExciseSummary);
    }
    if (openPanel === "recipe" && ingredients === null && batch.recipeId) {
      getRecipeIngredients(batch.recipeId).then(setIngredients);
    }
  }, [openPanel, batch.id, batch.recipeId, lotEntries, exciseSummary, ingredients]);

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
              <RecipePanel batch={batch} ingredients={ingredients} t={t} />
            )}
            {openPanel === "volumes" && (
              <VolumesPanel batch={batch} t={t} />
            )}
            {openPanel === "measured" && (
              <MeasuredPanel measurements={measurements} t={t} />
            )}
            {openPanel === "notes" && (
              <NotesPanel notes={notes} t={t} />
            )}
            {openPanel === "comparison" && (
              <ComparisonPanel batch={batch} steps={steps} t={t} />
            )}
            {openPanel === "tracking" && (
              <TrackingPanel lotEntries={lotEntries} t={t} />
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

function RecipePanel({ batch, ingredients, t }: { batch: Batch; ingredients: RecipeIngredient[] | null; t: TFunc }): React.ReactNode {
  return (
    <div className="space-y-3">
      <p className="font-medium">{batch.recipeName ?? "\u2014"}</p>
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {batch.recipeOg && <span>{t("brew.sidebar.recipeOg")} {Number(batch.recipeOg).toFixed(1)}\u00b0P</span>}
        {batch.recipeIbu && <span>{t("brew.sidebar.recipeIbu")} {Number(batch.recipeIbu).toFixed(0)}</span>}
        {batch.recipeEbc && <span>{t("brew.sidebar.recipeEbc")} {Number(batch.recipeEbc).toFixed(0)}</span>}
        {batch.recipeBatchSizeL && <span>{t("brew.sidebar.recipeVolume")} {Number(batch.recipeBatchSizeL).toFixed(0)} L</span>}
      </div>
      {ingredients && ingredients.length > 0 && (
        <>
          <Separator />
          {["malt", "hop", "yeast", "adjunct", "other"].map(cat => {
            const items = ingredients.filter(i => i.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {t(`ingredients.category.${cat}` as Parameters<typeof t>[0])}
                </p>
                {items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.itemName}</span>
                    <span className="text-muted-foreground">{item.amountG} {item.unitSymbol ?? "g"}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function VolumesPanel({ batch, t }: { batch: Batch; t: TFunc }): React.ReactNode {
  return (
    <div className="space-y-2 text-sm">
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

function MeasuredPanel({ measurements, t }: { measurements: BatchMeasurement[]; t: TFunc }): React.ReactNode {
  if (measurements.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("brew.sidebar.noMeasurements")}</p>;
  }
  return (
    <div className="space-y-2">
      {measurements.map(m => (
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
            {m.notes && ` \u2014 ${m.notes}`}
          </div>
        </div>
      ))}
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

function ComparisonPanel({ batch, steps, t }: { batch: Batch; steps: BatchStep[]; t: TFunc }): React.ReactNode {
  const totalPlannedMin = steps.reduce((sum, s) => sum + (s.timeMin ?? 0), 0);
  const totalActualMin = steps.reduce((sum, s) => sum + (s.actualDurationMin ?? s.timeMin ?? 0), 0);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">OG (\u00b0P)</span>
        <span>
          {batch.recipeOg ? Number(batch.recipeOg).toFixed(1) : "\u2014"}
          {" \u2192 "}
          {batch.ogActual ? Number(batch.ogActual).toFixed(1) : "\u2014"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">FG (\u00b0P)</span>
        <span>
          {batch.recipeFg ? Number(batch.recipeFg).toFixed(1) : "\u2014"}
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

function TrackingPanel({ lotEntries, t }: { lotEntries: BatchLotEntry[] | null; t: TFunc }): React.ReactNode {
  if (!lotEntries) {
    return <p className="text-sm text-muted-foreground py-4">Loading...</p>;
  }

  const inputLots = lotEntries.filter(e => e.direction === "in");
  const outputLots = lotEntries.filter(e => e.direction === "out");

  return (
    <div className="space-y-4">
      {/* Input lots */}
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          {t("brew.sidebar.inputLots")}
        </p>
        {inputLots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("brew.sidebar.noInputLots")}</p>
        ) : (
          <div className="space-y-1">
            {inputLots.map(lot => (
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

      <Separator />

      {/* Output lots */}
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          {t("brew.sidebar.outputLots")}
        </p>
        {outputLots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("brew.sidebar.noOutputLots")}</p>
        ) : (
          <div className="space-y-1">
            {outputLots.map(lot => (
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
                <span className="text-muted-foreground">{m.label}</span>
                <span>{m.volumeL > 0 ? "+" : ""}{m.volumeL.toFixed(1)} L \u00b7 {fmt(m.taxCzk)} {t("brew.sidebar.taxCzk")}</span>
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
