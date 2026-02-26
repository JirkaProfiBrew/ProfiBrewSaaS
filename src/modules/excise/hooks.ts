"use client";

import useSWR from "swr";

import {
  getExciseMovements,
  getExciseMovement,
  getMonthlyReports,
  getMonthlyReport,
  getExciseRates,
  getExciseDashboard,
} from "./actions";
import type {
  ExciseMovement,
  ExciseMonthlyReport,
  ExciseRate,
  ExciseDashboardData,
  ExciseMovementFilter,
} from "./types";

/**
 * Fetch a list of excise movements with optional server-side filters.
 * Uses the server action directly as an SWR fetcher.
 */
export function useExciseMovements(filters?: ExciseMovementFilter): {
  data: ExciseMovement[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["excise-movements", JSON.stringify(filters ?? {})];

  const { data, error, isLoading, mutate } = useSWR<ExciseMovement[]>(
    key,
    () => getExciseMovements(filters),
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
 * Fetch a single excise movement by ID.
 */
export function useExciseMovement(id: string | null): {
  data: ExciseMovement | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<ExciseMovement>(
    id ? ["excise-movement", id] : null,
    () => getExciseMovement(id!),
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
 * Fetch monthly excise reports.
 */
export function useMonthlyReports(): {
  data: ExciseMonthlyReport[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<ExciseMonthlyReport[]>(
    "excise-monthly-reports",
    () => getMonthlyReports(),
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
 * Fetch a single monthly report by ID.
 */
export function useMonthlyReport(id: string | null): {
  data: ExciseMonthlyReport | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<ExciseMonthlyReport>(
    id ? ["excise-monthly-report", id] : null,
    () => getMonthlyReport(id!),
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
 * Fetch excise rates (tenant + system-wide).
 */
export function useExciseRates(): {
  data: ExciseRate[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<ExciseRate[]>(
    "excise-rates",
    () => getExciseRates(),
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
 * Fetch excise dashboard data (current period summary).
 */
export function useExciseDashboard(): {
  data: ExciseDashboardData | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<ExciseDashboardData>(
    "excise-dashboard",
    () => getExciseDashboard(),
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
