"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { BeerGlass } from "@/components/ui/beer-glass";

import { recipeBrowserConfig } from "../config";
import { useRecipeList } from "../hooks";
import { deleteRecipe } from "../actions";
import type { Recipe } from "../types";

// ── Helpers ────────────────────────────────────────────────────

/** Convert a Recipe object to Record<string, unknown> for DataBrowser. */
function recipeToRecord(item: Recipe): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    name: item.name,
    beerStyleId: item.beerStyleId,
    beerStyleName: item.beerStyleName,
    status: item.status,
    og: item.og,
    fg: item.fg,
    abv: item.abv,
    ibu: item.ibu,
    ebc: item.ebc,
    batchSizeL: item.batchSizeL,
    boilTimeMin: item.boilTimeMin,
    costPrice: item.costPrice,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Case-insensitive search across relevant recipe fields. */
function matchesSearch(item: Recipe, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.name.toLowerCase().includes(term) ||
    (item.code?.toLowerCase().includes(term) ?? false) ||
    (item.beerStyleName?.toLowerCase().includes(term) ?? false)
  );
}

/** Apply quick filter based on status field. */
function matchesQuickFilter(item: Recipe, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  const quickFilter = recipeBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filterValue = quickFilter.filter["status"];
  if (!filterValue) return true;

  return item.status === filterValue;
}

/** Apply parametric filters from the filter panel. */
function matchesParametricFilters(
  item: Recipe,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = recipeToRecord(item);
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

/** Sort recipes by a given key and direction. */
function sortRecipes(
  items: Recipe[],
  sortKey: string,
  direction: "asc" | "desc"
): Recipe[] {
  return [...items].sort((a, b) => {
    const recordA = recipeToRecord(a);
    const recordB = recipeToRecord(b);

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

export function RecipeBrowser(): React.ReactNode {
  const t = useTranslations("recipes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const { params } = useDataBrowserParams(recipeBrowserConfig);
  const { data: recipeData, isLoading, mutate } = useRecipeList();

  // Badge value label maps
  const statusLabels: Record<string, string> = {
    draft: t("status.draft"),
    active: t("status.active"),
    archived: t("status.archived"),
  };

  // Card view config with BeerGlass renderImage
  const cardViewConfig = useMemo(() => {
    const base = recipeBrowserConfig.views.card;
    if (base === false) return false as const;
    return {
      ...base,
      renderImage: (row: Record<string, unknown>): React.ReactNode => {
        const ebc = row.ebc;
        if (ebc == null) return null;
        return <BeerGlass ebc={Number(ebc)} size="lg" />;
      },
    };
  }, []);

  // Build localized config with translated labels
  const localizedConfig = useMemo(
    () => ({
      ...recipeBrowserConfig,
      title: t("title"),
      views: {
        ...recipeBrowserConfig.views,
        card: cardViewConfig,
      },
      columns: recipeBrowserConfig.columns.map((col) => {
        const valueLabels = col.key === "status" ? statusLabels : undefined;
        return { ...col, label: t(`columns.${col.key}`), valueLabels };
      }),
      quickFilters: recipeBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}`),
      })),
      filters: recipeBrowserConfig.filters?.map((f) => ({
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
        ...recipeBrowserConfig.actions,
        create: recipeBrowserConfig.actions.create
          ? {
              ...recipeBrowserConfig.actions.create,
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
    let filtered = recipeData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    // 2. Sort
    filtered = sortRecipes(filtered, params.sort, params.sortDirection);

    // 3. Paginate
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(recipeToRecord),
      totalCount: total,
    };
  }, [recipeData, params]);

  // onParamsChange is called by DataBrowser on search change;
  // URL state is managed by useDataBrowserParams internally.
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
        await Promise.all(ids.map((id) => deleteRecipe(id)));
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
