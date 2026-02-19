"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { batchBrowserConfig } from "../config";
import { useBatchList } from "../hooks";
import type { Batch } from "../types";

// ── In-progress statuses ──────────────────────────────────────

const IN_PROGRESS_STATUSES = [
  "brewing",
  "fermenting",
  "conditioning",
  "carbonating",
  "packaging",
];

// ── Helpers ────────────────────────────────────────────────────

/** Convert a Batch object to Record<string, unknown> for DataBrowser. */
function batchToRecord(item: Batch): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    batchNumber: item.batchNumber,
    batchSeq: item.batchSeq,
    recipeId: item.recipeId,
    itemId: item.itemId,
    status: item.status,
    brewStatus: item.brewStatus,
    plannedDate: item.plannedDate,
    brewDate: item.brewDate,
    endBrewDate: item.endBrewDate,
    actualVolumeL: item.actualVolumeL,
    ogActual: item.ogActual,
    fgActual: item.fgActual,
    abvActual: item.abvActual,
    equipmentId: item.equipmentId,
    primaryBatchId: item.primaryBatchId,
    isPaused: item.isPaused,
    notes: item.notes,
    brewerId: item.brewerId,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    recipeName: item.recipeName,
    itemName: item.itemName,
    itemCode: item.itemCode,
    equipmentName: item.equipmentName,
  };
}

/** Case-insensitive search across relevant batch fields. */
function matchesSearch(item: Batch, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.batchNumber.toLowerCase().includes(term) ||
    (item.itemName?.toLowerCase().includes(term) ?? false) ||
    (item.recipeName?.toLowerCase().includes(term) ?? false) ||
    (item.equipmentName?.toLowerCase().includes(term) ?? false)
  );
}

/** Apply quick filter. Special handling for "inProgress" to match multiple statuses. */
function matchesQuickFilter(item: Batch, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  // Special "inProgress" filter matches multiple statuses
  if (quickFilterKey === "inProgress") {
    return IN_PROGRESS_STATUSES.includes(item.status);
  }

  const quickFilter = batchBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filterValue = quickFilter.filter["status"];
  if (!filterValue) return true;

  return item.status === filterValue;
}

/** Apply parametric filters from the filter panel. */
function matchesParametricFilters(
  item: Batch,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = batchToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) {
        return false;
      }
    } else if (typeof value === "boolean") {
      if (fieldValue !== value) {
        return false;
      }
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

/** Sort batches by a given key and direction. */
function sortBatches(
  batchItems: Batch[],
  sortKey: string,
  direction: "asc" | "desc"
): Batch[] {
  return [...batchItems].sort((a, b) => {
    const recordA = batchToRecord(a);
    const recordB = batchToRecord(b);

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

export function BatchBrowser(): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const { params } = useDataBrowserParams(batchBrowserConfig);
  const { data: batchData, isLoading } = useBatchList();

  // Badge value label maps
  const statusLabels: Record<string, string> = {
    planned: t("status.planned"),
    brewing: t("status.brewing"),
    fermenting: t("status.fermenting"),
    conditioning: t("status.conditioning"),
    carbonating: t("status.carbonating"),
    packaging: t("status.packaging"),
    completed: t("status.completed"),
    dumped: t("status.dumped"),
  };

  // Build localized config with translated labels
  const localizedConfig = useMemo(
    () => ({
      ...batchBrowserConfig,
      title: t("title"),
      columns: batchBrowserConfig.columns.map((col) => {
        const valueLabels = col.key === "status" ? statusLabels : undefined;
        return { ...col, label: t(`columns.${col.key}` as Parameters<typeof t>[0]), valueLabels };
      }),
      quickFilters: batchBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}` as Parameters<typeof t>[0]),
      })),
      filters: batchBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
        options: f.options?.map((opt) => {
          const translationKey =
            f.key === "status" ? `status.${opt.value}` : null;
          return {
            ...opt,
            label: translationKey
              ? t(translationKey as Parameters<typeof t>[0])
              : opt.label,
          };
        }),
      })),
      actions: {
        ...batchBrowserConfig.actions,
        create: batchBrowserConfig.actions.create
          ? {
              ...batchBrowserConfig.actions.create,
              label: t("create"),
            }
          : undefined,
      },
    }),
    [t]
  );

  // Derive filtered, sorted, and paginated data from params + loaded data
  const { pageData, totalCount } = useMemo(() => {
    // 1. Filter
    let filtered = batchData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    // 2. Sort
    filtered = sortBatches(filtered, params.sort, params.sortDirection);

    // 3. Paginate
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(batchToRecord),
      totalCount: total,
    };
  }, [batchData, params]);

  // onParamsChange is called by DataBrowser on search change;
  // URL state is managed by useDataBrowserParams internally.
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
