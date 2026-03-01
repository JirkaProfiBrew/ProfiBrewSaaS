"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { brewingSystemBrowserConfig } from "../config";
import { useBrewingSystemList } from "../hooks";
import { deleteBrewingSystem } from "../actions";
import { calculateVolumes } from "../types";
import type { BrewingSystem } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function systemToRecord(item: BrewingSystem): Record<string, unknown> {
  const volumes = calculateVolumes({
    batchSizeL: item.batchSizeL,
    evaporationRatePctPerHour: item.evaporationRatePctPerHour,
    kettleTrubLossL: item.kettleTrubLossL,
    whirlpoolLossPct: item.whirlpoolLossPct,
    fermentationLossPct: item.fermentationLossPct,
  });

  return {
    id: item.id,
    tenantId: item.tenantId,
    name: item.name,
    batchSizeL: item.batchSizeL,
    batchSizeLDisplay: `${Number(item.batchSizeL).toFixed(0)} L`,
    efficiencyPct: item.efficiencyPct,
    efficiencyPctDisplay: `${Number(item.efficiencyPct).toFixed(0)} %`,
    finishedBeerL: volumes.finishedBeerL,
    finishedBeerLDisplay: `${volumes.finishedBeerL.toFixed(0)} L`,
    shopName: item.shopName ?? null,
    isPrimary: item.isPrimary,
    isActive: item.isActive,
  };
}

function matchesSearch(item: BrewingSystem, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.name.toLowerCase().includes(term) ||
    (item.description?.toLowerCase().includes(term) ?? false)
  );
}

function matchesQuickFilter(
  item: BrewingSystem,
  quickFilterKey: string
): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;
  if (quickFilterKey === "active") return item.isActive;
  return true;
}

function matchesParametricFilters(
  item: BrewingSystem,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "isActive" && typeof value === "boolean") {
      if (item.isActive !== value) return false;
    }
  }
  return true;
}

function sortSystems(
  items: BrewingSystem[],
  sortKey: string,
  direction: "asc" | "desc"
): BrewingSystem[] {
  return [...items].sort((a, b) => {
    const recordA = systemToRecord(a);
    const recordB = systemToRecord(b);

    const valA = recordA[sortKey];
    const valB = recordB[sortKey];

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    let comparison = 0;
    if (typeof valA === "number" && typeof valB === "number") {
      comparison = valA - valB;
    } else if (typeof valA === "string" && typeof valB === "string") {
      comparison = valA.localeCompare(valB, "cs");
    } else {
      comparison = String(valA).localeCompare(String(valB), "cs");
    }

    return direction === "desc" ? -comparison : comparison;
  });
}

// ── Component ──────────────────────────────────────────────────

export function BrewingSystemBrowser(): React.ReactNode {
  const t = useTranslations("brewingSystems");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { params } = useDataBrowserParams(brewingSystemBrowserConfig);
  const activeFilter = useMemo(() => ({ isActive: true }), []);
  const { data: systemsData, isLoading, mutate } = useBrewingSystemList(activeFilter);

  const isPrimaryLabels: Record<string, string> = {
    true: t("columns.isPrimary"),
    false: "",
  };

  const localizedConfig = useMemo(
    () => ({
      ...brewingSystemBrowserConfig,
      title: t("title"),
      columns: brewingSystemBrowserConfig.columns.map((col) => {
        const valueLabels =
          col.key === "isPrimary" ? isPrimaryLabels : undefined;
        return {
          ...col,
          label: t(`columns.${col.key}` as Parameters<typeof t>[0]),
          valueLabels,
        };
      }),
      quickFilters: brewingSystemBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}` as Parameters<typeof t>[0]),
      })),
      filters: brewingSystemBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`columns.${f.key}` as Parameters<typeof t>[0]),
      })),
      actions: {
        ...brewingSystemBrowserConfig.actions,
        create: brewingSystemBrowserConfig.actions.create
          ? {
              ...brewingSystemBrowserConfig.actions.create,
              label: t("create"),
            }
          : undefined,
      },
    }),
    [t]
  );

  const { pageData, totalCount } = useMemo(() => {
    let filtered = systemsData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    filtered = sortSystems(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(systemToRecord),
      totalCount: total,
    };
  }, [systemsData, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params managed by DataBrowser + useDataBrowserParams
    },
    []
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]): Promise<void> => {
      try {
        await Promise.all(ids.map((id) => deleteBrewingSystem(id)));
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
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
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
