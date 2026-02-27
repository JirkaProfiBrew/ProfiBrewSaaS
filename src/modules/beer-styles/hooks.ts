"use client";

import { useState, useEffect } from "react";
import { getBeerStylesForBrowser, getBeerStyleGroupsForBrowser } from "./actions";
import type { BeerStyleRow, BeerStyleGroupRow } from "./actions";

interface UseBeerStyleBrowserReturn {
  styles: BeerStyleRow[];
  groups: BeerStyleGroupRow[];
  isLoading: boolean;
}

export function useBeerStyleBrowser(): UseBeerStyleBrowserReturn {
  const [styles, setStyles] = useState<BeerStyleRow[]>([]);
  const [groups, setGroups] = useState<BeerStyleGroupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getBeerStylesForBrowser(), getBeerStyleGroupsForBrowser()])
      .then(([stylesResult, groupsResult]) => {
        if (!cancelled) {
          setStyles(stylesResult);
          setGroups(groupsResult);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load beer styles:", error);
        if (!cancelled) setIsLoading(false);
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  return { styles, groups, isLoading };
}
