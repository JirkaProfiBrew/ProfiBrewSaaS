"use client";

import useSWR from "swr";

import { getUnits } from "./actions";
import type { Unit } from "./types";

/**
 * Fetch all system units.
 * Since system units never change, we use a long dedup interval.
 */
export function useUnits(): {
  units: Unit[];
  isLoading: boolean;
  error: Error | undefined;
} {
  const { data, error, isLoading } = useSWR<Unit[]>(
    "units",
    () => getUnits(),
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  return {
    units: data ?? [],
    isLoading,
    error,
  };
}
