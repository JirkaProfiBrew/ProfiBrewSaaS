/**
 * Equipment module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the equipment browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const equipmentBrowserConfig: DataBrowserConfig = {
  entity: "equipment",
  title: "Zařízení",

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
      key: "brewhouse",
      label: "Varny",
      filter: { equipmentType: "brewhouse" },
    },
    {
      key: "fermenter",
      label: "Fermentory",
      filter: { equipmentType: "fermenter" },
    },
    {
      key: "brite_tank",
      label: "Ležácké",
      filter: { equipmentType: "brite_tank" },
    },
    {
      key: "conditioning",
      label: "CKT",
      filter: { equipmentType: "conditioning" },
    },
    {
      key: "bottling_line",
      label: "Stáčecí",
      filter: { equipmentType: "bottling_line" },
    },
  ],

  filters: [
    {
      key: "equipmentType",
      label: "Typ",
      type: "select",
      options: [
        { value: "brewhouse", label: "Varna" },
        { value: "fermenter", label: "Fermentor" },
        { value: "brite_tank", label: "Ležácký tank" },
        { value: "conditioning", label: "CKT" },
        { value: "bottling_line", label: "Stáčecí linka" },
        { value: "keg_washer", label: "Myčka sudů" },
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
    create: { label: "+ Zařízení", enabled: true },
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
