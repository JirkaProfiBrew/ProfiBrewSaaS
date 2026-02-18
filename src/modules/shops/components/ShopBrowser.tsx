"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { shopBrowserConfig } from "../config";
import { useShops } from "../hooks";
import type { Shop } from "../types";

// ── Helpers ────────────────────────────────────────────────────

/** Convert a Shop object to Record<string, unknown> for DataBrowser. */
function shopToRecord(shop: Shop): Record<string, unknown> {
  const addressParts = [
    shop.address?.street,
    shop.address?.city,
    shop.address?.zip,
  ].filter(Boolean);

  return {
    id: shop.id,
    tenantId: shop.tenantId,
    name: shop.name,
    shopType: shop.shopType,
    addressDisplay: addressParts.join(", "),
    isDefault: shop.isDefault,
    isActive: shop.isActive,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  };
}

/** Case-insensitive search across relevant shop fields. */
function matchesSearch(shop: Shop, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    shop.name.toLowerCase().includes(term) ||
    (shop.address?.street?.toLowerCase().includes(term) ?? false) ||
    (shop.address?.city?.toLowerCase().includes(term) ?? false) ||
    (shop.address?.zip?.toLowerCase().includes(term) ?? false)
  );
}

/** Apply quick filter based on shopType. */
function matchesQuickFilter(
  shop: Shop,
  quickFilterKey: string
): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  const quickFilter = shopBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filterValue = quickFilter.filter["shopType"];
  if (!filterValue) return true;

  return shop.shopType === filterValue;
}

/** Apply parametric filters from the filter panel. */
function matchesParametricFilters(
  shop: Shop,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const shopRecord = shopToRecord(shop);
    const fieldValue = shopRecord[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) {
        return false;
      }
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

/** Sort shops by a given key and direction. */
function sortShops(
  shopList: Shop[],
  sortKey: string,
  direction: "asc" | "desc"
): Shop[] {
  return [...shopList].sort((a, b) => {
    const recordA = shopToRecord(a);
    const recordB = shopToRecord(b);

    const valA = recordA[sortKey];
    const valB = recordB[sortKey];

    // Handle nulls — push them to the end
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

export function ShopBrowser(): React.ReactNode {
  const t = useTranslations("shops");
  const { params } = useDataBrowserParams(shopBrowserConfig);
  const { data: shopList, isLoading } = useShops();

  // Build localized config with translated labels
  const localizedConfig = useMemo(() => ({
    ...shopBrowserConfig,
    title: t("title"),
    columns: shopBrowserConfig.columns.map((col) => ({
      ...col,
      label: t(`columns.${col.key}`),
    })),
    quickFilters: shopBrowserConfig.quickFilters?.map((qf) => ({
      ...qf,
      label: t(`quickFilters.${qf.key}`),
    })),
    filters: shopBrowserConfig.filters?.map((f) => ({
      ...f,
      label: f.key === "shopType" ? t(`columns.shopType`) : t(`columns.${f.key}`),
      options: f.options?.map((opt) => ({
        ...opt,
        label: t(`shopType.${opt.value}`),
      })),
    })),
    actions: {
      ...shopBrowserConfig.actions,
      create: shopBrowserConfig.actions.create
        ? { ...shopBrowserConfig.actions.create, label: t("create") }
        : undefined,
    },
  }), [t]);

  // Derive filtered, sorted, and paginated data from params + data
  const { pageData, totalCount } = useMemo(() => {
    // 1. Filter
    let filtered = shopList.filter((shop) => {
      if (!matchesSearch(shop, params.search)) return false;
      if (!matchesQuickFilter(shop, params.quickFilter)) return false;
      if (!matchesParametricFilters(shop, params.filters)) return false;
      return true;
    });

    // 2. Sort
    filtered = sortShops(filtered, params.sort, params.sortDirection);

    // 3. Paginate
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(shopToRecord),
      totalCount: total,
    };
  }, [shopList, params]);

  // onParamsChange is called by DataBrowser on search change;
  // URL state is managed by useDataBrowserParams internally,
  // so we only need a no-op handler here for the prop contract.
  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params are managed by DataBrowser + useDataBrowserParams.
      // Client-side filtering is derived reactively via useMemo above.
    },
    []
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
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
