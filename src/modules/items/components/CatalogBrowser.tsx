"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { catalogBrowserConfig } from "../config";
import { useItemsWithStock } from "../hooks";
import { deleteItem } from "../actions";
import type { Item } from "../types";

// ── Extended item type with stock data ────────────────────────

type ItemWithStock = Item & {
  totalQty: number;
  reservedQty: number;
  demandedQty: number;
  availableQty: number;
};

// ── Helpers ────────────────────────────────────────────────────

/** Convert an Item+Stock to Record<string, unknown> for DataBrowser. */
function itemToRecord(item: ItemWithStock): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    name: item.name,
    isBrewMaterial: item.isBrewMaterial,
    isSaleItem: item.isSaleItem,
    materialType: item.materialType,
    stockCategory: item.stockCategory,
    totalQty: item.totalQty,
    reservedQty: item.reservedQty,
    demandedQty: item.demandedQty,
    availableQty: item.availableQty,
    costPrice: item.costPrice,
    isActive: item.isActive,
  };
}

/** Case-insensitive search across relevant item fields. */
function matchesSearch(item: ItemWithStock, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.name.toLowerCase().includes(term) ||
    item.code.toLowerCase().includes(term) ||
    (item.brand?.toLowerCase().includes(term) ?? false)
  );
}

/** Apply quick filter. */
function matchesQuickFilter(item: ItemWithStock, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  // Special "zeroStock" filter
  if (quickFilterKey === "zeroStock") {
    return item.totalQty === 0;
  }

  const quickFilter = catalogBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  for (const [key, value] of Object.entries(quickFilter.filter)) {
    if (key.startsWith("_")) continue; // skip meta keys
    const record = itemToRecord(item);
    if (record[key] !== value) return false;
  }
  return true;
}

/** Apply parametric filters. */
function matchesParametricFilters(
  item: ItemWithStock,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = itemToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (fieldValue !== value) return false;
    } else if (typeof value === "boolean") {
      if (fieldValue !== value) return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

/** Sort items by a given key and direction. */
function sortItems(
  list: ItemWithStock[],
  sortKey: string,
  direction: "asc" | "desc"
): ItemWithStock[] {
  return [...list].sort((a, b) => {
    const recordA = itemToRecord(a);
    const recordB = itemToRecord(b);

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

export function CatalogBrowser(): React.ReactNode {
  const t = useTranslations("items");
  const tCommon = useTranslations("common");
  const { params } = useDataBrowserParams(catalogBrowserConfig);
  const { items: data, isLoading, mutate } = useItemsWithStock({ isActive: true });

  // Build localized config
  const localizedConfig = useMemo(
    () => ({
      ...catalogBrowserConfig,
      title: t("catalogTitle"),
      columns: catalogBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}`),
        ...(col.key === "materialType" ? {
          valueLabels: {
            malt: t("materialType.malt"),
            hop: t("materialType.hop"),
            yeast: t("materialType.yeast"),
            adjunct: t("materialType.adjunct"),
            other: t("materialType.other"),
          },
        } : {}),
      })),
      quickFilters: catalogBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}`),
      })),
      actions: {
        ...catalogBrowserConfig.actions,
        create: catalogBrowserConfig.actions.create
          ? { ...catalogBrowserConfig.actions.create, label: t("catalogCreate") }
          : undefined,
      },
    }),
    [t]
  );

  // Derive filtered, sorted, and paginated data
  const { pageData, totalCount } = useMemo(() => {
    // 1. Filter
    let filtered = data.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    // 2. Sort
    filtered = sortItems(filtered, params.sort, params.sortDirection);

    // 3. Paginate
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(itemToRecord),
      totalCount: total,
    };
  }, [data, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params are managed by DataBrowser + useDataBrowserParams.
      // Client-side filtering is derived reactively via useMemo above.
    },
    []
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]): Promise<void> => {
      try {
        await Promise.all(ids.map((id) => deleteItem(id)));
        toast.success(tCommon("bulkDeleteSuccess", { count: ids.length }));
        mutate();
      } catch (error: unknown) {
        console.error("Bulk delete failed:", error);
        toast.error(tCommon("bulkDeleteFailed"));
        mutate();
      }
    },
    [tCommon, mutate]
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("catalogTitle")}
        </h1>
      </div>
      <DataBrowser
        config={localizedConfig}
        data={pageData}
        totalCount={totalCount}
        isLoading={isLoading}
        onParamsChange={handleParamsChange}
        onBulkDelete={handleBulkDelete}
      />
    </div>
  );
}
