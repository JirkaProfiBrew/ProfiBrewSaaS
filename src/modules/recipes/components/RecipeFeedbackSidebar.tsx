"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Check, AlertTriangle, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

// ── Props ────────────────────────────────────────────────────────

interface RecipeFeedbackSidebarProps {
  // Design targets (from sliders)
  designIbu: number;
  designEbc: number;
  // Calculated values (from ingredients via calculateAll)
  calcIbu: number;
  calcEbc: number;
  // Malt plan
  maltPlanKg: number;
  maltActualKg: number;
  // Pipeline
  pipeline: {
    preBoilL: number;
    postBoilL: number;
    intoFermenterL: number;
    finishedBeerL: number;
  } | null;
  // Water
  waterRequiredL: number;
  // Cost
  totalCost: number;
  costPerLiter: number;
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
  designIbu,
  designEbc,
  calcIbu,
  calcEbc,
  maltPlanKg,
  maltActualKg,
  pipeline,
  waterRequiredL,
  totalCost,
  costPerLiter,
}: RecipeFeedbackSidebarProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Comparison rows — only IBU and EBC (OG/FG/ABV not influenced by recipe ingredients)
  const rows: ComparisonRowDef[] = useMemo(
    () => [
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
    [t, designIbu, designEbc, calcIbu, calcEbc]
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
    <div className="w-72 shrink-0 border-l bg-muted/30 p-4 space-y-4 overflow-y-auto hidden xl:block">
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
            <span>{maltPlanKg.toFixed(1)} kg</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.maltActual")}:</span>
            <span>{maltActualKg.toFixed(1)} kg</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.maltDiff")}:</span>
            <span className={maltDiffColorClass}>
              {maltDiff > 0 ? "+" : ""}
              {maltDiff.toFixed(1)} kg
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Section 3: Pipeline */}
      {pipeline && (
        <>
          <div>
            <h3 className="text-sm font-semibold mb-2">
              {t("designer.feedback.pipeline")}
            </h3>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span>{t("calculation.pipeline.preBoil")}:</span>
                <span>{pipeline.preBoilL.toFixed(1)} L</span>
              </div>
              <div className="flex justify-between">
                <span>{t("calculation.pipeline.postBoil")}:</span>
                <span>{pipeline.postBoilL.toFixed(1)} L</span>
              </div>
              <div className="flex justify-between">
                <span>{t("calculation.pipeline.intoFermenter")}:</span>
                <span>{pipeline.intoFermenterL.toFixed(1)} L</span>
              </div>
              <div className="flex justify-between">
                <span>{t("calculation.pipeline.finishedBeer")}:</span>
                <span className="font-semibold">
                  {pipeline.finishedBeerL.toFixed(1)} L
                </span>
              </div>
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* Section 4: Water */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.feedback.water")}
        </h3>
        <div className="text-xs">
          {t("designer.feedback.waterRequired")}: {waterRequiredL.toFixed(0)} L
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
            <span>{totalCost.toFixed(0)} K\u010D</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.costPerLiter")}:</span>
            <span>{costPerLiter.toFixed(2)} K\u010D</span>
          </div>
        </div>
      </div>
    </div>
  );
}
