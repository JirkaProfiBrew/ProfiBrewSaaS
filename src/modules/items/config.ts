/**
 * Items module — DataBrowser configurations.
 * Two configs: materialsBrowserConfig (for /brewery/materials)
 * and catalogBrowserConfig (for /stock/items).
 */

import type { DataBrowserConfig } from "@/components/data-browser";

// ── Materials Browser (/brewery/materials) ─────────────────────

export const materialsBrowserConfig: DataBrowserConfig = {
  entity: "items",
  title: "Suroviny",
  baseFilter: { isBrewMaterial: true },

  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      imageField: "imageUrl",
      titleField: "name",
      subtitleField: "brand",
      badgeFields: ["materialType"],
      metricFields: [
        { key: "costPrice", label: "Cena", format: "currency" },
        { key: "alpha", label: "Alpha", format: "decimal", showIf: "materialType=hop" },
      ],
    },
  },

  columns: [
    { key: "code", label: "Kód", type: "text", sortable: true },
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "materialType", label: "Typ", type: "badge" },
    { key: "brand", label: "Výrobce", type: "text", sortable: true },
    { key: "costPrice", label: "Cena", type: "currency", sortable: true },
    { key: "alpha", label: "Alpha", type: "text" },
    { key: "ebc", label: "EBC", type: "text" },
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "malt", label: "Slady a přísady", filter: { materialType: "malt" } },
    { key: "hop", label: "Chmel", filter: { materialType: "hop" } },
    { key: "yeast", label: "Kvasnice", filter: { materialType: "yeast" } },
  ],

  filters: [
    {
      key: "materialType",
      label: "Typ suroviny",
      type: "select",
      options: [
        { value: "malt", label: "Slad" },
        { value: "hop", label: "Chmel" },
        { value: "yeast", label: "Kvasnice" },
        { value: "adjunct", label: "Přísada" },
        { value: "other", label: "Ostatní" },
      ],
    },
    {
      key: "stockCategory",
      label: "Kategorie skladu",
      type: "select",
      options: [
        { value: "raw_material", label: "Surovina" },
        { value: "finished_product", label: "Hotový výrobek" },
        { value: "packaging", label: "Obal" },
        { value: "other", label: "Ostatní" },
      ],
    },
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
    create: { label: "+ Surovina", enabled: true },
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

// ── Catalog Browser (/stock/items) ─────────────────────────────

export const catalogBrowserConfig: DataBrowserConfig = {
  entity: "items",
  title: "Katalog položek",

  views: {
    list: { enabled: true, default: true },
    card: false,
  },

  columns: [
    { key: "code", label: "Kód", type: "text", sortable: true },
    { key: "name", label: "Název", type: "link", sortable: true },
    { key: "isBrewMaterial", label: "Surovina", type: "boolean" },
    { key: "isSaleItem", label: "Prodejní", type: "boolean" },
    { key: "materialType", label: "Typ", type: "badge" },
    { key: "stockCategory", label: "Kat. skladu", type: "text" },
    { key: "totalQty", label: "Sklad", type: "number", sortable: true },
    { key: "reservedQty", label: "Rezervováno", type: "number", sortable: true },
    { key: "demandedQty", label: "Požadováno", type: "number", sortable: true },
    { key: "availableQty", label: "Dostupné", type: "number", sortable: true },
    { key: "costPrice", label: "Cena", type: "currency", sortable: true },
    { key: "isActive", label: "Aktivní", type: "boolean" },
  ],

  quickFilters: [
    { key: "all", label: "Vše", filter: {} },
    { key: "materials", label: "Suroviny", filter: { isBrewMaterial: true } },
    { key: "products", label: "Produkty", filter: { isSaleItem: true } },
    { key: "packaging", label: "Obaly", filter: { stockCategory: "packaging" } },
    { key: "zeroStock", label: "Nulový stav", filter: { _zeroStock: true } },
  ],

  filters: [
    {
      key: "materialType",
      label: "Typ suroviny",
      type: "select",
      options: [
        { value: "malt", label: "Slad" },
        { value: "hop", label: "Chmel" },
        { value: "yeast", label: "Kvasnice" },
        { value: "adjunct", label: "Přísada" },
        { value: "other", label: "Ostatní" },
      ],
    },
    {
      key: "stockCategory",
      label: "Kategorie skladu",
      type: "select",
      options: [
        { value: "raw_material", label: "Surovina" },
        { value: "finished_product", label: "Hotový výrobek" },
        { value: "packaging", label: "Obal" },
        { value: "other", label: "Ostatní" },
      ],
    },
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
    create: { label: "+ Položka", enabled: true },
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
