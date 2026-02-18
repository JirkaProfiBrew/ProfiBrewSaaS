/**
 * Contacts module — DataBrowser configuration.
 * Flat list of all contacts across all partners.
 * Click navigates to partner detail on Contacts tab.
 */

import type { DataBrowserConfig } from "@/components/data-browser";

export const contactsBrowserConfig: DataBrowserConfig = {
  entity: "contacts",
  title: "Kontakty",

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      titleField: "name",
      subtitleField: "partnerName",
      metricFields: [
        { key: "position", label: "Pozice" },
        { key: "email", label: "Email" },
      ],
    },
  },

  columns: [
    { key: "name", label: "Jméno", type: "link", sortable: true },
    { key: "partnerName", label: "Partner", type: "text", sortable: true },
    { key: "position", label: "Pozice", type: "text" },
    { key: "email", label: "Email", type: "text" },
    { key: "phone", label: "Telefon", type: "text" },
    { key: "isPrimary", label: "Primární", type: "boolean" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50],

  actions: {
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin", "sales"],
    read: ["owner", "admin", "brewer", "sales", "viewer"],
    update: ["owner", "admin", "sales"],
    delete: ["owner", "admin", "sales"],
  },
};
