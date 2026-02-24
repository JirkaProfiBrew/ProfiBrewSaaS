"use client";

import useSWR from "swr";
import {
  getCashDesks,
  getCashDesk,
  getCashDeskTransactions,
  getCashDeskDailySummary,
  getCashDeskBalanceBreakdown,
} from "./actions";
import type { CashDesk, CashDeskDailySummary, CashDeskBalanceBreakdown } from "./types";
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
    ([, deskId]: [string, string]) => getCashDesk(deskId),
    { revalidateOnFocus: false, keepPreviousData: false }
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
    ([, deskId, d]: [string, string, string]) =>
      getCashDeskTransactions(deskId, d === "today" ? undefined : d),
    { revalidateOnFocus: false, keepPreviousData: false }
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
    ([, deskId, d]: [string, string, string]) =>
      getCashDeskDailySummary(deskId, d === "today" ? undefined : d),
    { revalidateOnFocus: false, keepPreviousData: false }
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

/**
 * Fetch all-time balance breakdown (total income, total expense, count) for a cash desk.
 */
export function useCashDeskBalanceBreakdown(
  cashDeskId: string | null
): {
  data: CashDeskBalanceBreakdown | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<
    CashDeskBalanceBreakdown | { error: string }
  >(
    cashDeskId
      ? ["cash-desk-breakdown", cashDeskId]
      : null,
    ([, deskId]: [string, string]) =>
      getCashDeskBalanceBreakdown(deskId),
    { revalidateOnFocus: false, keepPreviousData: false }
  );

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
