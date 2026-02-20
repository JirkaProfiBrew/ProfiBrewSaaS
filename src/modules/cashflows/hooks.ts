"use client";

import useSWR from "swr";

import {
  getCashFlows,
  getCashFlow,
  getTemplates,
  getTemplate,
} from "./actions";
import type {
  CashFlow,
  CashFlowTemplate,
  CashFlowFilter,
} from "./types";

/**
 * Fetch a list of cashflows with optional server-side filters.
 */
export function useCashFlowList(filter?: CashFlowFilter): {
  data: CashFlow[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const key = ["cashflows", JSON.stringify(filter ?? {})];

  const { data, error, isLoading, mutate } = useSWR<CashFlow[]>(
    key,
    () => getCashFlows(filter),
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
 * Fetch a single cashflow by ID.
 */
export function useCashFlowDetail(id: string): {
  data: CashFlow | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<CashFlow | null>(
    id && id !== "new" ? ["cashflow", id] : null,
    () => getCashFlow(id),
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
 * Fetch the list of recurring templates.
 */
export function useTemplateList(): {
  data: CashFlowTemplate[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<CashFlowTemplate[]>(
    ["cashflow-templates"],
    () => getTemplates(),
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
 * Fetch a single template by ID.
 */
export function useTemplateDetail(id: string): {
  data: CashFlowTemplate | null;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<CashFlowTemplate | null>(
    id && id !== "new" ? ["cashflow-template", id] : null,
    () => getTemplate(id),
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
