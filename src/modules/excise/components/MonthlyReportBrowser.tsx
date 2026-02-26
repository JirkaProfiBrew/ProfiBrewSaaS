"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { monthlyReportBrowserConfig } from "../config";
import { useMonthlyReports } from "../hooks";
import type { ExciseMonthlyReport } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function reportToRecord(
  item: ExciseMonthlyReport
): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    period: item.period,
    openingBalanceHl: item.openingBalanceHl,
    productionHl: item.productionHl,
    releaseHl: item.releaseHl,
    lossHl: item.lossHl,
    closingBalanceHl: item.closingBalanceHl,
    totalTax: item.totalTax,
    status: item.status,
    createdAt: item.createdAt,
  };
}

function matchesSearch(
  item: ExciseMonthlyReport,
  search: string
): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.period.toLowerCase().includes(term) ||
    (item.notes?.toLowerCase().includes(term) ?? false)
  );
}

function matchesQuickFilter(
  item: ExciseMonthlyReport,
  quickFilterKey: string
): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  const quickFilter = monthlyReportBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filter = quickFilter.filter;
  if (filter["status"] && item.status !== filter["status"]) return false;

  return true;
}

function matchesParametricFilters(
  item: ExciseMonthlyReport,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = reportToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase()))
        return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

function sortReports(
  items: ExciseMonthlyReport[],
  sortKey: string,
  direction: "asc" | "desc"
): ExciseMonthlyReport[] {
  return [...items].sort((a, b) => {
    const recordA = reportToRecord(a);
    const recordB = reportToRecord(b);

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

export function MonthlyReportBrowser(): React.ReactNode {
  const t = useTranslations("excise");
  const router = useRouter();
  const { params } = useDataBrowserParams(monthlyReportBrowserConfig);
  const { data: reportData, isLoading } = useMonthlyReports();

  // Badge label maps
  const statusLabels: Record<string, string> = {
    draft: t("reports.status.draft"),
    submitted: t("reports.status.submitted"),
    accepted: t("reports.status.accepted"),
  };

  // Localized config
  const localizedConfig = useMemo(
    () => ({
      ...monthlyReportBrowserConfig,
      title: t("reports.title"),
      columns: monthlyReportBrowserConfig.columns.map((col) => {
        let valueLabels: Record<string, string> | undefined;
        if (col.key === "status") valueLabels = statusLabels;
        return {
          ...col,
          label: t(
            `reports.columns.${col.key}` as Parameters<typeof t>[0]
          ),
          valueLabels,
        };
      }),
      quickFilters: monthlyReportBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(
          `reports.quickFilters.${qf.key}` as Parameters<typeof t>[0]
        ),
      })),
      actions: { ...monthlyReportBrowserConfig.actions, create: { label: t("reports.generate"), enabled: true } },
      filters: monthlyReportBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`reports.columns.${f.key}` as Parameters<typeof t>[0]),
        options: f.options?.map((opt) => ({
          ...opt,
          label: t(
            `reports.status.${opt.value}` as Parameters<typeof t>[0]
          ),
        })),
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  // Filtered, sorted, paginated data
  const { pageData, totalCount } = useMemo(() => {
    let filtered = reportData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    filtered = sortReports(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(reportToRecord),
      totalCount: total,
    };
  }, [reportData, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params managed by DataBrowser + useDataBrowserParams
    },
    []
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">
        {t("reports.title")}
      </h1>
      <DataBrowser
        config={localizedConfig}
        data={pageData}
        totalCount={totalCount}
        isLoading={isLoading}
        onParamsChange={handleParamsChange}
        onRowClick={(row) => {
          router.push(`/stock/monthly-report/${row.id as string}`);
        }}
      />
    </div>
  );
}
