"use client";

import { useState, useEffect, useCallback } from "react";

import type { MashingProfile } from "@/modules/mashing-profiles/types";
import {
  adminGetMashingProfiles,
  adminGetMashingProfile,
} from "./actions";

// ── useAdminMashingProfiles ──────────────────────────────────

interface UseAdminMashingProfilesReturn {
  data: MashingProfile[];
  isLoading: boolean;
  mutate: () => void;
}

export function useAdminMashingProfiles(): UseAdminMashingProfilesReturn {
  const [data, setData] = useState<MashingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    adminGetMashingProfiles()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load admin mashing profiles:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { data, isLoading, mutate };
}

// ── useAdminMashingProfile ───────────────────────────────────

interface UseAdminMashingProfileReturn {
  data: MashingProfile | null;
  isLoading: boolean;
  mutate: () => void;
}

export function useAdminMashingProfile(
  id: string
): UseAdminMashingProfileReturn {
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

    adminGetMashingProfile(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load admin mashing profile:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return { data, isLoading, mutate };
}
