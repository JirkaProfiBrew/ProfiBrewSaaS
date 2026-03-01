"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { ebcToColorRgb } from "./ebc-to-color";

interface BeerGlassProps {
  /** EBC value (beer color). 0 = very pale, 80+ = black */
  ebc: number;
  /** Size: sm=32px, md=48px, lg=64px (height) */
  size?: "sm" | "md" | "lg";
  /** Placeholder mode — shows dot pattern instead of beer */
  placeholder?: boolean;
  /** Optional className for the root SVG element */
  className?: string;
}

const SIZE_MAP: Record<NonNullable<BeerGlassProps["size"]>, number> = {
  sm: 32,
  md: 48,
  lg: 64,
};

/**
 * Czech pint glass (tuplák) SVG component.
 * Displays a glass filled with beer colored according to EBC value.
 *
 * viewBox: 0 0 64 80 (taller aspect ratio ~4:5)
 * - Glass body: trapezoid (narrower bottom, wider top), rounded bottom
 * - Handle: right side arc
 * - Beer fill: EBC-colored gradient, clipped to glass
 * - Foam: wavy path with bubbles
 * - Glass effect: transparency gradient + highlight streak
 * - Placeholder: dot pattern when no beer color available
 */
export function BeerGlass({
  ebc,
  size = "md",
  placeholder = false,
  className,
}: BeerGlassProps): React.ReactElement {
  const uid = useId();
  const height = SIZE_MAP[size];
  const width = Math.round(height * 0.8);
  const beerColor = ebcToColorRgb(ebc);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 80"
      width={width}
      height={height}
      fill="none"
      className={cn("inline-block shrink-0", className)}
      role="img"
      aria-label="Beer glass"
    >
      <defs>
        {/* Glass transparency gradient */}
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="40%" stopColor="white" stopOpacity="0.25" />
          <stop offset="60%" stopColor="white" stopOpacity="0.05" />
          <stop offset="100%" stopColor="white" stopOpacity="0.12" />
        </linearGradient>
        {/* Beer body gradient (subtle depth) */}
        <linearGradient id={`${uid}-beer`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={beerColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={beerColor} stopOpacity="1" />
        </linearGradient>
        {/* Foam gradient */}
        <linearGradient id={`${uid}-foam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFEF5" />
          <stop offset="100%" stopColor="#F5EDD6" />
        </linearGradient>
        {/* Placeholder dot pattern */}
        <pattern id={`${uid}-dots`} x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.8" fill="#999" opacity="0.4" />
        </pattern>
        {/* Clip for glass body */}
        <clipPath id={`${uid}-clip`}>
          <path d="M12 8 L10 70 Q10 76 16 76 L48 76 Q54 76 54 70 L52 8 Z" />
        </clipPath>
      </defs>

      {/* Glass body outline */}
      <path
        d="M12 8 L10 70 Q10 76 16 76 L48 76 Q54 76 54 70 L52 8 Z"
        fill="white"
        fillOpacity="0.08"
        stroke="#C0B8A8"
        strokeWidth="1.5"
      />

      {/* Beer fill (clipped to glass) */}
      <g clipPath={`url(#${uid}-clip)`}>
        {placeholder ? (
          <rect x="10" y="14" width="44" height="62" fill={`url(#${uid}-dots)`} />
        ) : (
          <>
            {/* Beer body */}
            <rect x="10" y="18" width="44" height="58" fill={`url(#${uid}-beer)`} />
            {/* Glass transparency overlay */}
            <rect x="10" y="18" width="44" height="58" fill={`url(#${uid}-glass)`} />
            {/* Highlight streak (glass reflection) */}
            <rect x="16" y="22" width="3" height="48" rx="1.5" fill="white" opacity="0.18" />
          </>
        )}

        {/* Foam */}
        {!placeholder && (
          <>
            <path
              d="M10 18 Q18 21 24 17 Q30 14 38 18 Q44 21 54 17 L54 8 L10 8 Z"
              fill={`url(#${uid}-foam)`}
            />
            {/* Foam bubbles */}
            <circle cx="20" cy="14" r="1.5" fill="white" opacity="0.5" />
            <circle cx="32" cy="12" r="1.2" fill="white" opacity="0.4" />
            <circle cx="42" cy="14" r="1" fill="white" opacity="0.45" />
            <circle cx="26" cy="16" r="0.8" fill="white" opacity="0.35" />
          </>
        )}
      </g>

      {/* Handle */}
      <path
        d="M52 24 Q62 24 62 38 Q62 52 52 52"
        fill="none"
        stroke="#C0B8A8"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Rim highlight */}
      <line x1="14" y1="8" x2="50" y2="8" stroke="white" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}
