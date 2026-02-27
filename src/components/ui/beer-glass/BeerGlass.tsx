import { cn } from "@/lib/utils";
import { ebcToColor } from "./ebc-to-color";

interface BeerGlassProps {
  /** EBC value (beer color). 0 = very pale, 80+ = black */
  ebc: number;
  /** Size: sm=40px, md=64px, lg=96px */
  size?: "sm" | "md" | "lg";
  /** Optional className for the root SVG element */
  className?: string;
}

const SIZE_MAP: Record<NonNullable<BeerGlassProps["size"]>, number> = {
  sm: 40,
  md: 64,
  lg: 96,
};

/**
 * Beer mug (pullitr/krigel) SVG component.
 * Displays a Czech beer mug filled with beer colored according to EBC value.
 *
 * viewBox: 0 0 48 64
 * - Glass body: rounded bottom, straight sides, slightly wider at top
 * - Handle: right side
 * - Beer fill: colored by EBC
 * - Foam: white bumps on top
 */
export function BeerGlass({
  ebc,
  size = "md",
  className,
}: BeerGlassProps): React.ReactElement {
  const width = SIZE_MAP[size];
  const height = Math.round((width * 64) / 48);
  const beerColor = ebcToColor(ebc);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 64"
      width={width}
      height={height}
      fill="none"
      className={cn("inline-block shrink-0", className)}
      role="img"
      aria-label="Beer glass"
    >
      {/* Glass body clip path - defines the interior fill area */}
      <defs>
        <clipPath id={`glass-clip-${size}`}>
          <path d="M10 14 L10 52 Q10 58 16 58 L30 58 Q36 58 36 52 L36 14 Z" />
        </clipPath>
      </defs>

      {/* Beer fill (clipped to glass interior) */}
      <rect
        x="10"
        y="18"
        width="26"
        height="40"
        rx="4"
        fill={beerColor}
        clipPath={`url(#glass-clip-${size})`}
      />

      {/* Foam - white bubbles on top */}
      <ellipse cx="15" cy="18" rx="5.5" ry="4.5" fill="white" opacity="0.92" />
      <ellipse cx="23" cy="16" rx="6" ry="5" fill="white" opacity="0.95" />
      <ellipse cx="31" cy="18" rx="5.5" ry="4.5" fill="white" opacity="0.92" />
      <ellipse cx="19" cy="15" rx="4" ry="3.5" fill="white" opacity="0.88" />
      <ellipse cx="27" cy="15" rx="4" ry="3.5" fill="white" opacity="0.88" />

      {/* Glass outline - the mug body */}
      <path
        d="M10 12 L10 52 Q10 58 16 58 L30 58 Q36 58 36 52 L36 12 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Glass rim (top edge, slightly wider) */}
      <path
        d="M8 12 L38 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Handle */}
      <path
        d="M36 20 Q44 20 44 30 Q44 40 36 40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
