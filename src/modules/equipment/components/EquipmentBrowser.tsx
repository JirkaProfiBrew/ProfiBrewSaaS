"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { equipmentBrowserConfig } from "../config";
import { useEquipmentList } from "../hooks";
import type { Equipment } from "../types";

// ── Helpers ────────────────────────────────────────────────────

/** Convert an Equipment object to Record<string, unknown> for DataBrowser. */
function equipmentToRecord(item: Equipment): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    shopId: item.shopId,
    name: item.name,
    equipmentType: item.equipmentType,
    volumeL: item.volumeL,
    status: item.status,
    currentBatchId: item.currentBatchId,
    properties: item.properties,
    notes: item.notes,
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    // Placeholder for shop name — will be populated when shops are connected
    shopName: null,
  };
}

/** Case-insensitive search across relevant equipment fields. */
function matchesSearch(item: Equipment, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.name.toLowerCase().includes(term) ||
    item.equipmentType.toLowerCase().includes(term) ||
    (item.notes?.toLowerCase().includes(term) ?? false)
  );
}

/** Apply quick filter based on equipmentType. */
function matchesQuickFilter(
  item: Equipment,
  quickFilterKey: string
): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  const quickFilter = equipmentBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filterValue = quickFilter.filter["equipmentType"];
  if (!filterValue) return true;

  return item.equipmentType === filterValue;
}

/** Apply parametric filters from the filter panel. */
function matchesParametricFilters(
  item: Equipment,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = equipmentToRecord(item);
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

/** Sort equipment by a given key and direction. */
function sortEquipment(
  items: Equipment[],
  sortKey: string,
  direction: "asc" | "desc"
): Equipment[] {
  return [...items].sort((a, b) => {
    const recordA = equipmentToRecord(a);
    const recordB = equipmentToRecord(b);

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

export function EquipmentBrowser(): React.ReactNode {
  const t = useTranslations("equipment");
  const router = useRouter();
  const pathname = usePathname();
  const { params } = useDataBrowserParams(equipmentBrowserConfig);
  const { data: equipmentData, isLoading } = useEquipmentList();

  // Build localized config with translated labels
  const localizedConfig = useMemo(
    () => ({
      ...equipmentBrowserConfig,
      title: t("title"),
      columns: equipmentBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}`),
      })),
      quickFilters: equipmentBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}`),
      })),
      filters: equipmentBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
        options: f.options?.map((opt) => {
          // Try to localize filter option labels
          const translationKey =
            f.key === "equipmentType"
              ? `equipmentType.${opt.value}`
              : f.key === "status"
                ? `status.${opt.value}`
                : null;
          return {
            ...opt,
            label: translationKey
              ? t(translationKey as Parameters<typeof t>[0])
              : opt.label,
          };
        }),
      })),
      actions: {
        ...equipmentBrowserConfig.actions,
        create: equipmentBrowserConfig.actions.create
          ? {
              ...equipmentBrowserConfig.actions.create,
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
    let filtered = equipmentData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    // 2. Sort
    filtered = sortEquipment(filtered, params.sort, params.sortDirection);

    // 3. Paginate
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(equipmentToRecord),
      totalCount: total,
    };
  }, [equipmentData, params]);

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
