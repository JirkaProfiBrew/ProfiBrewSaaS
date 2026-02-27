/**
 * Beer Styles module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the beer style browser.
 * Read-only browser for BJCP 2021 beer styles (global codebook).
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const beerStyleBrowserConfig: DataBrowserConfig = {
  entity: "beerStyle",
  title: "Pivní styly",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "groupNameCz",
      metricFields: [
        { key: "abvRange", label: "ABV %" },
        { key: "ibuRange", label: "IBU" },
        { key: "ebcRange", label: "EBC" },
        { key: "ogRange", label: "OG (°P)" },
      ],
    },
  },

  columns: [
    { key: "bjcpNumber", label: "BJCP", type: "text", sortable: true },
    { key: "name", label: "Styl", type: "text", sortable: true },
    { key: "groupNameCz", label: "Skupina", type: "text", sortable: true },
    { key: "abvRange", label: "ABV %", type: "text", sortable: false },
    { key: "ibuRange", label: "IBU", type: "text", sortable: false },
    { key: "ebcRange", label: "EBC", type: "text", sortable: false },
    { key: "ogRange", label: "OG (°P)", type: "text", sortable: false },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
  ],

  filters: [
    { key: "name", label: "Název", type: "text" },
    {
      key: "groupNameCz",
      label: "Skupina",
      type: "select",
      // Options will be populated dynamically from groups data
      options: [],
    },
  ],

  defaultSort: { key: "bjcpNumber", direction: "asc" },
  pageSize: 25,
  pageSizeOptions: [25, 50, 100],

  actions: {
    // Read-only — no create or delete
    rowClick: "none",
  },

  permissions: {
    create: [],
    read: ["owner", "admin", "brewer", "sales", "viewer"],
    update: [],
    delete: [],
  },
};
