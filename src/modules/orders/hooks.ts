"use client";

import useSWR from "swr";

import { getOrders, getOrder } from "./actions";
import type { Order, OrderWithItems, OrderFilter } from "./types";

/**
 * Fetch a list of orders with optional server-side filters.
 * Uses the server action directly as an SWR fetcher.
 */
export function useOrderList(filter?: OrderFilter): {
  data: Order[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["orders", JSON.stringify(filter ?? {})];

  const { data, error, isLoading, mutate } = useSWR<Order[]>(
    key,
    () => getOrders(filter),
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
 * Fetch a single order by ID, including items.
 */
export function useOrderDetail(id: string): {
  data: OrderWithItems | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<OrderWithItems | null>(
    id && id !== "new" ? ["order", id] : null,
    () => getOrder(id),
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
