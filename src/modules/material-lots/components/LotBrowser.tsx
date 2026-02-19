"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { lotBrowserConfig } from "../config";
import { useMaterialLotList } from "../hooks";
import { deleteMaterialLot } from "../actions";
import type { MaterialLot } from "../types";

// ── Helpers ────────────────────────────────────────────────────

/** Convert a MaterialLot to Record<string, unknown> for DataBrowser. */
function lotToRecord(lot: MaterialLot): Record<string, unknown> {
  return {
    id: lot.id,
    tenantId: lot.tenantId,
    lotNumber: lot.lotNumber,
    itemId: lot.itemId,
    itemName: lot.itemName,
    supplierId: lot.supplierId,
    supplierName: lot.supplierName,
    receivedDate: lot.receivedDate,
    expiryDate: lot.expiryDate,
    quantityInitial: lot.quantityInitial,
    quantityRemaining: lot.quantityRemaining,
    unitPrice: lot.unitPrice,
    status: lot.status,
  };
}

/** Case-insensitive search across relevant lot fields. */
function matchesSearch(lot: MaterialLot, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    lot.lotNumber.toLowerCase().includes(term) ||
    (lot.itemName?.toLowerCase().includes(term) ?? false) ||
    (lot.supplierName?.toLowerCase().includes(term) ?? false)
  );
}

/** Apply quick filter. */
function matchesQuickFilter(lot: MaterialLot, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  // Special "expiring" filter — shows expiring AND expired lots
  if (quickFilterKey === "expiring") {
    return lot.status === "expiring" || lot.status === "expired";
  }

  // Special "exhausted" filter
  if (quickFilterKey === "exhausted") {
    return lot.status === "exhausted";
  }

  const quickFilter = lotBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  for (const [key, value] of Object.entries(quickFilter.filter)) {
    if (key.startsWith("_")) continue; // skip meta keys
    const record = lotToRecord(lot);
    if (record[key] !== value) return false;
  }
  return true;
}

/** Apply parametric filters. */
function matchesParametricFilters(
  lot: MaterialLot,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = lotToRecord(lot);
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

/** Sort lots by a given key and direction. */
function sortLots(
  list: MaterialLot[],
  sortKey: string,
  direction: "asc" | "desc"
): MaterialLot[] {
  return [...list].sort((a, b) => {
    const recordA = lotToRecord(a);
    const recordB = lotToRecord(b);

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

export function LotBrowser(): React.ReactNode {
  const t = useTranslations("materialLots");
  const tCommon = useTranslations("common");
  const { params } = useDataBrowserParams(lotBrowserConfig);
  const { data, isLoading, mutate } = useMaterialLotList();

  // Build localized config
  const localizedConfig = useMemo(
    () => ({
      ...lotBrowserConfig,
      title: t("browserTitle"),
      columns: lotBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}`),
        ...(col.key === "status" ? {
          valueLabels: {
            active: t("status.active"),
            exhausted: t("status.exhausted"),
            expiring: t("status.expiring"),
            expired: t("status.expired"),
          },
        } : {}),
      })),
      quickFilters: lotBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}`),
      })),
      filters: lotBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
      })),
      actions: {
        ...lotBrowserConfig.actions,
        create: lotBrowserConfig.actions.create
          ? { ...lotBrowserConfig.actions.create, label: t("create") }
          : undefined,
      },
    }),
    [t]
  );

  // Derive filtered, sorted, and paginated data
  const { pageData, totalCount } = useMemo(() => {
    // 1. Filter
    let filtered = data.filter((lot) => {
      if (!matchesSearch(lot, params.search)) return false;
      if (!matchesQuickFilter(lot, params.quickFilter)) return false;
      if (!matchesParametricFilters(lot, params.filters)) return false;
      return true;
    });

    // 2. Sort
    filtered = sortLots(filtered, params.sort, params.sortDirection);

    // 3. Paginate
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(lotToRecord),
      totalCount: total,
    };
  }, [data, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params are managed by DataBrowser + useDataBrowserParams.
    },
    []
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]): Promise<void> => {
      try {
        await Promise.all(ids.map((id) => deleteMaterialLot(id)));
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
          {t("title")}
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
