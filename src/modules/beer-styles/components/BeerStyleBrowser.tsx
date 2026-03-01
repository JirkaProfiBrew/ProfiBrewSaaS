"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams, QuickFilter } from "@/components/data-browser";
import { BeerGlass } from "@/components/ui/beer-glass";

import { beerStyleBrowserConfig } from "../config";
import { useBeerStyleBrowser } from "../hooks";
import type { BeerStyleRow } from "../actions";

// ── Helpers ────────────────────────────────────────────────────

function formatRange(min: string | null, max: string | null): string {
  if (min == null && max == null) return "\u2014";
  if (min != null && max != null) return `${min}\u2013${max}`;
  return min ?? max ?? "\u2014";
}

function styleToRecord(style: BeerStyleRow): Record<string, unknown> {
  return {
    id: style.id,
    bjcpNumber: style.bjcpNumber,
    name: style.name,
    styleGroupId: style.styleGroupId,
    groupName: style.groupName,
    groupNameCz: style.groupNameCz ?? style.groupName,
    groupImageUrl: style.groupImageUrl,
    abvRange: formatRange(style.abvMin, style.abvMax),
    ibuRange: formatRange(style.ibuMin, style.ibuMax),
    ebcRange: formatRange(style.ebcMin, style.ebcMax),
    ogRange: formatRange(style.ogMin, style.ogMax),
    ebcMin: style.ebcMin,
    ebcMax: style.ebcMax,
    impression: style.impression,
  };
}

function matchesSearch(style: BeerStyleRow, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    style.name.toLowerCase().includes(term) ||
    (style.bjcpNumber?.toLowerCase().includes(term) ?? false) ||
    (style.groupNameCz?.toLowerCase().includes(term) ?? false) ||
    (style.groupName?.toLowerCase().includes(term) ?? false)
  );
}

function matchesGroupFilter(style: BeerStyleRow, groupId: string): boolean {
  if (!groupId || groupId === "all") return true;
  return style.styleGroupId === groupId;
}

function sortStyles(
  items: BeerStyleRow[],
  sortKey: string,
  direction: "asc" | "desc"
): BeerStyleRow[] {
  return [...items].sort((a, b) => {
    const recordA = styleToRecord(a);
    const recordB = styleToRecord(b);
    const valA = recordA[sortKey];
    const valB = recordB[sortKey];

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    let comparison = 0;
    if (typeof valA === "string" && typeof valB === "string") {
      comparison = valA.localeCompare(valB, "cs");
    } else {
      comparison = String(valA).localeCompare(String(valB), "cs");
    }

    return direction === "desc" ? -comparison : comparison;
  });
}

// ── Component ──────────────────────────────────────────────────

export function BeerStyleBrowser(): React.ReactNode {
  const t = useTranslations("beerStyles");
  const { params } = useDataBrowserParams(beerStyleBrowserConfig);
  const { styles, groups, isLoading } = useBeerStyleBrowser();

  // Quick filters: "All" + one per group
  const quickFilters: QuickFilter[] = useMemo(() => {
    const filters: QuickFilter[] = [
      { key: "all", label: t("quickFilters.all"), filter: {} },
    ];
    for (const group of groups) {
      filters.push({
        key: group.id,
        label: group.nameCz ?? group.name,
        filter: { groupId: group.id },
      });
    }
    return filters;
  }, [groups, t]);

  // Card view config with BeerGlass renderImage
  const cardViewConfig = useMemo(() => {
    const base = beerStyleBrowserConfig.views.card;
    if (base === false) return false as const;
    return {
      ...base,
      renderImage: (row: Record<string, unknown>): React.ReactNode => {
        const ebcMin = row.ebcMin != null ? Number(row.ebcMin) : null;
        const ebcMax = row.ebcMax != null ? Number(row.ebcMax) : null;
        const groupImageUrl = row.groupImageUrl as string | null;

        return (
          <div className="flex flex-col items-center gap-2 py-2">
            {groupImageUrl && (
              <Image
                src={groupImageUrl}
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 object-contain"
              />
            )}
            {ebcMin != null && ebcMax != null && (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <BeerGlass ebc={ebcMin} size="sm" />
                  <span className="text-[10px] text-muted-foreground">{ebcMin.toFixed(1)}</span>
                </div>
                <span className="text-muted-foreground text-xs">&rarr;</span>
                <div className="flex flex-col items-center">
                  <BeerGlass ebc={ebcMax} size="sm" />
                  <span className="text-[10px] text-muted-foreground">{ebcMax.toFixed(1)}</span>
                </div>
              </div>
            )}
            {!groupImageUrl && ebcMin == null && ebcMax == null && (
              <BeerGlass ebc={8} size="lg" />
            )}
          </div>
        );
      },
    };
  }, []);

  // Group filter options for parametric filter
  const groupFilterOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.nameCz ?? g.name,
      })),
    [groups]
  );

  // Build localized config
  const localizedConfig = useMemo(
    () => ({
      ...beerStyleBrowserConfig,
      title: t("title"),
      views: {
        ...beerStyleBrowserConfig.views,
        card: cardViewConfig,
      },
      columns: beerStyleBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}`),
      })),
      quickFilters,
      filters: beerStyleBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
        options: f.key === "groupNameCz" ? groupFilterOptions : f.options,
      })),
    }),
    [t, cardViewConfig, quickFilters, groupFilterOptions]
  );

  // Filter, sort, paginate
  const { pageData, totalCount } = useMemo(() => {
    let filtered = styles.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      // Quick filter = group filter
      if (params.quickFilter && params.quickFilter !== "all") {
        if (!matchesGroupFilter(item, params.quickFilter)) return false;
      }
      // Parametric filters
      for (const [key, value] of Object.entries(params.filters)) {
        if (value === undefined || value === null || value === "") continue;
        if (key === "name") {
          if (!item.name.toLowerCase().includes(String(value).toLowerCase()))
            return false;
        }
        if (key === "groupNameCz") {
          if (item.styleGroupId !== value) return false;
        }
      }
      return true;
    });

    filtered = sortStyles(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(styleToRecord),
      totalCount: total,
    };
  }, [styles, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params managed by useDataBrowserParams
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
