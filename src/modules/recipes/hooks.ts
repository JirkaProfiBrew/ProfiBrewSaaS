"use client";

import { useState, useEffect, useCallback } from "react";

import type { Recipe, RecipeDetailData, BeerStyle, MashingProfile } from "./types";
import type { RecipeFilter, BrewMaterialOption } from "./actions";
import {
  getRecipes,
  getRecipeDetail,
  getBeerStyles,
  getMashingProfiles,
  getBrewMaterialItems,
} from "./actions";

// ── useRecipeList ──────────────────────────────────────────────

interface UseRecipeListReturn {
  data: Recipe[];
  isLoading: boolean;
  mutate: () => void;
}

export function useRecipeList(filter?: RecipeFilter): UseRecipeListReturn {
  const [data, setData] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getRecipes(filter)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load recipe list:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useRecipeDetail ────────────────────────────────────────────

interface UseRecipeDetailReturn {
  data: RecipeDetailData | null;
  isLoading: boolean;
  mutate: () => void;
}

export function useRecipeDetail(id: string): UseRecipeDetailReturn {
  const [data, setData] = useState<RecipeDetailData | null>(null);
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

    getRecipeDetail(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load recipe detail:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useBeerStyles ──────────────────────────────────────────────

interface UseBeerStylesReturn {
  data: BeerStyle[];
  isLoading: boolean;
}

export function useBeerStyles(): UseBeerStylesReturn {
  const [data, setData] = useState<BeerStyle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getBeerStyles()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load beer styles:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  return { data, isLoading };
}

// ── useBrewMaterialItems ──────────────────────────────────────

interface UseBrewMaterialItemsReturn {
  data: BrewMaterialOption[];
  isLoading: boolean;
}

export function useBrewMaterialItems(): UseBrewMaterialItemsReturn {
  const [data, setData] = useState<BrewMaterialOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getBrewMaterialItems()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load brew material items:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  return { data, isLoading };
}

// ── useMashingProfiles ─────────────────────────────────────────

interface UseMashingProfilesReturn {
  data: MashingProfile[];
  isLoading: boolean;
}

export function useMashingProfiles(): UseMashingProfilesReturn {
  const [data, setData] = useState<MashingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getMashingProfiles()
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
  }, []);

  return { data, isLoading };
}
