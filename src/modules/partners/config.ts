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
      subtitleField: "addressCity",
    },
  },

  columns: [
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "partnerType", label: "Typ", type: "badge" },
    { key: "ico", label: "IČO", type: "text" },
    { key: "addressStreet", label: "Ulice", type: "text" },
    { key: "addressCity", label: "Město", type: "text", sortable: true },
    { key: "addressZip", label: "PSČ", type: "text" },
    { key: "phone", label: "Mobil", type: "text" },
    { key: "email", label: "Email", type: "text" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "customers", label: "Zákazníci", filter: { isCustomer: true } },
    { key: "suppliers", label: "Dodavatelé", filter: { isSupplier: true } },
  ],

  filters: [
    { key: "addressCity", label: "Město", type: "text" },
    {
      key: "isActive",
      label: "Aktivní",
      type: "boolean",
    },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    create: { label: "+ Partner", enabled: true },
    bulkDelete: true,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "member", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
  },
};
