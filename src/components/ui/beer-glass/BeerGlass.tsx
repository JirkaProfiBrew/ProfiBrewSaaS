import { cn } from "@/lib/utils";
import { ebcToColor } from "./ebc-to-color";

interface BeerGlassProps {
  /** EBC value (beer color). 0 = very pale, 80+ = black */
  ebc: number;
  /** Size: sm=40px, md=64px, lg=96px (height) */
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
 * Beer mug (půllitr/krýgl) SVG component.
 * Displays a Czech beer mug filled with beer colored according to EBC value.
 *
 * viewBox: 0 0 72 64  (wider aspect ratio — resembles a real pub half-liter)
 * - Glass body: rounded bottom, straight sides, wider shape
 * - Handle: right side
 * - Beer fill: colored by EBC
 * - Foam: white bumps on top
 */
export function BeerGlass({
  ebc,
  size = "md",
  className,
}: BeerGlassProps): React.ReactElement {
  const height = SIZE_MAP[size];
  const width = Math.round((height * 72) / 64);
  const beerColor = ebcToColor(ebc);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 72 64"
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
          <path d="M12 14 L12 52 Q12 58 20 58 L44 58 Q52 58 52 52 L52 14 Z" />
        </clipPath>
      </defs>

      {/* Beer fill (clipped to glass interior) */}
      <rect
        x="12"
        y="18"
        width="40"
        height="40"
        rx="4"
        fill={beerColor}
        clipPath={`url(#glass-clip-${size})`}
      />

      {/* Foam - white bubbles on top */}
      <ellipse cx="19" cy="18" rx="7" ry="4.5" fill="white" opacity="0.92" />
      <ellipse cx="32" cy="16" rx="8" ry="5" fill="white" opacity="0.95" />
      <ellipse cx="45" cy="18" rx="7" ry="4.5" fill="white" opacity="0.92" />
      <ellipse cx="25" cy="15" rx="5" ry="3.5" fill="white" opacity="0.88" />
      <ellipse cx="39" cy="15" rx="5" ry="3.5" fill="white" opacity="0.88" />

      {/* Glass outline - the mug body */}
      <path
        d="M12 12 L12 52 Q12 58 20 58 L44 58 Q52 58 52 52 L52 12 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Glass rim (top edge, slightly wider) */}
      <path
        d="M10 12 L54 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Handle */}
      <path
        d="M52 20 Q62 20 62 30 Q62 40 52 40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
