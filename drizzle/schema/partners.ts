import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { countries } from "./system";

// ============================================================
// PARTNERS (customers + suppliers in one)
// ============================================================
export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),

  // === FLAGS ===
  isCustomer: boolean("is_customer").default(false),
  isSupplier: boolean("is_supplier").default(false),

  // === LEGAL ===
  legalForm: text("legal_form"), // 'individual' | 'legal_entity'
  ico: text("ico"),
  dic: text("dic"),
  dicValidated: boolean("dic_validated").default(false),
  legalFormCode: text("legal_form_code"),

  // === CONTACT ===
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  web: text("web"),

  // === ADDRESS (primary) ===
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressZip: text("address_zip"),
  countryId: uuid("country_id").references(() => countries.id),

  // === COMMERCIAL ===
  paymentTerms: integer("payment_terms").default(14),
  priceListId: uuid("price_list_id"), // FK to price list (Phase 2)
  creditLimit: decimal("credit_limit"),

  // === META ===
  logoUrl: text("logo_url"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// CONTACTS (multiple contacts per partner)
// ============================================================
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id),
  name: text("name").notNull(),
  position: text("position"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  isPrimary: boolean("is_primary").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// ADDRESSES (multiple addresses per partner)
// ============================================================
export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id),
  addressType: text("address_type").notNull(), // 'billing' | 'delivery' | 'other'
  label: text("label"),
  street: text("street"),
  city: text("city"),
  zip: text("zip"),
  countryId: uuid("country_id").references(() => countries.id),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// BANK ACCOUNTS (multiple per partner)
// ============================================================
export const partnerBankAccounts = pgTable("partner_bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  iban: text("iban"),
  swift: text("swift"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// ATTACHMENTS (generic — usable for partners and other entities)
// ============================================================
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    entityType: text("entity_type").notNull(), // 'partner', 'item', 'batch', 'order'...
    entityId: uuid("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    uploadedBy: uuid("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_attachments_entity").on(
      table.tenantId,
      table.entityType,
      table.entityId
    ),
  ]
);
