"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Check, AlertTriangle, X, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSidebar } from "@/components/layout/sidebar-context";
import type { VolumePipeline, WaterCalculation } from "../types";
import { calculateWaterDetail } from "../utils";

// ── Formatting helpers ──────────────────────────────────────────

/** Format volume: 1 decimal, Czech thousands separator (e.g. 1 234,5) */
function fmtVol(v: number): string {
  return v.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Format weight (kg): 1 decimal, Czech thousands separator */
const fmtKg = fmtVol;

/** Format currency: integer, Czech thousands separator (e.g. 5 989) */
function fmtCost(v: number): string {
  return Math.round(v).toLocaleString("cs-CZ");
}

// ── Props ────────────────────────────────────────────────────────

export interface RecipeFeedbackSidebarProps {
  // Design targets (from sliders)
  designOg: number;
  designIbu: number;
  designEbc: number;
  // Calculated values (from ingredients via calculateAll)
  calcOg: number;
  calcIbu: number;
  calcEbc: number;
  // Malt plan
  maltPlanKg: number;
  maltActualKg: number;
  // Pipeline
  pipeline: VolumePipeline;
  // Water
  water: WaterCalculation;
  waterParams: {
    maltKg: number;
    waterPerKgMalt: number;
    grainAbsorptionLPerKg: number;
    preBoilL: number;
  };
  // Cost
  totalCost: number;
  costPerLiter: number;
  // Optional class override (for Sheet variant)
  className?: string;
}

// ── Comparison helpers ──────────────────────────────────────────

type ComparisonStatus = "good" | "warn" | "bad" | "neutral";

function getComparisonStatus(
  design: number,
  calc: number
): ComparisonStatus {
  if (design === 0) return "neutral";
  const pct = Math.abs(calc - design) / design * 100;
  if (pct <= 5) return "good";
  if (pct <= 15) return "warn";
  return "bad";
}

function StatusIcon({
  status,
}: {
  status: ComparisonStatus;
}): React.ReactNode {
  if (status === "neutral") return null;
  if (status === "good") {
    return <Check className="size-3.5 shrink-0 text-green-600" />;
  }
  if (status === "warn") {
    return <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />;
  }
  return <X className="size-3.5 shrink-0 text-red-500" />;
}

// ── Comparison row ──────────────────────────────────────────────

interface ComparisonRowDef {
  label: string;
  designValue: string;
  calcValue: string;
  status: ComparisonStatus;
}

function ComparisonRow({ row }: { row: ComparisonRowDef }): React.ReactNode {
  const textColor =
    row.status === "good"
      ? "text-green-600"
      : row.status === "warn"
        ? "text-amber-500"
        : row.status === "bad"
          ? "text-red-500"
          : "";

  return (
    <div className={cn("flex items-center justify-between text-xs", textColor)}>
      <span className={cn("w-16", !textColor && "text-muted-foreground")}>
        {row.label}
      </span>
      <span className="w-12 text-right tabular-nums">{row.designValue}</span>
      <span className="w-12 text-right tabular-nums font-semibold">
        {row.calcValue}
      </span>
      <span className="w-5 flex justify-center">
        <StatusIcon status={row.status} />
      </span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────

export function RecipeFeedbackSidebar({
  designOg,
  designIbu,
  designEbc,
  calcOg,
  calcIbu,
  calcEbc,
  maltPlanKg,
  maltActualKg,
  pipeline,
  water,
  waterParams,
  totalCost,
  costPerLiter,
  className,
}: RecipeFeedbackSidebarProps): React.ReactNode {
  const t = useTranslations("recipes");
  const { collapsed: sidebarCollapsed } = useSidebar();

  // Comparison rows — OG, IBU, EBC
  const rows: ComparisonRowDef[] = useMemo(
    () => [
      {
        label: t("designer.feedback.og"),
        designValue: designOg > 0 ? designOg.toFixed(1) : "—",
        calcValue: calcOg > 0 ? calcOg.toFixed(1) : "—",
        status: getComparisonStatus(designOg, calcOg),
      },
      {
        label: t("designer.feedback.ibu"),
        designValue: designIbu.toFixed(0),
        calcValue: calcIbu.toFixed(0),
        status: getComparisonStatus(designIbu, calcIbu),
      },
      {
        label: t("designer.feedback.ebc"),
        designValue: designEbc.toFixed(0),
        calcValue: calcEbc.toFixed(0),
        status: getComparisonStatus(designEbc, calcEbc),
      },
    ],
    [t, designOg, designIbu, designEbc, calcOg, calcIbu, calcEbc]
  );

  // Malt diff
  const maltDiff = maltActualKg - maltPlanKg;
  const maltDiffPct =
    maltPlanKg > 0 ? (Math.abs(maltDiff) / maltPlanKg) * 100 : 0;
  const maltDiffColorClass =
    maltPlanKg <= 0
      ? "text-muted-foreground"
      : maltDiffPct < 2
        ? "text-green-600"
        : maltDiffPct <= 5
          ? "text-amber-500"
          : "text-red-500";

  return (
    <div className={cn(
      "w-72 shrink-0 border-l bg-muted/30 p-4 space-y-4 overflow-y-auto hidden",
      sidebarCollapsed ? "lg:block" : "xl:block",
      className,
    )}>
      {/* Section 1: Design vs Reality */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.sidebar.title")}
        </h3>

        {/* Column headers */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="w-16" />
          <span className="w-12 text-right">
            {t("designer.sidebar.designColumn")}
          </span>
          <span className="w-12 text-right">
            {t("designer.sidebar.recipeColumn")}
          </span>
          <span className="w-5" />
        </div>

        {/* Parameter rows */}
        <div className="space-y-1">
          {rows.map((row) => (
            <ComparisonRow key={row.label} row={row} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Section 2: Malt plan vs actual */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.feedback.maltPlan")}
        </h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>{t("designer.cards.plan")}:</span>
            <span>{fmtKg(maltPlanKg)} kg</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.maltActual")}:</span>
            <span>{fmtKg(maltActualKg)} kg</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.maltDiff")}:</span>
            <span className={maltDiffColorClass}>
              {maltDiff > 0 ? "+" : ""}
              {fmtKg(maltDiff)} kg
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Section 3: Pipeline */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.feedback.pipeline")}
        </h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>{t("calculation.pipeline.preBoil")}:</span>
            <span>{fmtVol(pipeline.preBoilL)} L</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span className="pl-2">– {t("designer.feedback.evaporation")}:</span>
            <span>{fmtVol(pipeline.losses.evaporationL)} L</span>
          </div>
          <div className="flex justify-between">
            <span>{t("calculation.pipeline.postBoil")}:</span>
            <span>{fmtVol(pipeline.postBoilL)} L</span>
          </div>
          <div className="flex justify-between">
            <span>{t("calculation.pipeline.intoFermenter")}:</span>
            <span>{fmtVol(pipeline.intoFermenterL)} L</span>
          </div>
          <div className="flex justify-between">
            <span>{t("calculation.pipeline.finishedBeer")}:</span>
            <span className="font-semibold">
              {fmtVol(pipeline.finishedBeerL)} L
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Section 4: Water */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
          {t("designer.feedback.water")}
          <WaterInfoButton {...waterParams} />
        </h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>{t("designer.feedback.mashWater")}:</span>
            <span>{fmtVol(water.mashWaterL)} L</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span className="pl-2">{t("designer.feedback.mashVolume")}:</span>
            <span>{fmtVol(water.mashVolumeL)} L</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span className="pl-2">– {t("designer.feedback.grainAbsorption")}:</span>
            <span>{fmtVol(water.grainAbsorptionL)} L</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.spargeWater")}:</span>
            <span>{fmtVol(water.spargeWaterL)} L</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>{t("designer.feedback.totalWater")}:</span>
            <span>{fmtVol(water.totalWaterL)} L</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Section 5: Cost */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.feedback.cost")}
        </h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>{t("designer.feedback.costTotal")}:</span>
            <span>{fmtCost(totalCost)} Kč</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.costPerLiter")}:</span>
            <span>{fmtCost(costPerLiter)} Kč</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Water Info Modal ──────────────────────────────────────────────

function WaterInfoButton({
  maltKg,
  waterPerKgMalt,
  grainAbsorptionLPerKg,
  preBoilL,
}: {
  maltKg: number;
  waterPerKgMalt: number;
  grainAbsorptionLPerKg: number;
  preBoilL: number;
}): React.ReactNode {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full size-5 hover:bg-muted-foreground/20 transition-colors"
        >
          <Info className="size-3.5 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <WaterDetailTitle />
          </DialogTitle>
        </DialogHeader>
        <WaterDetailContent
          maltKg={maltKg}
          waterPerKgMalt={waterPerKgMalt}
          grainAbsorptionLPerKg={grainAbsorptionLPerKg}
          preBoilL={preBoilL}
        />
      </DialogContent>
    </Dialog>
  );
}

function WaterDetailTitle(): React.ReactNode {
  const t = useTranslations("recipes");
  return <>{t("designer.feedback.waterDetailTitle")}</>;
}

function WaterDetailContent({
  maltKg,
  waterPerKgMalt,
  grainAbsorptionLPerKg,
  preBoilL,
}: {
  maltKg: number;
  waterPerKgMalt: number;
  grainAbsorptionLPerKg: number;
  preBoilL: number;
}): React.ReactNode {
  const t = useTranslations("recipes");
  const d = useMemo(
    () => calculateWaterDetail(maltKg, preBoilL, waterPerKgMalt, grainAbsorptionLPerKg),
    [maltKg, preBoilL, waterPerKgMalt, grainAbsorptionLPerKg]
  );

  return (
    <div className="space-y-4 text-sm">
      {/* Input parameters */}
      <div className="rounded-lg border p-3 bg-muted/30 space-y-1 font-mono text-xs">
        <div>{t("designer.feedback.waterDetailMaltKg")} = {d.maltKg.toFixed(2)} kg</div>
        <div>{t("designer.feedback.waterDetailWaterRatio")} = {d.waterPerKgMalt} L/kg</div>
        <div>{t("designer.feedback.waterDetailGrainAbsorption")} = {d.grainAbsorptionLPerKg} L/kg</div>
        <div>{t("designer.feedback.waterDetailGrainDisplacement")} = {d.grainDisplacementLPerKg} L/kg</div>
        <div>{t("designer.feedback.waterDetailPreBoil")} = {d.preBoilL.toFixed(1)} L</div>
      </div>

      {/* Formulas */}
      <div className="text-xs text-muted-foreground">
        <div className="font-medium mb-1">{t("designer.feedback.waterDetailFormula")}:</div>
        <div className="font-mono space-y-1">
          <div>V<sub>mash</sub> = M<sub>kg</sub> × R<sub>water</sub></div>
          <div>V<sub>grain</sub> = M<sub>kg</sub> × D<sub>grain</sub></div>
          <div>V<sub>mashTun</sub> = V<sub>mash</sub> + V<sub>grain</sub></div>
          <div>V<sub>absorbed</sub> = M<sub>kg</sub> × A<sub>grain</sub></div>
          <div>V<sub>afterMash</sub> = V<sub>mash</sub> − V<sub>absorbed</sub></div>
          <div>V<sub>sparge</sub> = V<sub>preBoil</sub> − V<sub>afterMash</sub></div>
          <div>V<sub>total</sub> = V<sub>mash</sub> + V<sub>sparge</sub></div>
        </div>
      </div>

      {/* Step-by-step */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="font-medium">{t("designer.feedback.waterDetailSteps")}</div>
        <div className="font-mono text-xs space-y-1 bg-muted/50 rounded p-2">
          <div>
            V<sub>mash</sub> = {d.maltKg.toFixed(2)} × {d.waterPerKgMalt} = <span className="font-medium text-foreground">{d.mashWaterL.toFixed(1)} L</span>
          </div>
          <div className="border-t pt-1 mt-1">
            V<sub>grain</sub> = {d.maltKg.toFixed(2)} × {d.grainDisplacementLPerKg} = <span className="font-medium text-foreground">{d.grainVolumeL.toFixed(1)} L</span>
          </div>
          <div>
            V<sub>mashTun</sub> = {d.mashWaterL.toFixed(1)} + {d.grainVolumeL.toFixed(1)} = <span className="font-medium text-foreground">{d.mashVolumeL.toFixed(1)} L</span>
          </div>
          <div className="border-t pt-1 mt-1">
            V<sub>absorbed</sub> = {d.maltKg.toFixed(2)} × {d.grainAbsorptionLPerKg} = <span className="font-medium text-foreground">{d.grainAbsorptionL.toFixed(1)} L</span>
          </div>
          <div>
            V<sub>afterMash</sub> = {d.mashWaterL.toFixed(1)} − {d.grainAbsorptionL.toFixed(1)} = <span className="font-medium text-foreground">{d.volumeAfterMashL.toFixed(1)} L</span>
          </div>
          <div className="border-t pt-1 mt-1">
            V<sub>sparge</sub> = {d.preBoilL.toFixed(1)} − {d.volumeAfterMashL.toFixed(1)} = <span className="font-medium text-foreground">{d.spargeWaterL.toFixed(1)} L</span>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-lg border-2 border-primary/30 p-3 font-mono text-sm">
        <span className="font-medium">
          {t("designer.feedback.waterDetailResult")} = {d.mashWaterL.toFixed(1)} + {d.spargeWaterL.toFixed(1)} = <span className="text-primary text-base">{d.totalWaterL.toFixed(1)} L</span>
        </span>
      </div>
    </div>
  );
}
