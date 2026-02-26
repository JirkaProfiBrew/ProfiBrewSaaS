/**
 * Excise module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for excise movement and report browsers.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const exciseMovementBrowserConfig: DataBrowserConfig = {
  entity: "exciseMovement",
  title: "Spotrebni dan - pohyby",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "date", label: "Datum", type: "date", sortable: true },
    { key: "movementType", label: "Typ pohybu", type: "badge", sortable: true },
    { key: "direction", label: "Smer", type: "badge", sortable: true },
    { key: "volumeHl", label: "Objem (hl)", type: "number", sortable: true },
    { key: "plato", label: "Plato", type: "number", sortable: true },
    { key: "taxAmount", label: "Dan", type: "currency", sortable: true },
    { key: "batchNumber", label: "Varku", type: "text", sortable: true },
    { key: "stockIssueCode", label: "Doklad", type: "text", sortable: true },
    { key: "warehouseName", label: "Sklad", type: "text", sortable: true },
    { key: "status", label: "Status", type: "badge", sortable: true },
  ],

  quickFilters: [
    { key: "all", label: "Vse", filter: {} },
    { key: "in", label: "Prijem", filter: { direction: "in" } },
    { key: "out", label: "Vydej", filter: { direction: "out" } },
    { key: "confirmed", label: "Potvrzene", filter: { status: "confirmed" } },
    { key: "reported", label: "Reportovane", filter: { status: "reported" } },
  ],

  filters: [
    {
      key: "movementType",
      label: "Typ pohybu",
      type: "select",
      options: [
        { value: "production", label: "Vyroba" },
        { value: "release", label: "Uvedeni do volneho obehu" },
        { value: "loss", label: "Ztrata" },
        { value: "destruction", label: "Zniceni" },
        { value: "transfer_in", label: "Prevod prijem" },
        { value: "transfer_out", label: "Prevod vydej" },
        { value: "adjustment", label: "Oprava" },
      ],
    },
    {
      key: "warehouseId",
      label: "Sklad",
      type: "select",
      options: [],
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Koncept" },
        { value: "confirmed", label: "Potvrzeno" },
        { value: "reported", label: "Reportovano" },
      ],
    },
  ],

  defaultSort: { key: "date", direction: "desc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Pohyb", enabled: true },
    bulkDelete: false,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "brewer", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
  },
};

export const monthlyReportBrowserConfig: DataBrowserConfig = {
  entity: "exciseMonthlyReport",
  title: "Mesicni prehled spotrebni dane",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "period", label: "Obdobi", type: "text", sortable: true },
    { key: "openingBalanceHl", label: "Pocatecni stav", type: "number", sortable: true },
    { key: "productionHl", label: "Vyroba", type: "number", sortable: true },
    { key: "releaseHl", label: "Uvedeni", type: "number", sortable: true },
    { key: "lossHl", label: "Ztraty", type: "number", sortable: true },
    { key: "closingBalanceHl", label: "Konecny stav", type: "number", sortable: true },
    { key: "totalTax", label: "Dan celkem", type: "currency", sortable: true },
    { key: "status", label: "Status", type: "badge", sortable: true },
  ],

  quickFilters: [
    { key: "all", label: "Vse", filter: {} },
    { key: "draft", label: "Koncepty", filter: { status: "draft" } },
    { key: "submitted", label: "Odeslane", filter: { status: "submitted" } },
    { key: "accepted", label: "Schvalene", filter: { status: "accepted" } },
  ],

  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Koncept" },
        { value: "submitted", label: "Odeslano" },
        { value: "accepted", label: "Schvaleno" },
      ],
    },
  ],

  defaultSort: { key: "period", direction: "desc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Generovat", enabled: true },
    bulkDelete: false,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "brewer", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
  },
};
