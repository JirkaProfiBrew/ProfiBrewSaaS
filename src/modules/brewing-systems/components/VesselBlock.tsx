"use client";

import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

interface VesselProps {
  /** Total vessel volume (defines 100% height) */
  vesselVolumeL: number;
  /** Liquid volume inside the vessel */
  liquidVolumeL: number;
  /** Label below the vessel */
  label: string;
  /** Tailwind background color class for the liquid */
  liquidColor: string;
}

interface VesselBlockProps {
  /** Block title (e.g. "Chmelovar") */
  title: string;
  /** Left vessel */
  leftVessel: VesselProps;
  /** Right vessel */
  rightVessel: VesselProps;
  /** Loss percentage label */
  lossLabel: string;
  /** Loss percentage value */
  lossPct: number;
}

// ── Vessel ─────────────────────────────────────────────────────

function Vessel({
  vesselVolumeL,
  liquidVolumeL,
  label,
  liquidColor,
}: VesselProps): React.ReactNode {
  const fillPct =
    vesselVolumeL > 0
      ? Math.min(100, Math.max(0, (liquidVolumeL / vesselVolumeL) * 100))
      : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Vessel container */}
      <div className="relative h-32 w-28 rounded-b-lg border-2 border-border bg-muted/30">
        {/* Liquid fill — anchored to bottom */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 rounded-b-md transition-all duration-300",
            liquidColor
          )}
          style={{ height: `${fillPct}%` }}
        />
      </div>
      {/* Volume label */}
      <span className="text-xs font-mono text-muted-foreground">
        {liquidVolumeL.toFixed(0)} L
      </span>
      {/* Description */}
      <span className="text-xs text-muted-foreground text-center max-w-28 leading-tight">
        {label}
      </span>
    </div>
  );
}

// ── VesselBlock ────────────────────────────────────────────────

export function VesselBlock({
  title,
  leftVessel,
  rightVessel,
  lossLabel,
  lossPct,
}: VesselBlockProps): React.ReactNode {
  return (
    <div className="rounded-lg border bg-card p-4 h-full">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <div className="flex items-start justify-center gap-6">
        <Vessel {...leftVessel} />

        {/* Loss indicator */}
        <div className="flex flex-col items-center justify-center pt-8">
          <span className="text-xs text-muted-foreground">{lossLabel}</span>
          <span className="text-lg font-bold text-red-500">{lossPct} %</span>
          <span className="text-muted-foreground">→</span>
        </div>

        <Vessel {...rightVessel} />
      </div>
    </div>
  );
}

// ── WhirlpoolBlock (text-only, no vessels) ─────────────────────

interface WhirlpoolBlockProps {
  title: string;
  lossLabel: string;
  lossPct: number;
  description: string;
}

export function WhirlpoolBlock({
  title,
  lossLabel,
  lossPct,
  description,
}: WhirlpoolBlockProps): React.ReactNode {
  return (
    <div className="rounded-lg border bg-card p-4 h-full">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <div className="flex flex-col items-center justify-center gap-1 py-6">
        <span className="text-xs text-muted-foreground">{lossLabel}</span>
        <span className="text-lg font-bold text-red-500">{lossPct} %</span>
        <span className="mt-1 text-xs text-muted-foreground italic">
          ({description})
        </span>
      </div>
    </div>
  );
}
