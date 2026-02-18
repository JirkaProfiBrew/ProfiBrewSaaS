/**
 * Shops module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the shops browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const shopBrowserConfig: DataBrowserConfig = {
  entity: "shops",
  title: "Provozovny",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "shopType",
    },
  },

  columns: [
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "shopType", label: "Typ", type: "badge", sortable: true },
    { key: "addressDisplay", label: "Adresa", type: "text" },
    { key: "isDefault", label: "Výchozí", type: "boolean" },
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "brewery", label: "Pivovar", filter: { shopType: "brewery" } },
    { key: "taproom", label: "Výčep", filter: { shopType: "taproom" } },
    { key: "warehouse", label: "Sklad", filter: { shopType: "warehouse" } },
  ],

  filters: [
    {
      key: "shopType",
      label: "Typ",
      type: "select",
      options: [
        { value: "brewery", label: "Pivovar" },
        { value: "taproom", label: "Výčep" },
        { value: "warehouse", label: "Sklad" },
        { value: "office", label: "Kancelář" },
      ],
    },
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Provozovna", enabled: true },
    bulkDelete: false,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "brewer", "sales", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
  },
};
