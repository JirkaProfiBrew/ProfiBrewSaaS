"use client";

import React, { useCallback, useMemo } from "react";

import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface DesignSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  styleRange: [number, number] | null;
  unit?: string;
  secondary?: React.ReactNode;
  calculatedValue?: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function getSliderColor(
  value: number,
  styleRange: [number, number] | null
): string {
  if (!styleRange) return "text-muted-foreground";
  const [sMin, sMax] = styleRange;
  const range = sMax - sMin;
  if (range <= 0) return "text-muted-foreground";
  if (value >= sMin && value <= sMax) return "text-green-600 dark:text-green-400";
  const distance = value < sMin ? sMin - value : value - sMax;
  if (distance <= range * 0.15) return "text-amber-500";
  return "text-red-500";
}

function clampValue(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function toPercent(val: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((val - min) / (max - min)) * 100;
}

// ── Component ──────────────────────────────────────────────────────

export function DesignSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  styleRange,
  unit,
  secondary,
  calculatedValue,
}: DesignSliderProps): React.ReactNode {
  const colorClass = useMemo(
    () => getSliderColor(value, styleRange),
    [value, styleRange]
  );

  // Style range zone positioning
  const rangeStyle = useMemo(() => {
    if (!styleRange) return null;
    const [sMin, sMax] = styleRange;
    const leftPct = Math.max(0, toPercent(sMin, min, max));
    const rightPct = Math.min(100, toPercent(sMax, min, max));
    return {
      left: `${leftPct}%`,
      width: `${rightPct - leftPct}%`,
    };
  }, [styleRange, min, max]);

  // Calculated value marker positioning
  const calculatedPct = useMemo(() => {
    if (calculatedValue == null) return null;
    return toPercent(clampValue(calculatedValue, min, max), min, max);
  }, [calculatedValue, min, max]);

  const showCalculatedMarker =
    calculatedValue != null && calculatedValue !== value;

  const handleSliderChange = useCallback(
    ([v]: number[]): void => {
      if (v != null) onChange(v);
    },
    [onChange]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const raw = e.target.value;
      if (raw === "" || raw === "-") return;
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        onChange(clampValue(parsed, min, max));
      }
    },
    [onChange, min, max]
  );

  return (
    <div className="space-y-1">
      {/* Row 1: Label + Slider + Input + Unit + Secondary */}
      <div className="flex items-center gap-3">
        <span
          className={cn("text-sm font-medium w-10 shrink-0", colorClass)}
        >
          {label}
        </span>

        <div className="relative flex-1">
          {/* Style range zone (behind the slider track) */}
          {rangeStyle && (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-4 rounded-sm bg-green-200/50 dark:bg-green-800/30 pointer-events-none z-0"
              style={rangeStyle}
            />
          )}
          <Slider
            value={[value]}
            onValueChange={handleSliderChange}
            min={min}
            max={max}
            step={step}
            className="relative z-10"
          />
        </div>

        <Input
          type="number"
          value={value}
          onChange={handleInputChange}
          min={min}
          max={max}
          step={step}
          className={cn("w-20 text-right tabular-nums h-8", colorClass)}
        />

        {unit && (
          <span className="text-xs text-muted-foreground w-6">{unit}</span>
        )}

        {secondary && <div className="shrink-0">{secondary}</div>}
      </div>

      {/* Row 2: Style range text */}
      {styleRange && (
        <div className="flex">
          <div className="w-10 shrink-0" />
          <p className="text-xs text-muted-foreground ml-3">
            {styleRange[0]}&ndash;{styleRange[1]}
          </p>
        </div>
      )}

      {/* Row 3: Calculated value marker */}
      {showCalculatedMarker && calculatedPct != null && (
        <div className="flex">
          <div className="w-10 shrink-0" />
          <div className="relative flex-1 ml-3 h-4">
            <div
              className="absolute flex flex-col items-center -translate-x-1/2"
              style={{ left: `${calculatedPct}%` }}
            >
              <span className="text-[10px] leading-none text-muted-foreground">
                &#9650;
              </span>
              <span className="text-[10px] leading-none text-muted-foreground whitespace-nowrap">
                recept: {calculatedValue}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
