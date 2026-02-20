"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";
import { Button } from "@/components/ui/button";

import { orderBrowserConfig } from "../config";
import { useOrderList } from "../hooks";
import type { Order } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function orderToRecord(item: Order): Record<string, unknown> {
  return {
    id: item.id,
    tenantId: item.tenantId,
    orderNumber: item.orderNumber,
    partnerName: item.partnerName ?? "",
    orderDate: item.orderDate,
    deliveryDate: item.deliveryDate ?? "",
    status: item.status,
    totalInclVat: item.totalInclVat,
    totalDeposit: item.totalDeposit,
    createdAt: item.createdAt,
  };
}

function matchesSearch(item: Order, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    item.orderNumber.toLowerCase().includes(term) ||
    (item.partnerName?.toLowerCase().includes(term) ?? false) ||
    (item.notes?.toLowerCase().includes(term) ?? false)
  );
}

/** Open = draft, confirmed, in_preparation. Closed = delivered, invoiced. */
const OPEN_STATUSES = new Set(["draft", "confirmed", "in_preparation"]);
const CLOSED_STATUSES = new Set(["delivered", "invoiced"]);

function matchesQuickFilter(item: Order, quickFilterKey: string): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  switch (quickFilterKey) {
    case "open":
      return OPEN_STATUSES.has(item.status);
    case "toDeliver":
      return item.status === "shipped";
    case "closed":
      return CLOSED_STATUSES.has(item.status);
    case "cancelled":
      return item.status === "cancelled";
    default:
      return true;
  }
}

function matchesParametricFilters(
  item: Order,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const record = orderToRecord(item);
    const fieldValue = record[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

function sortOrders(
  orderItems: Order[],
  sortKey: string,
  direction: "asc" | "desc"
): Order[] {
  return [...orderItems].sort((a, b) => {
    const recordA = orderToRecord(a);
    const recordB = orderToRecord(b);

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

export function OrderBrowser(): React.ReactNode {
  const t = useTranslations("orders");
  const router = useRouter();
  const { params } = useDataBrowserParams(orderBrowserConfig);
  const { data: orderData, isLoading } = useOrderList();

  // Badge label maps
  const statusLabels: Record<string, string> = {
    draft: t("status.draft"),
    confirmed: t("status.confirmed"),
    in_preparation: t("status.in_preparation"),
    shipped: t("status.shipped"),
    delivered: t("status.delivered"),
    invoiced: t("status.invoiced"),
    cancelled: t("status.cancelled"),
  };

  // Localized config
  const localizedConfig = useMemo(
    () => ({
      ...orderBrowserConfig,
      title: t("title"),
      columns: orderBrowserConfig.columns.map((col) => {
        let valueLabels: Record<string, string> | undefined;
        if (col.key === "status") valueLabels = statusLabels;
        return {
          ...col,
          label: t(`columns.${col.key}` as Parameters<typeof t>[0]),
          valueLabels,
        };
      }),
      quickFilters: orderBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}` as Parameters<typeof t>[0]),
      })),
      filters: orderBrowserConfig.filters?.map((f) => ({
        ...f,
        label: t(`filters.${f.key}` as Parameters<typeof t>[0]),
        options: f.options?.map((opt) => {
          const translationKey = f.key === "status" ? `status.${opt.value}` : null;
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
    let filtered = orderData.filter((item) => {
      if (!matchesSearch(item, params.search)) return false;
      if (!matchesQuickFilter(item, params.quickFilter)) return false;
      if (!matchesParametricFilters(item, params.filters)) return false;
      return true;
    });

    filtered = sortOrders(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(orderToRecord),
      totalCount: total,
    };
  }, [orderData, params]);

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
            router.push("/sales/orders/new");
          }}
        >
          <Plus className="mr-1 size-4" />
          {t("createOrder")}
        </Button>
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
