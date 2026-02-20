/**
 * Orders module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the order browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const orderBrowserConfig: DataBrowserConfig = {
  entity: "order",
  title: "Objednávky",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "orderNumber", label: "Číslo", type: "link", sortable: true },
    { key: "partnerName", label: "Zákazník", type: "text", sortable: true },
    { key: "orderDate", label: "Datum obj.", type: "date", sortable: true },
    {
      key: "deliveryDate",
      label: "Datum dodání",
      type: "date",
      sortable: true,
    },
    { key: "status", label: "Stav", type: "badge", sortable: true },
    {
      key: "totalInclVat",
      label: "Celkem s DPH",
      type: "currency",
      sortable: true,
    },
    { key: "totalDeposit", label: "Zálohy", type: "currency", sortable: true },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "open", label: "Otevřené", filter: { status: "open" } },
    { key: "toDeliver", label: "K dodání", filter: { status: "shipped" } },
    { key: "closed", label: "Uzavřené", filter: { status: "closed" } },
    { key: "cancelled", label: "Zrušené", filter: { status: "cancelled" } },
  ],

  filters: [
    {
      key: "status",
      label: "Stav",
      type: "select",
      options: [
        { value: "draft", label: "Koncept" },
        { value: "confirmed", label: "Potvrzeno" },
        { value: "in_preparation", label: "V přípravě" },
        { value: "shipped", label: "Odesláno" },
        { value: "delivered", label: "Doručeno" },
        { value: "invoiced", label: "Fakturováno" },
        { value: "cancelled", label: "Zrušeno" },
      ],
    },
  ],

  defaultSort: { key: "orderDate", direction: "desc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Objednávka", enabled: true },
    bulkDelete: false,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin", "sales"],
    read: ["owner", "admin", "sales", "viewer"],
    update: ["owner", "admin", "sales"],
    delete: ["owner", "admin"],
  },
};
