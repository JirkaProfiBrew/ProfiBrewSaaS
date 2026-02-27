"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { mashProfileBrowserConfig } from "../config";
import { useMashingProfileList } from "../hooks";
import { deleteMashingProfile } from "../actions";
import type { MashingProfile } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function profileToRecord(
  item: MashingProfile,
  mashingTypeLabels: Record<string, string>,
  isSystemLabels: Record<string, string>
): Record<string, unknown> {
  const stepsPreview = item.steps.length > 0
    ? item.steps.map((s) => `${s.temperature}°C`).join(" → ")
    : "—";

  return {
    id: item.id,
    tenantId: item.tenantId,
    name: item.name,
    mashingType: item.mashingType,
    mashingTypeLabel: item.mashingType
      ? (mashingTypeLabels[item.mashingType] ?? item.mashingType)
      : "—",
    description: item.description,
    stepCount: item.steps.length,
    stepsPreview,
    isSystem: item.isSystem,
    isSystemLabel: item.isSystem ? isSystemLabels["true"] : isSystemLabels["false"],
    notes: item.notes,
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function matchesSearch(item: MashingProfile, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.name.toLowerCase().includes(term) ||
    (item.description?.toLowerCase().includes(term) ?? false)
  );
}

function matchesQuickFilter(item: MashingProfile, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;
  if (quickFilterKey === "system") return item.isSystem;
  if (quickFilterKey === "custom") return !item.isSystem;
  return true;
}

function sortProfiles(
  items: MashingProfile[],
  sortKey: string,
  direction: "asc" | "desc"
): MashingProfile[] {
  return [...items].sort((a, b) => {
    let valA: unknown;
    let valB: unknown;

    switch (sortKey) {
      case "name":
        valA = a.name;
        valB = b.name;
        break;
      case "mashingTypeLabel":
        valA = a.mashingType ?? "";
        valB = b.mashingType ?? "";
        break;
      case "stepCount":
        valA = a.steps.length;
        valB = b.steps.length;
        break;
      default:
        valA = a.name;
        valB = b.name;
    }

    let comparison = 0;
    if (typeof valA === "number" && typeof valB === "number") {
      comparison = valA - valB;
    } else {
      comparison = String(valA).localeCompare(String(valB), "cs");
    }

    return direction === "desc" ? -comparison : comparison;
  });
}

// ── Component ──────────────────────────────────────────────────

export function MashProfileBrowser(): React.ReactNode {
  const t = useTranslations("mashingProfiles");
  const tCommon = useTranslations("common");
  const { params } = useDataBrowserParams(mashProfileBrowserConfig);
  const { data: profiles, isLoading, mutate } = useMashingProfileList();

  const mashingTypeLabels: Record<string, string> = {
    infusion: t("mashingType.infusion"),
    decoction: t("mashingType.decoction"),
    step: t("mashingType.step"),
  };

  const isSystemLabels: Record<string, string> = {
    true: t("isSystemLabel.true"),
    false: t("isSystemLabel.false"),
  };

  // Build localized config
  const localizedConfig = useMemo(
    () => ({
      ...mashProfileBrowserConfig,
      title: t("title"),
      columns: mashProfileBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}` as Parameters<typeof t>[0]),
      })),
      quickFilters: mashProfileBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}` as Parameters<typeof t>[0]),
      })),
      actions: {
        ...mashProfileBrowserConfig.actions,
        create: mashProfileBrowserConfig.actions.create
          ? {
              ...mashProfileBrowserConfig.actions.create,
              label: t("create"),
            }
          : undefined,
      },
    }),
    [t]
  );

  // Filter, sort, paginate
  const { pageData, totalCount } = useMemo(() => {
    let filtered = profiles.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      return true;
    });

    filtered = sortProfiles(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map((p) => profileToRecord(p, mashingTypeLabels, isSystemLabels)),
      totalCount: total,
    };
  }, [profiles, params, mashingTypeLabels, isSystemLabels]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params managed by DataBrowser + useDataBrowserParams
    },
    []
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]): Promise<void> => {
      try {
        await Promise.all(ids.map((deleteId) => deleteMashingProfile(deleteId)));
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
