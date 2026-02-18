"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { partnerBrowserConfig } from "../config";
import { usePartners } from "../hooks";
import { getPartnerType } from "../types";
import type { Partner } from "../types";

// ── Helpers ────────────────────────────────────────────────────

/** Convert a Partner object to Record<string, unknown> for DataBrowser. */
function partnerToRecord(partner: Partner): Record<string, unknown> {
  return {
    id: partner.id,
    tenantId: partner.tenantId,
    name: partner.name,
    partnerType: getPartnerType(partner),
    isCustomer: partner.isCustomer,
    isSupplier: partner.isSupplier,
    ico: partner.ico,
    dic: partner.dic,
    addressStreet: partner.addressStreet,
    addressCity: partner.addressCity,
    addressZip: partner.addressZip,
    countryId: partner.countryId,
    phone: partner.phone ?? partner.mobile,
    email: partner.email,
    isActive: partner.isActive,
    createdAt: partner.createdAt,
    updatedAt: partner.updatedAt,
  };
}

/** Case-insensitive search across relevant partner fields. */
function matchesSearch(partner: Partner, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    partner.name.toLowerCase().includes(term) ||
    (partner.ico?.toLowerCase().includes(term) ?? false) ||
    (partner.addressCity?.toLowerCase().includes(term) ?? false) ||
    (partner.email?.toLowerCase().includes(term) ?? false)
  );
}

/** Apply quick filter based on isCustomer/isSupplier flags. */
function matchesQuickFilter(
  partner: Partner,
  quickFilterKey: string
): boolean {
  if (!quickFilterKey || quickFilterKey === "all") return true;

  const quickFilter = partnerBrowserConfig.quickFilters?.find(
    (f) => f.key === quickFilterKey
  );
  if (!quickFilter) return true;

  const filterIsCustomer = quickFilter.filter["isCustomer"];
  const filterIsSupplier = quickFilter.filter["isSupplier"];

  if (filterIsCustomer === true && !partner.isCustomer) return false;
  if (filterIsSupplier === true && !partner.isSupplier) return false;

  return true;
}

/** Apply parametric filters from the filter panel. */
function matchesParametricFilters(
  partner: Partner,
  filters: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const partnerRecord = partnerToRecord(partner);
    const fieldValue = partnerRecord[key];

    if (typeof value === "string" && typeof fieldValue === "string") {
      if (!fieldValue.toLowerCase().includes(value.toLowerCase())) {
        return false;
      }
    } else if (typeof value === "boolean") {
      if (fieldValue !== value) return false;
    } else if (fieldValue !== value) {
      return false;
    }
  }
  return true;
}

/** Sort partners by a given key and direction. */
function sortPartners(
  partnersList: Partner[],
  sortKey: string,
  direction: "asc" | "desc"
): Partner[] {
  return [...partnersList].sort((a, b) => {
    const recordA = partnerToRecord(a);
    const recordB = partnerToRecord(b);

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

export function PartnerBrowser(): React.ReactNode {
  const t = useTranslations("partners");
  const { params } = useDataBrowserParams(partnerBrowserConfig);
  const { data: allPartners, isLoading } = usePartners();

  // Build localized config with translated labels
  const localizedConfig = useMemo(
    () => ({
      ...partnerBrowserConfig,
      title: t("title"),
      columns: partnerBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}`),
        ...(col.key === "partnerType" ? {
          valueLabels: {
            customer: t("partnerType.customer"),
            supplier: t("partnerType.supplier"),
            both: t("partnerType.both"),
          },
        } : {}),
      })),
      quickFilters: partnerBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}`),
      })),
      actions: {
        ...partnerBrowserConfig.actions,
        create: partnerBrowserConfig.actions.create
          ? { ...partnerBrowserConfig.actions.create, label: t("create") }
          : undefined,
      },
    }),
    [t]
  );

  // Derive filtered, sorted, and paginated data from params + real data
  const { pageData, totalCount } = useMemo(() => {
    // 1. Filter
    let filtered = allPartners.filter((partner) => {
      if (!matchesSearch(partner, params.search)) return false;
      if (!matchesQuickFilter(partner, params.quickFilter)) return false;
      if (!matchesParametricFilters(partner, params.filters)) return false;
      return true;
    });

    // 2. Sort
    filtered = sortPartners(filtered, params.sort, params.sortDirection);

    // 3. Paginate
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(partnerToRecord),
      totalCount: total,
    };
  }, [allPartners, params]);

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
