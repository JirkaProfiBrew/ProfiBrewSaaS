/**
 * Convert EBC (European Brewing Convention) color value to CSS color.
 * Direct EBC-native color map with 16 reference points and linear interpolation.
 */

/** EBC value mapped to [r, g, b] color tuple */
type EbcColorEntry = { ebc: number; color: [number, number, number] };

/** EBC to RGB color reference points (16 entries, EBC-native) */
const EBC_COLORS: EbcColorEntry[] = [
  { ebc: 2, color: [248, 231, 114] },
  { ebc: 4, color: [244, 214, 68] },
  { ebc: 6, color: [243, 195, 41] },
  { ebc: 8, color: [234, 170, 22] },
  { ebc: 12, color: [215, 135, 15] },
  { ebc: 16, color: [195, 105, 12] },
  { ebc: 20, color: [175, 80, 10] },
  { ebc: 25, color: [155, 60, 8] },
  { ebc: 30, color: [135, 42, 6] },
  { ebc: 35, color: [115, 30, 5] },
  { ebc: 40, color: [95, 20, 4] },
  { ebc: 50, color: [72, 12, 3] },
  { ebc: 60, color: [52, 8, 2] },
  { ebc: 70, color: [35, 5, 2] },
  { ebc: 80, color: [22, 3, 1] },
  { ebc: 100, color: [10, 1, 0] },
];

/** Interpolate between two EBC color entries to get an RGB tuple */
function interpolateRgb(ebc: number): [number, number, number] {
  const first = EBC_COLORS[0]!;
  const last = EBC_COLORS[EBC_COLORS.length - 1]!;

  if (ebc <= first.ebc) return first.color;
  if (ebc >= last.ebc) return last.color;

  for (let i = 0; i < EBC_COLORS.length - 1; i++) {
    const low = EBC_COLORS[i]!;
    const high = EBC_COLORS[i + 1]!;
    if (ebc >= low.ebc && ebc <= high.ebc) {
      const t = (ebc - low.ebc) / (high.ebc - low.ebc);
      return [
        Math.round(low.color[0] + (high.color[0] - low.color[0]) * t),
        Math.round(low.color[1] + (high.color[1] - low.color[1]) * t),
        Math.round(low.color[2] + (high.color[2] - low.color[2]) * t),
      ];
    }
  }

  return last.color;
}

/**
 * Convert EBC value to CSS hex color string.
 *
 * @param ebc - EBC color value (0-160). Values outside range are clamped.
 * @returns CSS hex color string (e.g. "#F8E772")
 */
export function ebcToColor(ebc: number): string {
  if (ebc <= 0) return "#C8C8C8";
  const [r, g, b] = interpolateRgb(Math.min(ebc, 160));
  const toHex = (n: number): string =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert EBC value to CSS rgb() color string (for SVG gradients).
 *
 * @param ebc - EBC color value (0-160).
 * @returns CSS rgb string (e.g. "rgb(248,231,114)")
 */
export function ebcToColorRgb(ebc: number): string {
  if (ebc <= 0) return "rgb(200,200,200)";
  const [r, g, b] = interpolateRgb(Math.min(ebc, 160));
  return `rgb(${r},${g},${b})`;
}

/**
 * Convert EBC value to CSS rgba() color string with opacity.
 *
 * @param ebc - EBC color value (0-160).
 * @param opacity - Opacity (0-1). Default 0.3.
 * @returns CSS rgba string (e.g. "rgba(248,231,114,0.3)")
 */
export function ebcToColorLight(ebc: number, opacity = 0.3): string {
  if (ebc <= 0) return `rgba(200,200,200,${opacity})`;
  const [r, g, b] = interpolateRgb(Math.min(ebc, 160));
  return `rgba(${r},${g},${b},${opacity})`;
}
