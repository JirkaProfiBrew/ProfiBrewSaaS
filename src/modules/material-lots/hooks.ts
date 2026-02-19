"use client";

import useSWR from "swr";

import { getMaterialLots, getMaterialLot } from "./actions";
import type { MaterialLotFilter } from "./types";
import type { MaterialLot } from "./types";

/**
 * Fetch a list of material lots with optional filters.
 */
export function useMaterialLotList(filter?: MaterialLotFilter): {
  data: MaterialLot[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["materialLots", JSON.stringify(filter ?? {})];

  const { data, error, isLoading, mutate } = useSWR<MaterialLot[]>(
    key,
    () => getMaterialLots(filter),
    { revalidateOnFocus: false }
  );

  return {
    data: data ?? [],
    isLoading,
    error,
    mutate: () => {
      void mutate();
    },
  };
}

/**
 * Fetch a single material lot by ID.
 */
export function useMaterialLotDetail(id: string): {
  data: MaterialLot | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<MaterialLot | null>(
    id ? ["materialLot", id] : null,
    () => getMaterialLot(id),
    { revalidateOnFocus: false }
  );

  return {
    data: data ?? null,
    isLoading,
    error,
    mutate: () => {
      void mutate();
    },
  };
}
