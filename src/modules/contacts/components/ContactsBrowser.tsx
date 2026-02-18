"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { DataBrowser, useDataBrowserParams } from "@/components/data-browser";
import type { DataBrowserParams } from "@/components/data-browser";

import { contactsBrowserConfig } from "../config";
import { getAllContacts } from "../actions";
import type { ContactWithPartner } from "../types";

function contactToRecord(contact: ContactWithPartner): Record<string, unknown> {
  return {
    id: contact.id,
    name: contact.name,
    partnerId: contact.partnerId,
    partnerName: contact.partnerName,
    position: contact.position,
    email: contact.email,
    phone: contact.phone,
    mobile: contact.mobile,
    isPrimary: contact.isPrimary,
    createdAt: contact.createdAt,
  };
}

function matchesSearch(contact: ContactWithPartner, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    contact.name.toLowerCase().includes(term) ||
    (contact.email?.toLowerCase().includes(term) ?? false) ||
    (contact.phone?.toLowerCase().includes(term) ?? false) ||
    contact.partnerName.toLowerCase().includes(term) ||
    (contact.position?.toLowerCase().includes(term) ?? false)
  );
}

function sortContacts(
  list: ContactWithPartner[],
  sortKey: string,
  direction: "asc" | "desc"
): ContactWithPartner[] {
  return [...list].sort((a, b) => {
    const recA = contactToRecord(a);
    const recB = contactToRecord(b);
    const valA = recA[sortKey];
    const valB = recB[sortKey];

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    let cmp = 0;
    if (typeof valA === "string" && typeof valB === "string") {
      cmp = valA.localeCompare(valB, "cs");
    } else {
      cmp = String(valA).localeCompare(String(valB), "cs");
    }
    return direction === "desc" ? -cmp : cmp;
  });
}

export function ContactsBrowser(): React.ReactNode {
  const t = useTranslations("contacts");
  const router = useRouter();
  const { params } = useDataBrowserParams(contactsBrowserConfig);

  const [allContacts, setAllContacts] = useState<ContactWithPartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const data = await getAllContacts();
        setAllContacts(data);
      } catch {
        setAllContacts([]);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const localizedConfig = useMemo(
    () => ({
      ...contactsBrowserConfig,
      title: t("title"),
      columns: contactsBrowserConfig.columns.map((col) => ({
        ...col,
        label: t(`columns.${col.key}`),
      })),
      quickFilters: contactsBrowserConfig.quickFilters?.map((qf) => ({
        ...qf,
        label: t(`quickFilters.${qf.key}`),
      })),
      actions: {
        ...contactsBrowserConfig.actions,
        rowClick: "detail" as const,
      },
    }),
    [t]
  );

  const { pageData, totalCount } = useMemo(() => {
    let filtered = allContacts.filter((c) =>
      matchesSearch(c, params.search)
    );

    filtered = sortContacts(filtered, params.sort, params.sortDirection);

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const page = filtered.slice(start, end);

    return {
      pageData: page.map(contactToRecord),
      totalCount: total,
    };
  }, [allContacts, params]);

  const handleParamsChange = useCallback(
    (_params: DataBrowserParams): void => {
      // URL state managed by useDataBrowserParams
    },
    []
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>): void => {
      const partnerId = row["partnerId"] as string;
      if (partnerId) {
        router.push(`/brewery/partners/${partnerId}`);
      }
    },
    [router]
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
        onRowClick={handleRowClick}
      />
    </div>
  );
}
