"use client";

import useSWR from "swr";

import { getWarehouses, getWarehouseById } from "./actions";
import type { WarehouseFilter } from "./actions";
import type { Warehouse } from "./types";

/**
 * Fetch a list of warehouses with optional server-side filters.
 * Uses the server action directly as an SWR fetcher.
 */
export function useWarehouseList(filter?: WarehouseFilter): {
  data: Warehouse[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["warehouses", JSON.stringify(filter ?? {})];

  const { data, error, isLoading, mutate } = useSWR<Warehouse[]>(
    key,
    () => getWarehouses(filter),
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
 * Fetch a single warehouse by ID.
 */
export function useWarehouseItem(id: string): {
  data: Warehouse | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<Warehouse | null>(
    id ? ["warehouse", id] : null,
    () => getWarehouseById(id),
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
