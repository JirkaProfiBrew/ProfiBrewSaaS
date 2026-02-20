"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";
import { Button } from "@/components/ui/button";

import { cashflowBrowserConfig } from "../config";
import { useCashFlowList } from "../hooks";
import type { CashFlow } from "../types";

import { CashFlowSummaryPanel } from "./CashFlowSummaryPanel";

// ── Helpers ────────────────────────────────────────────────────

function cashflowToRecord(item: CashFlow): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    date: item.date,
    cashflowType: item.cashflowType,
    categoryName: item.categoryName ?? "",
    description: item.description ?? "",
    partnerName: item.partnerName ?? "",
    amount: item.amount,
    status: item.status,
  };
}

function matchesSearch(item: CashFlow, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    (item.code?.toLowerCase().includes(term) ?? false) ||
    (item.description?.toLowerCase().includes(term) ?? false) ||
    (item.partnerName?.toLowerCase().includes(term) ?? false) ||
    (item.categoryName?.toLowerCase().includes(term) ?? false)
  );
}

function matchesQuickFilter(item: CashFlow, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  switch (quickFilterKey) {
    case "income":
      return item.cashflowType === "income";
    case "expense":
      return item.cashflowType === "expense";
    case "planned":
      return item.status === "planned";
    case "paid":
      return item.status === "paid";
    default:
      return true;
  }
}

function matchesParametricFilters(
  item: CashFlow,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = cashflowToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

function sortCashFlows(
  items: CashFlow[],
  sortKey: string,
  direction: "asc" | "desc"
): CashFlow[] {
  return [...items].sort((a, b) => {
    const recordA = cashflowToRecord(a);
    const recordB = cashflowToRecord(b);

    const valA = recordA[sortKey];
    const valB = recordB[sortKey];

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    let comparison = 0;
    if (sortKey === "amount") {
      comparison = (parseFloat(String(valA)) || 0) - (parseFloat(String(valB)) || 0);
    } else if (typeof valA === "string" && typeof valB === "string") {
      comparison = valA.localeCompare(valB, "cs");
    } else {
      comparison = String(valA).localeCompare(String(valB), "cs");
    }

    return direction === "desc" ? -comparison : comparison;
  });
}

// ── Component ──────────────────────────────────────────────────

export function CashFlowBrowser(): React.ReactNode {
  const t = useTranslations("cashflows");
  const router = useRouter();
  const { params } = useDataBrowserParams(cashflowBrowserConfig);
  const { data: cashflowData, isLoading } = useCashFlowList();

  // Badge label maps
  const statusLabels: Record<string, string> = {
    planned: t("status.planned"),
    pending: t("status.pending"),
    paid: t("status.paid"),
    cancelled: t("status.cancelled"),
  };

  const typeLabels: Record<string, string> = {
    income: t("type.income"),
    expense: t("type.expense"),
  };

  // Localized config
  const localizedConfig = useMemo(
    () => ({
      ...cashflowBrowserConfig,
      title: t("title"),
      columns: cashflowBrowserConfig.columns.map((col) => {
        let valueLabels: Record<string, string> | undefined;
        if (col.key === "status") valueLabels = statusLabels;
        if (col.key === "cashflowType") valueLabels = typeLabels;
        return {
          ...col,
          label: t(`columns.${col.key}` as Parameters<typeof t>[0]),
          valueLabels,
        };
      }),
      quickFilters: cashflowBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}` as Parameters<typeof t>[0]),
      })),
      filters: cashflowBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
        options: f.options?.map((opt) => {
          let translationKey: string | null = null;
          if (f.key === "status") translationKey = `status.${opt.value}`;
          if (f.key === "cashflowType") translationKey = `type.${opt.value}`;
          return {
            ...opt,
            label: translationKey
              ? t(translationKey as Parameters<typeof t>[0])
              : opt.label,
          };
        }),
      })),
    }),
    [t]
  );

  // Filtered, sorted, paginated data
  const { pageData, totalCount } = useMemo(() => {
    let filtered = cashflowData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    filtered = sortCashFlows(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(cashflowToRecord),
      totalCount: total,
    };
  }, [cashflowData, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params managed by DataBrowser + useDataBrowserParams
    },
    []
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <Button
          size="sm"
          onClick={() => {
            router.push("/finance/cashflow/new");
          }}
        >
          <Plus className="mr-1 size-4" />
          {t("createCashFlow")}
        </Button>
      </div>

      <CashFlowSummaryPanel />

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
