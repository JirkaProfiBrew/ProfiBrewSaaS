"use client";

import { useState, useEffect, useCallback } from "react";

import type { Batch, BatchDetail } from "./types";
import type { BatchFilter } from "./actions";
import { getBatches, getBatchDetail } from "./actions";

// ── useBatchList ──────────────────────────────────────────────

interface UseBatchListReturn {
  data: Batch[];
  isLoading: boolean;
  mutate: () => void;
}

export function useBatchList(filter?: BatchFilter): UseBatchListReturn {
  const [data, setData] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getBatches(filter)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load batch list:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useBatchDetail ────────────────────────────────────────────

interface UseBatchDetailReturn {
  data: BatchDetail | null;
  isLoading: boolean;
  mutate: () => void;
}

export function useBatchDetail(id: string): UseBatchDetailReturn {
  const [data, setData] = useState<BatchDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (id === "new") {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    getBatchDetail(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load batch detail:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return { data, isLoading, mutate };
}
