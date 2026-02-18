"use client";

import useSWR from "swr";

import { getShops, getShopById } from "./actions";
import type { ShopFilter } from "./actions";
import type { Shop } from "./types";

/**
 * Fetch a list of shops with optional server-side filters.
 * Uses the server action directly as an SWR fetcher.
 */
export function useShops(filter?: ShopFilter): {
  data: Shop[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["shops", JSON.stringify(filter ?? {})];

  const { data, error, isLoading, mutate } = useSWR<Shop[]>(
    key,
    () => getShops(filter),
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
 * Fetch a single shop by ID.
 */
export function useShop(id: string): {
  data: Shop | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<Shop | null>(
    id ? ["shop", id] : null,
    () => getShopById(id),
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
