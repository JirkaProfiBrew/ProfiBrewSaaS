/**
 * Brewing Systems module — DataBrowser configuration.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const brewingSystemBrowserConfig: DataBrowserConfig = {
  entity: "brewing-systems",
  title: "Varní soustavy",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "batchSizeLDisplay",
      metricFields: [
        { key: "efficiencyPctDisplay", label: "Efektivita" },
        { key: "finishedBeerLDisplay", label: "Hotové pivo" },
      ],
    },
  },

  columns: [
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "batchSizeLDisplay", label: "Batch size (L)", type: "text", sortable: true },
    { key: "efficiencyPctDisplay", label: "Efektivita (%)", type: "text", sortable: true },
    { key: "finishedBeerLDisplay", label: "Hotové pivo (L)", type: "text", sortable: true },
    { key: "shopName", label: "Provozovna", type: "text" },
    { key: "isPrimary", label: "Primární", type: "badge" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "active", label: "Aktivní", filter: { isActive: true } },
  ],

  filters: [
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "Varní soustava", enabled: true },
    bulkDelete: true,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin", "brewer"],
    read: ["owner", "admin", "brewer", "sales", "viewer"],
    update: ["owner", "admin", "brewer"],
    delete: ["owner", "admin"],
  },
};
