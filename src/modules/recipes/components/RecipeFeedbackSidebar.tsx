"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import type { BeerStyle, VolumePipeline } from "../types";

// ── Props ────────────────────────────────────────────────────────

interface RecipeFeedbackSidebarProps {
  recipeName: string;
  styleName: string | null;
  batchSizeL: number;
  systemName: string | null;
  og: number;
  fg: number;
  abv: number;
  ibu: number;
  ebc: number;
  style: BeerStyle | null;
  maltActualKg: number;
  maltPlanKg: number;
  pipeline: VolumePipeline | null;
  waterRequiredL: number;
  totalCost: number;
  costPerLiter: number;
}

// ── Range helpers ────────────────────────────────────────────────

type RangeStatus = "in_range" | "slightly_off" | "out_of_range" | "no_style";

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

function formatRange(
  minStr: string | null,
  maxStr: string | null
): string {
  const lo = minStr != null ? parseFloat(minStr) : null;
  const hi = maxStr != null ? parseFloat(maxStr) : null;
  if (lo != null && hi != null) return `${lo}–${hi}`;
  if (lo != null) return `${lo}+`;
  if (hi != null) return `≤${hi}`;
  return "—";
}

// ── Parameter row ────────────────────────────────────────────────

interface ParamDef {
  label: string;
  value: number;
  displayValue: string;
  minStr: string | null;
  maxStr: string | null;
}

function ParameterRow({
  param,
  style,
}: {
  param: ParamDef;
  style: BeerStyle | null;
}): React.ReactNode {
  const status = style
    ? getRangeStatus(param.value, param.minStr, param.maxStr)
    : "no_style";

  const hasRange = param.minStr != null || param.maxStr != null;

  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5">
        {style && hasRange && (
          status === "in_range" ? (
            <CheckCircle className="size-3.5 shrink-0 text-green-600" />
          ) : (
            <AlertCircle
              className={cn(
                "size-3.5 shrink-0",
                status === "slightly_off" ? "text-amber-500" : "text-red-500"
              )}
            />
          )
        )}
        <span className="text-muted-foreground">{param.label}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-semibold">{param.displayValue}</span>
        {style && hasRange && (
          <span className="text-muted-foreground">
            / {formatRange(param.minStr, param.maxStr)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────

export function RecipeFeedbackSidebar({
  recipeName,
  styleName,
  batchSizeL,
  systemName,
  og,
  fg,
  abv,
  ibu,
  ebc,
  style,
  maltActualKg,
  maltPlanKg,
  pipeline,
  waterRequiredL,
  totalCost,
  costPerLiter,
}: RecipeFeedbackSidebarProps): React.ReactNode {
  const t = useTranslations("recipes");

  const parameters: ParamDef[] = useMemo(
    () => [
      {
        label: t("designer.feedback.og"),
        value: og,
        displayValue: og.toFixed(1),
        minStr: style?.ogMin ?? null,
        maxStr: style?.ogMax ?? null,
      },
      {
        label: t("designer.feedback.fg"),
        value: fg,
        displayValue: fg.toFixed(1),
        minStr: style?.fgMin ?? null,
        maxStr: style?.fgMax ?? null,
      },
      {
        label: t("designer.feedback.abv"),
        value: abv,
        displayValue: `${abv.toFixed(1)}%`,
        minStr: style?.abvMin ?? null,
        maxStr: style?.abvMax ?? null,
      },
      {
        label: t("designer.feedback.ibu"),
        value: ibu,
        displayValue: ibu.toFixed(0),
        minStr: style?.ibuMin ?? null,
        maxStr: style?.ibuMax ?? null,
      },
      {
        label: t("designer.feedback.ebc"),
        value: ebc,
        displayValue: ebc.toFixed(0),
        minStr: style?.ebcMin ?? null,
        maxStr: style?.ebcMax ?? null,
      },
    ],
    [t, og, fg, abv, ibu, ebc, style]
  );

  const maltDiff = maltActualKg - maltPlanKg;
  const maltDiffPct = maltPlanKg > 0 ? Math.abs(maltDiff) / maltPlanKg * 100 : 0;
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
      {/* Section 1: Target */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.target.title")}
        </h3>
        <div className="text-xs space-y-1 text-muted-foreground">
          <div>
            {t("designer.feedback.target")}:{" "}
            {styleName ?? t("designer.target.noStyle")}
          </div>
          <div>
            {t("form.batchSize")}: {batchSizeL} L
          </div>
          <div>{systemName ?? t("designer.target.noSystem")}</div>
        </div>
      </div>

      <Separator />

      {/* Section 2: Parameters with range status */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.calculation.parametersTitle")}
        </h3>
        <div className="space-y-1.5">
          {parameters.map((param) => (
            <ParameterRow key={param.label} param={param} style={style} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Section 3: Malt plan vs actual */}
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

      {/* Section 4: Pipeline */}
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

      {/* Section 5: Water */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.feedback.water")}
        </h3>
        <div className="text-xs">
          {t("designer.feedback.waterRequired")}: {waterRequiredL.toFixed(0)} L
        </div>
      </div>

      <Separator />

      {/* Section 6: Cost */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t("designer.feedback.cost")}
        </h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>{t("designer.feedback.costTotal")}:</span>
            <span>{totalCost.toFixed(0)} Kč</span>
          </div>
          <div className="flex justify-between">
            <span>{t("designer.feedback.costPerLiter")}:</span>
            <span>{costPerLiter.toFixed(2)} Kč</span>
          </div>
        </div>
      </div>
    </div>
  );
}
