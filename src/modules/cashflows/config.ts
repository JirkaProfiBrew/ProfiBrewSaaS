/**
 * Cashflows module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the cashflow browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const cashflowBrowserConfig: DataBrowserConfig = {
  entity: "cashflow",
  title: "Peněžní toky",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "code", label: "Kód", type: "link", sortable: true },
    { key: "date", label: "Datum", type: "date", sortable: true },
    {
      key: "cashflowType",
      label: "Typ",
      type: "badge",
      sortable: true,
    },
    {
      key: "categoryName",
      label: "Kategorie",
      type: "text",
      sortable: true,
    },
    {
      key: "description",
      label: "Popis",
      type: "text",
      sortable: false,
    },
    {
      key: "partnerName",
      label: "Partner",
      type: "text",
      sortable: true,
    },
    {
      key: "amount",
      label: "Částka",
      type: "currency",
      sortable: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "badge",
      sortable: true,
    },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "income", label: "Příjmy", filter: { cashflowType: "income" } },
    { key: "expense", label: "Výdaje", filter: { cashflowType: "expense" } },
    { key: "planned", label: "Plánované", filter: { status: "planned" } },
    { key: "paid", label: "Uhrazené", filter: { status: "paid" } },
  ],

  filters: [
    {
      key: "cashflowType",
      label: "Typ",
      type: "select",
      options: [
        { value: "income", label: "Příjem" },
        { value: "expense", label: "Výdaj" },
      ],
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      options: [
        { value: "planned", label: "Plánováno" },
        { value: "pending", label: "Čeká na úhradu" },
        { value: "paid", label: "Uhrazeno" },
        { value: "cancelled", label: "Zrušeno" },
      ],
    },
  ],

  defaultSort: { key: "date", direction: "desc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "Peněžní tok", enabled: true },
    bulkDelete: false,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "sales", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
  },
};
