"use client";

import useSWR from "swr";

import { getStockIssues, getStockIssue } from "./actions";
import type { StockIssueFilter } from "./types";
import type { StockIssue, StockIssueWithLines } from "./types";

/**
 * Fetch a list of stock issues with optional server-side filters.
 * Uses the server action directly as an SWR fetcher.
 */
export function useStockIssueList(filter?: StockIssueFilter): {
  data: StockIssue[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["stockIssues", JSON.stringify(filter ?? {})];

  const { data, error, isLoading, mutate } = useSWR<StockIssue[]>(
    key,
    () => getStockIssues(filter),
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
 * Fetch a single stock issue by ID, including lines.
 */
export function useStockIssueDetail(id: string): {
  data: StockIssueWithLines | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<StockIssueWithLines | null>(
    id ? ["stockIssue", id] : null,
    () => getStockIssue(id),
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
