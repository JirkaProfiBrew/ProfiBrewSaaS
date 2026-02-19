/**
 * Stock Issues module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the stock issue browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const stockIssueBrowserConfig: DataBrowserConfig = {
  entity: "stockIssue",
  title: "Skladové pohyby",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "code", label: "Kód", type: "link", sortable: true },
    { key: "movementType", label: "Typ", type: "badge", sortable: true },
    {
      key: "movementPurpose",
      label: "Účel",
      type: "badge",
      sortable: true,
    },
    { key: "date", label: "Datum", type: "date", sortable: true },
    { key: "warehouseName", label: "Sklad", type: "text", sortable: true },
    { key: "partnerName", label: "Partner", type: "text", sortable: true },
    { key: "totalCost", label: "Celkem", type: "currency", sortable: true },
    { key: "status", label: "Status", type: "badge", sortable: true },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "receipts", label: "Příjemky", filter: { movementType: "receipt" } },
    { key: "issues", label: "Výdejky", filter: { movementType: "issue" } },
    { key: "draft", label: "Koncepty", filter: { status: "draft" } },
    {
      key: "confirmed",
      label: "Potvrzené",
      filter: { status: "confirmed" },
    },
  ],

  filters: [
    {
      key: "warehouseId",
      label: "Sklad",
      type: "select",
      options: [],
    },
    {
      key: "movementPurpose",
      label: "Účel pohybu",
      type: "select",
      options: [
        { value: "purchase", label: "Nákup" },
        { value: "production_in", label: "Výroba – vstup" },
        { value: "production_out", label: "Výroba – výstup" },
        { value: "sale", label: "Prodej" },
        { value: "transfer", label: "Převod" },
        { value: "inventory", label: "Inventura" },
        { value: "waste", label: "Odpad" },
        { value: "other", label: "Ostatní" },
      ],
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Koncept" },
        { value: "confirmed", label: "Potvrzeno" },
        { value: "cancelled", label: "Stornováno" },
      ],
    },
  ],

  defaultSort: { key: "date", direction: "desc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Pohyb", enabled: false },
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
