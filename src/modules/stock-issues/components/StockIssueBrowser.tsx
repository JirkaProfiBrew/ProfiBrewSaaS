"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown } from "lucide-react";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { stockIssueBrowserConfig } from "../config";
import { useStockIssueList } from "../hooks";
import type { StockIssue } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function issueToRecord(item: StockIssue): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    movementType: item.movementType,
    movementPurpose: item.movementPurpose,
    date: item.date,
    warehouseName: item.warehouseName ?? "",
    partnerName: item.partnerName ?? "",
    totalCost: item.totalCost,
    status: item.status,
    createdAt: item.createdAt,
  };
}

function matchesSearch(item: StockIssue, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.code.toLowerCase().includes(term) ||
    (item.warehouseName?.toLowerCase().includes(term) ?? false) ||
    (item.partnerName?.toLowerCase().includes(term) ?? false) ||
    (item.notes?.toLowerCase().includes(term) ?? false)
  );
}

function matchesQuickFilter(item: StockIssue, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  const quickFilter = stockIssueBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filter = quickFilter.filter;
  if (filter["movementType"] && item.movementType !== filter["movementType"])
    return false;
  if (filter["status"] && item.status !== filter["status"]) return false;

  return true;
}

function matchesParametricFilters(
  item: StockIssue,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = issueToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

function sortIssues(
  issueItems: StockIssue[],
  sortKey: string,
  direction: "asc" | "desc"
): StockIssue[] {
  return [...issueItems].sort((a, b) => {
    const recordA = issueToRecord(a);
    const recordB = issueToRecord(b);

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

export function StockIssueBrowser(): React.ReactNode {
  const t = useTranslations("stockIssues");
  const router = useRouter();
  const { params } = useDataBrowserParams(stockIssueBrowserConfig);
  const { data: issueData, isLoading } = useStockIssueList();

  // Badge label maps
  const movementTypeLabels: Record<string, string> = {
    receipt: t("movementType.receipt"),
    issue: t("movementType.issue"),
  };

  const purposeLabels: Record<string, string> = {
    purchase: t("movementPurpose.purchase"),
    production_in: t("movementPurpose.production_in"),
    production_out: t("movementPurpose.production_out"),
    sale: t("movementPurpose.sale"),
    transfer: t("movementPurpose.transfer"),
    inventory: t("movementPurpose.inventory"),
    waste: t("movementPurpose.waste"),
    other: t("movementPurpose.other"),
  };

  const statusLabels: Record<string, string> = {
    draft: t("status.draft"),
    confirmed: t("status.confirmed"),
    cancelled: t("status.cancelled"),
  };

  // Localized config
  const localizedConfig = useMemo(
    () => ({
      ...stockIssueBrowserConfig,
      title: t("title"),
      columns: stockIssueBrowserConfig.columns.map((col) => {
        let valueLabels: Record<string, string> | undefined;
        if (col.key === "movementType") valueLabels = movementTypeLabels;
        if (col.key === "movementPurpose") valueLabels = purposeLabels;
        if (col.key === "status") valueLabels = statusLabels;
        return {
          ...col,
          label: t(`columns.${col.key}` as Parameters<typeof t>[0]),
          valueLabels,
        };
      }),
      quickFilters: stockIssueBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}` as Parameters<typeof t>[0]),
      })),
      filters: stockIssueBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
        options: f.options?.map((opt) => {
          let translationKey: string | null = null;
          if (f.key === "movementPurpose")
            translationKey = `movementPurpose.${opt.value}`;
          if (f.key === "status") translationKey = `status.${opt.value}`;
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
    let filtered = issueData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    filtered = sortIssues(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(issueToRecord),
      totalCount: total,
    };
  }, [issueData, params]);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              <ChevronDown className="ml-1 size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                router.push("/stock/movements/new?type=receipt");
              }}
            >
              + {t("createReceipt")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                router.push("/stock/movements/new?type=issue");
              }}
            >
              + {t("createIssue")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
