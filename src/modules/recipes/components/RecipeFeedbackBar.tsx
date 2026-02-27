"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { BeerStyle } from "../types";

// ── Props ────────────────────────────────────────────────────────

interface RecipeFeedbackBarProps {
  og: number;
  ibu: number;
  ebc: number;
  abv: number;
  maltActualKg: number;
  maltPlanKg: number;
  style: BeerStyle | null;
}

// ── Color helpers ────────────────────────────────────────────────

type RangeStatus = "in_range" | "slightly_off" | "out_of_range" | "no_style";

/**
 * Determine whether a value falls within / near / far from a style range.
 * "Near" means within 10% of the range span outside the bounds.
 */
function getRangeStatus(
  value: number,
  minStr: string | null,
  maxStr: string | null
): RangeStatus {
  if (minStr == null && maxStr == null) return "no_style";

  const lo = minStr != null ? parseFloat(minStr) : -Infinity;
  const hi = maxStr != null ? parseFloat(maxStr) : Infinity;

  if (isNaN(lo) && isNaN(hi)) return "no_style";

  const effectiveLo = isNaN(lo) ? -Infinity : lo;
  const effectiveHi = isNaN(hi) ? Infinity : hi;

  if (value >= effectiveLo && value <= effectiveHi) return "in_range";

  // 10% tolerance based on range span (fallback to 10% of value if range is open)
  const span =
    effectiveLo !== -Infinity && effectiveHi !== Infinity
      ? effectiveHi - effectiveLo
      : Math.abs(value) || 1;
  const tolerance = span * 0.1;

  if (
    value >= effectiveLo - tolerance &&
    value <= effectiveHi + tolerance
  ) {
    return "slightly_off";
  }

  return "out_of_range";
}

/**
 * Determine malt status based on percentage difference.
 */
function getMaltStatus(actual: number, plan: number): RangeStatus {
  if (plan <= 0) return "no_style";
  const pctDiff = Math.abs(actual - plan) / plan * 100;
  if (pctDiff < 2) return "in_range";
  if (pctDiff <= 5) return "slightly_off";
  return "out_of_range";
}

function statusToColorClass(status: RangeStatus): string {
  switch (status) {
    case "in_range":
      return "bg-green-500";
    case "slightly_off":
      return "bg-amber-500";
    case "out_of_range":
      return "bg-red-500";
    case "no_style":
      return "bg-slate-400";
  }
}

/**
 * Calculate progress bar width percentage.
 * Width is value / max of the style range, capped at 100%.
 * If no range, show 50% as a neutral indicator.
 */
function getProgressPct(
  value: number,
  maxStr: string | null
): number {
  if (maxStr == null) return 50;
  const max = parseFloat(maxStr);
  if (isNaN(max) || max <= 0) return 50;
  return Math.min((value / max) * 100, 100);
}

// ── Metric definition ────────────────────────────────────────────

interface MetricDef {
  key: string;
  value: number;
  displayValue: string;
  status: RangeStatus;
  pct: number;
}

// ── Component ────────────────────────────────────────────────────

export function RecipeFeedbackBar({
  og,
  ibu,
  ebc,
  abv,
  maltActualKg,
  maltPlanKg,
  style,
}: RecipeFeedbackBarProps): React.ReactNode {
  const t = useTranslations("recipes");

  const metrics: MetricDef[] = useMemo(() => {
    return [
      {
        key: "og",
        value: og,
        displayValue: og.toFixed(1),
        status: style
          ? getRangeStatus(og, style.ogMin, style.ogMax)
          : "no_style" as RangeStatus,
        pct: style ? getProgressPct(og, style.ogMax) : 50,
      },
      {
        key: "ibu",
        value: ibu,
        displayValue: ibu.toFixed(0),
        status: style
          ? getRangeStatus(ibu, style.ibuMin, style.ibuMax)
          : "no_style" as RangeStatus,
        pct: style ? getProgressPct(ibu, style.ibuMax) : 50,
      },
      {
        key: "ebc",
        value: ebc,
        displayValue: ebc.toFixed(0),
        status: style
          ? getRangeStatus(ebc, style.ebcMin, style.ebcMax)
          : "no_style" as RangeStatus,
        pct: style ? getProgressPct(ebc, style.ebcMax) : 50,
      },
      {
        key: "abv",
        value: abv,
        displayValue: `${abv.toFixed(1)}%`,
        status: style
          ? getRangeStatus(abv, style.abvMin, style.abvMax)
          : "no_style" as RangeStatus,
        pct: style ? getProgressPct(abv, style.abvMax) : 50,
      },
      {
        key: "malt",
        value: maltActualKg,
        displayValue: `${maltActualKg.toFixed(1)} kg`,
        status: getMaltStatus(maltActualKg, maltPlanKg),
        pct: maltPlanKg > 0 ? Math.min((maltActualKg / maltPlanKg) * 100, 100) : 50,
      },
    ];
  }, [og, ibu, ebc, abv, maltActualKg, maltPlanKg, style]);

  const labelMap: Record<string, string> = useMemo(
    () => ({
      og: t("designer.feedback.og"),
      ibu: t("designer.feedback.ibu"),
      ebc: t("designer.feedback.ebc"),
      abv: t("designer.feedback.abv"),
      malt: t("designer.feedback.maltPlan"),
    }),
    [t]
  );

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-2">
      <div className="flex items-center gap-6 overflow-x-auto">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            className="flex items-center gap-2 min-w-0"
          >
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {labelMap[metric.key]}
            </span>
            <div className="relative h-2 w-20 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", statusToColorClass(metric.status))}
                style={{ width: `${metric.pct}%` }}
              />
            </div>
            <span className="text-xs font-semibold whitespace-nowrap">
              {metric.displayValue}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
