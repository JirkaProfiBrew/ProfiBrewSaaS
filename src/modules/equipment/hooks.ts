"use client";

import { useState, useEffect, useCallback } from "react";

import type { Equipment } from "./types";
import type { EquipmentFilter } from "./actions";
import { getEquipment, getEquipmentById } from "./actions";

// ── useEquipmentList ──────────────────────────────────────────

interface UseEquipmentListReturn {
  data: Equipment[];
  isLoading: boolean;
  mutate: () => void;
}

export function useEquipmentList(
  filter?: EquipmentFilter
): UseEquipmentListReturn {
  const [data, setData] = useState<Equipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getEquipment(filter)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load equipment list:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useEquipmentItem ──────────────────────────────────────────

interface UseEquipmentItemReturn {
  data: Equipment | null;
  isLoading: boolean;
  mutate: () => void;
}

export function useEquipmentItem(id: string): UseEquipmentItemReturn {
  const [data, setData] = useState<Equipment | null>(null);
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

    getEquipmentById(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load equipment item:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return { data, isLoading, mutate };
}
