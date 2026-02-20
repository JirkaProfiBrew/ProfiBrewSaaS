"use client";

import useSWR from "swr";
import {
  getCashDesks,
  getCashDesk,
  getCashDeskTransactions,
  getCashDeskDailySummary,
} from "./actions";
import type { CashDesk, CashDeskDailySummary } from "./types";
import type { CashFlow } from "@/modules/cashflows/types";

/**
 * Fetch all cash desks for the current tenant.
 */
export function useCashDeskList(): {
  data: CashDesk[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<CashDesk[]>(
    "cash-desks",
    () => getCashDesks(),
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
 * Fetch a single cash desk by ID.
 */
export function useCashDeskDetail(id: string | null): {
  data: CashDesk | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<CashDesk | null>(
    id ? ["cash-desk", id] : null,
    () => getCashDesk(id!),
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

/**
 * Fetch cash transactions for a cash desk on a specific date.
 */
export function useCashDeskTransactions(
  cashDeskId: string | null,
  date?: string
): {
  data: CashFlow[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<CashFlow[]>(
    cashDeskId
      ? ["cash-desk-txns", cashDeskId, date ?? "today"]
      : null,
    () => getCashDeskTransactions(cashDeskId!, date),
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
 * Fetch daily summary (income, expense, net, count) for a cash desk.
 */
export function useCashDeskDailySummary(
  cashDeskId: string | null,
  date?: string
): {
  data: CashDeskDailySummary | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<
    CashDeskDailySummary | { error: string }
  >(
    cashDeskId
      ? ["cash-desk-summary", cashDeskId, date ?? "today"]
      : null,
    () => getCashDeskDailySummary(cashDeskId!, date),
    { revalidateOnFocus: false }
  );

  // If the server returned an error object, treat it as no data
  const resolved =
    data && !("error" in data) ? data : null;

  return {
    data: resolved,
    isLoading,
    error,
    mutate: () => {
      void mutate();
    },
  };
}
