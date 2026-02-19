/**
 * Batches module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the batch browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const batchBrowserConfig: DataBrowserConfig = {
  entity: "batch",
  title: "Vary / Sarze",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "batchNumber",
      subtitleField: "itemName",
      metricFields: [
        { key: "status", label: "Status" },
        { key: "ogActual", label: "OG" },
        { key: "actualVolumeL", label: "Objem (L)" },
      ],
    },
  },

  columns: [
    { key: "batchNumber", label: "Cislo", type: "link", sortable: true },
    { key: "itemName", label: "Pivo", type: "text", sortable: true },
    { key: "recipeName", label: "Recept", type: "text", sortable: true },
    { key: "status", label: "Status", type: "badge", sortable: true },
    { key: "brewDate", label: "Datum vareni", type: "date", sortable: true },
    { key: "equipmentName", label: "Tank", type: "text", sortable: true },
    { key: "ogActual", label: "OG", type: "number", sortable: true },
    { key: "actualVolumeL", label: "Objem (L)", type: "number", sortable: true },
  ],

  quickFilters: [
    { key: "all", label: "Vse", filter: {} },
    { key: "inProgress", label: "Probihajici", filter: { status: "in_progress" } },
    { key: "planned", label: "Naplanovane", filter: { status: "planned" } },
    { key: "completed", label: "Dokoncene", filter: { status: "completed" } },
    { key: "dumped", label: "Zlikvidovane", filter: { status: "dumped" } },
  ],

  filters: [
    { key: "batchNumber", label: "Cislo varky", type: "text" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "planned", label: "Naplanovano" },
        { value: "brewing", label: "Vari se" },
        { value: "fermenting", label: "Kvasi" },
        { value: "conditioning", label: "Dokvasuje" },
        { value: "carbonating", label: "Syceni" },
        { value: "packaging", label: "Staceni" },
        { value: "completed", label: "Dokonceno" },
        { value: "dumped", label: "Zlikvidovano" },
      ],
    },
  ],

  defaultSort: { key: "brewDate", direction: "desc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Varka", enabled: true },
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
