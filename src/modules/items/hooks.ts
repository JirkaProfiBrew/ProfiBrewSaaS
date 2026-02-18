"use client";

import useSWR from "swr";

import { getItems, getItemById } from "./actions";
import type { ItemFilter } from "./actions";
import type { Item } from "./types";

/**
 * Fetch a list of items with optional server-side filters.
 * Uses the server action directly as an SWR fetcher.
 */
export function useItems(filter?: ItemFilter): {
  items: Item[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["items", JSON.stringify(filter ?? {})];

  const { data, error, isLoading, mutate } = useSWR<Item[]>(
    key,
    () => getItems(filter),
    { revalidateOnFocus: false }
  );

  return {
    items: data ?? [],
    isLoading,
    error,
    mutate: () => {
      void mutate();
    },
  };
}

/**
 * Fetch a single item by ID.
 */
export function useItem(id: string): {
  item: Item | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<Item | null>(
    id ? ["item", id] : null,
    () => getItemById(id),
    { revalidateOnFocus: false }
  );

  return {
    item: data ?? null,
    isLoading,
    error,
    mutate: () => {
      void mutate();
    },
  };
}
