"use client";

import React, { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { exciseMovementBrowserConfig } from "../config";
import { useExciseMovements } from "../hooks";
import type { ExciseMovement } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function movementToRecord(item: ExciseMovement): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    date: item.date,
    movementType: item.movementType,
    direction: item.direction,
    volumeHl: item.volumeHl,
    plato: item.plato,
    taxAmount: item.taxAmount,
    batchId: item.batchId ?? "",
    batchNumber: item.batchNumber ?? "",
    stockIssueId: item.stockIssueId ?? "",
    stockIssueCode: item.stockIssueCode ?? "",
    warehouseName: item.warehouseName ?? "",
    status: item.status,
    period: item.period,
    createdAt: item.createdAt,
  };
}

function matchesSearch(item: ExciseMovement, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    (item.batchNumber?.toLowerCase().includes(term) ?? false) ||
    (item.stockIssueCode?.toLowerCase().includes(term) ?? false) ||
    (item.warehouseName?.toLowerCase().includes(term) ?? false) ||
    (item.description?.toLowerCase().includes(term) ?? false) ||
    (item.notes?.toLowerCase().includes(term) ?? false)
  );
}

function matchesQuickFilter(
  item: ExciseMovement,
  quickFilterKey: string,
  currentPeriod: string,
  previousPeriod: string
): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  if (quickFilterKey === "thisMonth") {
    return item.period === currentPeriod;
  }
  if (quickFilterKey === "lastMonth") {
    return item.period === previousPeriod;
  }

  const quickFilter = exciseMovementBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filter = quickFilter.filter;
  if (filter["direction"] && item.direction !== filter["direction"])
    return false;
  if (filter["status"] && item.status !== filter["status"]) return false;

  return true;
}

function matchesParametricFilters(
  item: ExciseMovement,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = movementToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

function sortMovements(
  items: ExciseMovement[],
  sortKey: string,
  direction: "asc" | "desc"
): ExciseMovement[] {
  return [...items].sort((a, b) => {
    const recordA = movementToRecord(a);
    const recordB = movementToRecord(b);

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

export function ExciseMovementBrowser(): React.ReactNode {
  const t = useTranslations("excise");
  const router = useRouter();
  const { params } = useDataBrowserParams(exciseMovementBrowserConfig);
  const { data: movementData, isLoading } = useExciseMovements();

  // Compute current and previous periods
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const previousPeriod = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  // Badge label maps
  const movementTypeLabels: Record<string, string> = {
    production: t("movements.movementType.production"),
    release: t("movements.movementType.release"),
    loss: t("movements.movementType.loss"),
    destruction: t("movements.movementType.destruction"),
    transfer_in: t("movements.movementType.transfer_in"),
    transfer_out: t("movements.movementType.transfer_out"),
    adjustment: t("movements.movementType.adjustment"),
  };

  const directionLabels: Record<string, string> = {
    in: t("movements.direction.in"),
    out: t("movements.direction.out"),
  };

  const statusLabels: Record<string, string> = {
    draft: t("movements.status.draft"),
    confirmed: t("movements.status.confirmed"),
    reported: t("movements.status.reported"),
  };

  // Localized config
  const localizedConfig = useMemo(
    () => ({
      ...exciseMovementBrowserConfig,
      title: t("movements.title"),
      columns: exciseMovementBrowserConfig.columns.map((col) => {
        let valueLabels: Record<string, string> | undefined;
        if (col.key === "movementType") valueLabels = movementTypeLabels;
        if (col.key === "direction") valueLabels = directionLabels;
        if (col.key === "status") valueLabels = statusLabels;

        // Clickable link renderers for batch and stock issue
        let render: ((value: unknown, row: Record<string, unknown>) => React.ReactNode) | undefined;
        if (col.key === "batchNumber") {
          render = (value: unknown, row: Record<string, unknown>) => {
            const batchId = row.batchId as string;
            if (!batchId || !value) return String(value ?? "");
            return React.createElement(
              "span",
              {
                className: "text-primary underline cursor-pointer",
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  router.push(`/brewery/batches/${batchId}`);
                },
              },
              String(value)
            );
          };
        }
        if (col.key === "stockIssueCode") {
          render = (value: unknown, row: Record<string, unknown>) => {
            const stockIssueId = row.stockIssueId as string;
            if (!stockIssueId || !value) return String(value ?? "");
            return React.createElement(
              "span",
              {
                className: "text-primary underline cursor-pointer",
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  router.push(`/stock/movements/${stockIssueId}`);
                },
              },
              String(value)
            );
          };
        }

        return {
          ...col,
          label: t(
            `movements.columns.${col.key}` as Parameters<typeof t>[0]
          ),
          valueLabels,
          ...(render ? { render } : {}),
        };
      }),
      quickFilters: [
        ...(exciseMovementBrowserConfig.quickFilters ?? []),
        { key: "thisMonth", label: "", filter: { period: currentPeriod } },
        { key: "lastMonth", label: "", filter: { period: previousPeriod } },
      ].map((qf) => ({
        ...qf,
        label: t(
          `movements.quickFilters.${qf.key}` as Parameters<typeof t>[0]
        ),
      })),
      filters: exciseMovementBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`movements.columns.${f.key}` as Parameters<typeof t>[0]),
        options: f.options?.map((opt) => {
          let translationKey: string | null = null;
          if (f.key === "movementType")
            translationKey = `movements.movementType.${opt.value}`;
          if (f.key === "status")
            translationKey = `movements.status.${opt.value}`;
          return {
            ...opt,
            label: translationKey
              ? t(translationKey as Parameters<typeof t>[0])
              : opt.label,
          };
        }),
      })),
      actions: { ...exciseMovementBrowserConfig.actions, create: { label: t("movements.create"), enabled: true } },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, currentPeriod, previousPeriod]
  );

  // Filtered, sorted, paginated data
  const { pageData, totalCount } = useMemo(() => {
    let filtered = movementData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (
        !matchesQuickFilter(
          item,
          params.quickFilter,
          currentPeriod,
          previousPeriod
        )
      )
        return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    filtered = sortMovements(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(movementToRecord),
      totalCount: total,
    };
  }, [movementData, params, currentPeriod, previousPeriod]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL params managed by DataBrowser + useDataBrowserParams
    },
    []
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">
        {t("movements.title")}
      </h1>
      <DataBrowser
        config={localizedConfig}
        data={pageData}
        totalCount={totalCount}
        isLoading={isLoading}
        onParamsChange={handleParamsChange}
        onRowClick={(row) => {
          router.push(`/stock/excise/${row.id as string}`);
        }}
      />
    </div>
  );
}
