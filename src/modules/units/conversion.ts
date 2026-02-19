/**
 * Unit conversion utilities — pure functions, no server dependency.
 */

import type { Unit } from "./types";

/**
 * Convert amount to base unit (kg for weight, l for volume).
 */
export function toBaseUnit(amount: number, unit: Unit): number {
  if (!unit.toBaseFactor || unit.toBaseFactor === 1) return amount;
  return amount * unit.toBaseFactor;
}

/**
 * Convert amount from base unit to target unit.
 */
export function fromBaseUnit(amount: number, unit: Unit): number {
  if (!unit.toBaseFactor || unit.toBaseFactor === 1) return amount;
  return amount / unit.toBaseFactor;
}

/**
 * Convert between two units (via base unit).
 */
export function convertUnit(amount: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit.code === toUnit.code) return amount;
  const base = toBaseUnit(amount, fromUnit);
  return fromBaseUnit(base, toUnit);
}
