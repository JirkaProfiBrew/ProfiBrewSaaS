/**
 * Recipes module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the recipe browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const recipeBrowserConfig: DataBrowserConfig = {
  entity: "recipe",
  title: "Receptury",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "beerStyleName",
      metricFields: [
        { key: "og", label: "OG (°P)" },
        { key: "ibu", label: "IBU" },
        { key: "ebc", label: "EBC" },
        { key: "batchSizeL", label: "Objem (L)" },
      ],
    },
  },

  columns: [
    { key: "code", label: "Kód", type: "text", sortable: true },
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "beerStyleName", label: "Styl", type: "text", sortable: true },
    { key: "status", label: "Status", type: "badge", sortable: true },
    { key: "og", label: "OG (°P)", type: "number", sortable: true },
    { key: "ibu", label: "IBU", type: "number", sortable: true },
    { key: "ebc", label: "EBC", type: "number", sortable: true },
    { key: "batchSizeL", label: "Objem (L)", type: "number", sortable: true },
    { key: "costPrice", label: "Cena várky", type: "number", sortable: true },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "active", label: "Aktivní", filter: { status: "active" } },
    { key: "draft", label: "Koncepty", filter: { status: "draft" } },
    { key: "archived", label: "Archivované", filter: { status: "archived" } },
  ],

  filters: [
    { key: "name", label: "Název", type: "text" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Koncept" },
        { value: "active", label: "Aktivní" },
        { value: "archived", label: "Archivovaná" },
      ],
    },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Receptura", enabled: true },
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
