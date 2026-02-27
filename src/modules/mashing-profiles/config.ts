/**
 * Mashing Profiles module — DataBrowser configuration.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const mashProfileBrowserConfig: DataBrowserConfig = {
  entity: "mashing-profiles",
  title: "Rmutovací profily",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "mashingTypeLabel",
      metricFields: [
        { key: "stepCount", label: "Kroků" },
        { key: "isSystemLabel", label: "Typ" },
      ],
    },
  },

  columns: [
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "mashingTypeLabel", label: "Typ rmutování", type: "badge", sortable: true },
    { key: "stepCount", label: "Kroků", type: "number", sortable: true },
    { key: "isSystemLabel", label: "Systémový", type: "badge" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "system", label: "Systémové", filter: { isSystem: true } },
    { key: "custom", label: "Vlastní", filter: { isSystem: false } },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "Rmutovací profil", enabled: true },
    bulkDelete: false,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin", "brewer"],
    read: ["owner", "admin", "brewer", "sales", "viewer"],
    update: ["owner", "admin", "brewer"],
    delete: ["owner", "admin"],
  },
};
