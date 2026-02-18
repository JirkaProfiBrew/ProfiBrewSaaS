import type { Counter } from "./types";

/**
 * Generate a preview of what the next number would look like.
 */
export function formatCounterPreview(counter: Counter): string {
  const nextNum = counter.currentNumber + 1;
  const padded = String(nextNum).padStart(counter.padding, "0");
  const sep = counter.separator;

  if (counter.includeYear) {
    const year = new Date().getFullYear();
    return `${counter.prefix}${sep}${year}${sep}${padded}`;
  }

  return `${counter.prefix}${padded}`;
}
