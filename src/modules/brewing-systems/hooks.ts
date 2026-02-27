"use client";

import { useState, useEffect, useCallback } from "react";

import type { BrewingSystem } from "./types";
import type { BrewingSystemFilter } from "./actions";
import { getBrewingSystems, getBrewingSystem } from "./actions";

// ── useBrewingSystemList ──────────────────────────────────────

interface UseBrewingSystemListReturn {
  data: BrewingSystem[];
  isLoading: boolean;
  mutate: () => void;
}

export function useBrewingSystemList(
  filter?: BrewingSystemFilter
): UseBrewingSystemListReturn {
  const [data, setData] = useState<BrewingSystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getBrewingSystems(filter)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load brewing systems:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useBrewingSystemItem ──────────────────────────────────────

interface UseBrewingSystemItemReturn {
  data: BrewingSystem | null;
  isLoading: boolean;
  mutate: () => void;
}

export function useBrewingSystemItem(id: string): UseBrewingSystemItemReturn {
  const [data, setData] = useState<BrewingSystem | null>(null);
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

    getBrewingSystem(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load brewing system:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return { data, isLoading, mutate };
}
