"use client";

import React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

import type { BrewStepPreviewItem } from "../../types";

// ── Phase colors ────────────────────────────────────────────────

const PHASE_COLORS: Record<string, { border: string; bg: string }> = {
  preparation: { border: "border-l-gray-400", bg: "bg-gray-50" },
  mashing: { border: "border-l-amber-500", bg: "bg-amber-50/50" },
  boiling: { border: "border-l-orange-500", bg: "bg-orange-50/50" },
  post_boil: { border: "border-l-blue-500", bg: "bg-blue-50/50" },
};

function getPhaseColor(brewPhase: string): { border: string; bg: string } {
  return PHASE_COLORS[brewPhase] ?? { border: "border-l-gray-300", bg: "" };
}

// ── Props ───────────────────────────────────────────────────────

interface BrewStepTimelineProps {
  steps: BrewStepPreviewItem[];
  brewStart: Date;
  brewEnd: Date;
  totalMinutes: number;
  fermentationDays: number;
  conditioningDays: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// ── Component ───────────────────────────────────────────────────

export function BrewStepTimeline({
  steps,
  brewStart,
  brewEnd,
  totalMinutes,
  fermentationDays,
  conditioningDays,
}: BrewStepTimelineProps): React.ReactNode {
  const t = useTranslations("batches");

  // Group steps by brewPhase for visual separators
  let currentPhase = "";

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="space-y-0">
        {steps.map((step, idx) => {
          const phaseChanged = step.brewPhase !== currentPhase;
          if (phaseChanged) currentPhase = step.brewPhase;
          const colors = getPhaseColor(step.brewPhase);
          const startTime = new Date(step.startTimePlan);

          return (
            <React.Fragment key={idx}>
              {/* Phase separator */}
              {phaseChanged && idx > 0 && (
                <div className="h-px bg-border my-1" />
              )}

              {/* Step row */}
              <div
                className={cn(
                  "flex items-start gap-3 py-1.5 px-2 border-l-2 text-sm",
                  colors.border,
                  step.stepType === "heat" && "opacity-70"
                )}
              >
                {/* Time column */}
                <span className="w-12 shrink-0 text-muted-foreground tabular-nums text-xs pt-0.5">
                  {fmtTime(startTime)}
                </span>

                {/* Name column */}
                <span className="flex-1 min-w-0">
                  {step.name}
                  {step.autoSwitch && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {t("brew.prep.autoStep")}
                    </span>
                  )}
                </span>

                {/* Temp column */}
                <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
                  {step.temperatureC
                    ? `${Number(step.temperatureC).toFixed(0)}°C`
                    : ""}
                </span>

                {/* Duration column */}
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {step.timeMin} min
                </span>
              </div>

              {/* Hop additions (sub-rows under the step) */}
              {step.hopAdditions && step.hopAdditions.length > 0 && (
                <div className={cn("ml-14 border-l-2 pl-2 pb-1", colors.border)}>
                  {step.hopAdditions.map((hop, hi) => (
                    <div
                      key={hi}
                      className="flex items-center gap-2 text-xs text-muted-foreground py-0.5"
                    >
                      <span className="shrink-0">+</span>
                      {step.stepType === "boil" && (
                        <span className="tabular-nums w-14 shrink-0">
                          {hop.addAtMin} min
                        </span>
                      )}
                      <span>
                        {hop.itemName}{" "}
                        <span className="font-medium">
                          {hop.unitSymbol
                            ? `${hop.amountG} ${hop.unitSymbol}`
                            : hop.amountG >= 1000
                              ? `${(hop.amountG / 1000).toFixed(1)} kg`
                              : `${Math.round(hop.amountG)} g`}
                        </span>
                        {hop.recipeNotes && (
                          <span className="italic ml-1">— {hop.recipeNotes}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <Separator />

      {/* Summary */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t("brew.prep.stepEnd")}
          </span>
          <span className="font-medium">
            {fmtDate(brewEnd)} {fmtTime(brewEnd)}
            <span className="text-muted-foreground ml-2">
              ({totalMinutes >= 60
                ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`
                : `${totalMinutes} min`})
            </span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t("brew.prep.fermentationDays")}
          </span>
          <span>{fermentationDays}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t("brew.prep.conditioningDays")}
          </span>
          <span>{conditioningDays}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-medium">
          <span>{t("brew.prep.fermentationEnd")}</span>
          <span>
            {fmtDate(addDays(brewEnd, fermentationDays + conditioningDays))}
          </span>
        </div>
      </div>
    </div>
  );
}
