"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { warehouseBrowserConfig } from "../config";
import { useWarehouseList } from "../hooks";
import type { Warehouse } from "../types";

// ── Helpers ────────────────────────────────────────────────────

/** Convert a Warehouse object to Record<string, unknown> for DataBrowser. */
function warehouseToRecord(item: Warehouse): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    shopId: item.shopId,
    code: item.code,
    name: item.name,
    isExciseRelevant: item.isExciseRelevant,
    categoriesDisplay: item.categories?.join(", ") ?? "",
    isDefault: item.isDefault,
    isActive: item.isActive,
    shopName: null, // will be resolved when shops are connected
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Case-insensitive search across relevant warehouse fields. */
function matchesSearch(item: Warehouse, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.name.toLowerCase().includes(term) ||
    item.code.toLowerCase().includes(term)
  );
}

/** Apply quick filter. */
function matchesQuickFilter(
  item: Warehouse,
  quickFilterKey: string
): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  const quickFilter = warehouseBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filter = quickFilter.filter;
  if (filter["isActive"] !== undefined && item.isActive !== filter["isActive"])
    return false;
  if (
    filter["isExciseRelevant"] !== undefined &&
    item.isExciseRelevant !== filter["isExciseRelevant"]
  )
    return false;

  return true;
}

/** Apply parametric filters from the filter panel. */
function matchesParametricFilters(
  item: Warehouse,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = warehouseToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "boolean") {
      if (fieldValue !== value) return false;
    } else if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

/** Sort warehouses by a given key and direction. */
function sortWarehouses(
  items: Warehouse[],
  sortKey: string,
  direction: "asc" | "desc"
): Warehouse[] {
  return [...items].sort((a, b) => {
    const recordA = warehouseToRecord(a);
    const recordB = warehouseToRecord(b);

    const valA = recordA[sortKey];
    const valB = recordB[sortKey];

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    let comparison = 0;
    if (typeof valA === "string" && typeof valB === "string") {
      comparison = valA.localeCompare(valB, "cs");
    } else if (valA instanceof Date && valB instanceof Date) {
      comparison = valA.getTime() - valB.getTime();
    } else {
      comparison = String(valA).localeCompare(String(valB), "cs");
    }

    return direction === "desc" ? -comparison : comparison;
  });
}

// ── Component ──────────────────────────────────────────────────

export function WarehouseBrowser(): React.ReactNode {
  const t = useTranslations("warehouses");
  const { params } = useDataBrowserParams(warehouseBrowserConfig);
  const { data: warehouseData, isLoading } = useWarehouseList();

  // Build localized config with translated labels
  const localizedConfig = useMemo(
    () => ({
      ...warehouseBrowserConfig,
      title: t("title"),
      columns: warehouseBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}`),
      })),
      quickFilters: warehouseBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}`),
      })),
      filters: warehouseBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
      })),
      actions: {
        ...warehouseBrowserConfig.actions,
        create: warehouseBrowserConfig.actions.create
          ? {
              ...warehouseBrowserConfig.actions.create,
              label: t("create"),
            }
          : undefined,
      },
    }),
    [t]
  );

  // Derive filtered, sorted, and paginated data
  const { pageData, totalCount } = useMemo(() => {
    let filtered = warehouseData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    filtered = sortWarehouses(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(warehouseToRecord),
      totalCount: total,
    };
  }, [warehouseData, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params managed by DataBrowser + useDataBrowserParams
    },
    []
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      </div>
      <DataBrowser
        config={localizedConfig}
        data={pageData}
        totalCount={totalCount}
        isLoading={isLoading}
        onParamsChange={handleParamsChange}
      />
    </div>
  );
}
