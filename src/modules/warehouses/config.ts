/**
 * Warehouses module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the warehouse browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const warehouseBrowserConfig: DataBrowserConfig = {
  entity: "warehouses",
  title: "Sklady",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "code", label: "Kód", type: "text", sortable: true },
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "shopName", label: "Provozovna", type: "text" },
    { key: "isExciseRelevant", label: "Daňový", type: "boolean" },
    { key: "categoriesDisplay", label: "Kategorie", type: "text" },
    { key: "isDefault", label: "Výchozí", type: "boolean" },
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "active", label: "Aktivní", filter: { isActive: true } },
    { key: "excise", label: "Daňové", filter: { isExciseRelevant: true } },
  ],

  filters: [
    { key: "isActive", label: "Aktivní", type: "boolean" },
    { key: "isExciseRelevant", label: "Daňový sklad", type: "boolean" },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Sklad", enabled: true },
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
