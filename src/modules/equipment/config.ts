/**
 * Equipment module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the equipment browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const equipmentBrowserConfig: DataBrowserConfig = {
  entity: "equipment",
  title: "Tanky",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "equipmentType",
      metricFields: [
        { key: "volumeL", label: "Kapacita (l)" },
        { key: "status", label: "Stav" },
      ],
    },
  },

  columns: [
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "equipmentType", label: "Typ", type: "badge", sortable: true },
    { key: "volumeL", label: "Kapacita (l)", type: "number", sortable: true },
    { key: "status", label: "Stav", type: "badge", sortable: true },
    { key: "shopName", label: "Provozovna", type: "text" },
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    {
      key: "fermentation",
      label: "Kvasné",
      filter: { equipmentType: "fermentation" },
    },
    {
      key: "conditioning",
      label: "Ležácké",
      filter: { equipmentType: "conditioning" },
    },
    {
      key: "universal",
      label: "Univerzální",
      filter: { equipmentType: "universal" },
    },
  ],

  filters: [
    {
      key: "equipmentType",
      label: "Typ",
      type: "select",
      options: [
        { value: "fermentation", label: "Kvasná nádoba" },
        { value: "conditioning", label: "Ležácká nádoba" },
        { value: "universal", label: "Univerzální (CKT)" },
      ],
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      options: [
        { value: "available", label: "Dostupný" },
        { value: "in_use", label: "V použití" },
        { value: "maintenance", label: "Údržba" },
        { value: "retired", label: "Vyřazený" },
      ],
    },
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "Tank", enabled: true },
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
