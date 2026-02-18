"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type {
  DataBrowserConfig,
  DataBrowserParams,
  ViewMode,
  SortDirection,
} from "./types";

function parseViewMode(value: string | null, config: DataBrowserConfig): ViewMode {
  if (value === "card" && config.views.card !== false && config.views.card.enabled) {
    return "card";
  }
  return "list";
}

function parseSortDirection(value: string | null): SortDirection {
  if (value === "desc") return "desc";
  return "asc";
}

function parseFilters(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

interface UseDataBrowserParamsReturn {
  params: DataBrowserParams;
  setView: (view: ViewMode) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (key: string) => void;
  setSearch: (search: string) => void;
  setQuickFilter: (key: string) => void;
  setFilters: (filters: Record<string, unknown>) => void;
  removeFilter: (key: string) => void;
  clearFilters: () => void;
  resetAll: () => void;
}

export function useDataBrowserParams(
  config: DataBrowserConfig
): UseDataBrowserParamsReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const params: DataBrowserParams = useMemo(() => {
    const defaultView: ViewMode =
      config.views.list.default !== false ? "list" : "card";

    return {
      view: parseViewMode(searchParams.get("view"), config) || defaultView,
      page: Math.max(1, Number(searchParams.get("page")) || 1),
      pageSize:
        Number(searchParams.get("pageSize")) || config.pageSize,
      sort: searchParams.get("sort") || config.defaultSort.key,
      sortDirection: parseSortDirection(
        searchParams.get("sortDirection")
      ) || config.defaultSort.direction,
      search: searchParams.get("search") || "",
      quickFilter: searchParams.get("quickFilter") || "",
      filters: parseFilters(searchParams.get("filters")),
    };
  }, [searchParams, config]);

  const updateParams = useCallback(
    (updates: Partial<DataBrowserParams>): void => {
      const newParams = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === "") {
          newParams.delete(key);
        } else if (key === "filters") {
          const filterStr = JSON.stringify(value);
          if (filterStr === "{}") {
            newParams.delete("filters");
          } else {
            newParams.set("filters", filterStr);
          }
        } else {
          newParams.set(key, String(value));
        }
      }

      const queryString = newParams.toString();
      router.replace(
        queryString ? `${pathname}?${queryString}` : pathname,
        { scroll: false }
      );
    },
    [searchParams, router, pathname]
  );

  const setView = useCallback(
    (view: ViewMode): void => {
      updateParams({ view });
    },
    [updateParams]
  );

  const setPage = useCallback(
    (page: number): void => {
      updateParams({ page });
    },
    [updateParams]
  );

  const setPageSize = useCallback(
    (pageSize: number): void => {
      updateParams({ pageSize, page: 1 });
    },
    [updateParams]
  );

  const setSort = useCallback(
    (key: string): void => {
      const newDirection: SortDirection =
        params.sort === key && params.sortDirection === "asc" ? "desc" : "asc";
      updateParams({ sort: key, sortDirection: newDirection, page: 1 });
    },
    [updateParams, params.sort, params.sortDirection]
  );

  const setSearch = useCallback(
    (search: string): void => {
      updateParams({ search, page: 1 });
    },
    [updateParams]
  );

  const setQuickFilter = useCallback(
    (key: string): void => {
      updateParams({ quickFilter: key, page: 1 });
    },
    [updateParams]
  );

  const setFilters = useCallback(
    (filters: Record<string, unknown>): void => {
      updateParams({ filters, page: 1 });
    },
    [updateParams]
  );

  const removeFilter = useCallback(
    (key: string): void => {
      const newFilters = { ...params.filters };
      delete newFilters[key];
      updateParams({ filters: newFilters, page: 1 });
    },
    [updateParams, params.filters]
  );

  const clearFilters = useCallback((): void => {
    updateParams({
      filters: {},
      quickFilter: "",
      search: "",
      page: 1,
    });
  }, [updateParams]);

  const resetAll = useCallback((): void => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return {
    params,
    setView,
    setPage,
    setPageSize,
    setSort,
    setSearch,
    setQuickFilter,
    setFilters,
    removeFilter,
    clearFilters,
    resetAll,
  };
}
