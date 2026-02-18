/**
 * Partners module — DataBrowser configuration.
 * Defines columns, filters, views, and actions for the partners browser.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const partnerBrowserConfig: DataBrowserConfig = {
  entity: "partners",
  title: "Obchodní partneři",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "city",
    },
  },

  columns: [
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "ico", label: "IČO", type: "text" },
    { key: "street", label: "Ulice", type: "text" },
    { key: "city", label: "Město", type: "text", sortable: true },
    { key: "zip", label: "PSČ", type: "text" },
    { key: "country", label: "Stát", type: "text" },
    { key: "phone", label: "Mobil", type: "text" },
    { key: "email", label: "Email", type: "text" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "customers", label: "Zákazníci", filter: { partnerType: "customer" } },
    { key: "suppliers", label: "Dodavatelé", filter: { partnerType: "supplier" } },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Partner", enabled: true },
    bulkDelete: true,
    rowClick: "none",
  },

  permissions: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "member", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
  },
};
