/**
 * Convert EBC (European Brewing Convention) color value to CSS hex color.
 * Based on standard SRM color chart with linear interpolation.
 * EBC = SRM * 1.97
 */

/** SRM value mapped to hex color */
type SrmColorEntry = [number, string];

/** Standard SRM to hex color mapping (industry reference points) */
const COLOR_MAP: SrmColorEntry[] = [
  [0, "#FFE699"], // Water / very pale
  [1, "#FFD878"], // Pale straw
  [2, "#FFCA5A"], // Straw
  [3, "#FFBF42"], // Pale gold
  [4, "#FBB123"], // Deep gold
  [5, "#F8A600"], // Pale amber
  [6, "#F39C00"], // Medium amber
  [8, "#EA8F00"], // Deep amber
  [10, "#E58500"], // Amber-brown
  [13, "#CA6500"], // Brown
  [17, "#A85600"], // Ruby brown
  [20, "#8D4C32"], // Deep brown
  [24, "#7C452D"], // Dark brown
  [29, "#6B3A1E"], // Very dark brown
  [35, "#5A301A"], // Near black
  [40, "#3B1F12"], // Black
];

/** Parse a hex color string (#RRGGBB) into [r, g, b] tuple */
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/** Convert [r, g, b] tuple back to hex color string */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number): string => {
    const clamped = Math.round(Math.max(0, Math.min(255, n)));
    return clamped.toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert EBC value to CSS hex color.
 *
 * @param ebc - EBC color value (0-160). Values outside range are clamped.
 * @returns CSS hex color string (e.g. "#FFD878")
 */
export function ebcToColor(ebc: number): string {
  const clamped = Math.max(0, Math.min(ebc, 160));
  const srm = clamped / 1.97;

  const first = COLOR_MAP[0];
  const last = COLOR_MAP[COLOR_MAP.length - 1];

  // Fallback (should never happen since COLOR_MAP is non-empty)
  if (!first || !last) {
    return "#FFE699";
  }

  // Below first entry: return first color
  if (srm <= first[0]) {
    return first[1];
  }

  // Above last entry: return last color
  if (srm >= last[0]) {
    return last[1];
  }

  // Find surrounding entries for interpolation
  let lowIndex = 0;
  for (let i = 0; i < COLOR_MAP.length - 1; i++) {
    const current = COLOR_MAP[i];
    const next = COLOR_MAP[i + 1];
    if (current && next && current[0] <= srm && next[0] > srm) {
      lowIndex = i;
      break;
    }
  }

  const low = COLOR_MAP[lowIndex];
  const high = COLOR_MAP[lowIndex + 1];

  // Fallback if entries not found (should not happen with valid COLOR_MAP)
  if (!low || !high) {
    return last[1];
  }

  const [srmLow, hexLow] = low;
  const [srmHigh, hexHigh] = high;

  // Linear interpolation factor (0..1)
  const t = (srm - srmLow) / (srmHigh - srmLow);

  const [rLow, gLow, bLow] = hexToRgb(hexLow);
  const [rHigh, gHigh, bHigh] = hexToRgb(hexHigh);

  const r = rLow + (rHigh - rLow) * t;
  const g = gLow + (gHigh - gLow) * t;
  const b = bLow + (bHigh - bLow) * t;

  return rgbToHex(r, g, b);
}
