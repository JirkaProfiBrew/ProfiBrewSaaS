/**
 * Material Lots module — DataBrowser configuration.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const lotBrowserConfig: DataBrowserConfig = {
  entity: "materialLot",
  title: "Sledování šarží",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "lotNumber", label: "Číslo šarže", type: "link", sortable: true },
    { key: "itemName", label: "Položka", type: "text", sortable: true },
    { key: "supplierName", label: "Dodavatel", type: "text", sortable: true },
    { key: "receivedDate", label: "Datum příjmu", type: "date", sortable: true },
    { key: "expiryDate", label: "Expirace", type: "date", sortable: true },
    { key: "quantityInitial", label: "Počáteční mn.", type: "number", sortable: true },
    { key: "quantityRemaining", label: "Zbývající mn.", type: "number", sortable: true },
    { key: "status", label: "Stav", type: "badge", sortable: true },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "expiring", label: "Expirující", filter: { _expiring: true } },
    { key: "exhausted", label: "Vyčerpané", filter: { _exhausted: true } },
  ],

  filters: [
    {
      key: "itemId",
      label: "Položka",
      type: "select",
      options: [],
    },
    {
      key: "supplierId",
      label: "Dodavatel",
      type: "select",
      options: [],
    },
  ],

  defaultSort: { key: "receivedDate", direction: "desc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Šarže", enabled: true },
    bulkDelete: true,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "brewer", "sales", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
  },
};
