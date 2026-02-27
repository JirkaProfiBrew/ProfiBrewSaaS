"use client";

import { useState, useEffect, useCallback } from "react";

import type { MashingProfile } from "./types";
import type { MashingProfileFilter } from "./actions";
import { getMashingProfiles, getMashingProfile } from "./actions";

// ── useMashingProfileList ────────────────────────────────────

interface UseMashingProfileListReturn {
  data: MashingProfile[];
  isLoading: boolean;
  mutate: () => void;
}

export function useMashingProfileList(
  filter?: MashingProfileFilter
): UseMashingProfileListReturn {
  const [data, setData] = useState<MashingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getMashingProfiles(filter)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load mashing profiles:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useMashingProfile ────────────────────────────────────────

interface UseMashingProfileReturn {
  data: MashingProfile | null;
  isLoading: boolean;
  mutate: () => void;
}

export function useMashingProfile(id: string): UseMashingProfileReturn {
  const [data, setData] = useState<MashingProfile | null>(null);
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

    getMashingProfile(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load mashing profile:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return { data, isLoading, mutate };
}
