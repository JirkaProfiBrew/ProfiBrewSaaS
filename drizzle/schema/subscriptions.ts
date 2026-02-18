import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  date,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),

    // Pricing
    basePrice: decimal("base_price").notNull().default("0"),
    currency: text("currency").notNull().default("CZK"),
    billingPeriod: text("billing_period").default("monthly"),

    // Limits
    includedHl: decimal("included_hl"),
    overagePerHl: decimal("overage_per_hl"),
    maxUsers: integer("max_users"),

    // Features
    includedModules: text("included_modules")
      .array()
      .notNull()
      .default(sql`ARRAY['brewery']::text[]`),
    apiAccess: boolean("api_access").default(false),
    integrations: boolean("integrations").default(false),
    prioritySupport: boolean("priority_support").default(false),

    // Versioning
    version: integer("version").notNull().default(1),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    isActive: boolean("is_active").default(true),
    isPublic: boolean("is_public").default(true),

    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_plans_active").on(table.slug, table.validFrom),
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull().default("active"),

    // Period
    startedAt: date("started_at").notNull(),
    currentPeriodStart: date("current_period_start").notNull(),
    currentPeriodEnd: date("current_period_end").notNull(),
    cancelledAt: date("cancelled_at"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),

    // Promo / Override
    promoCode: text("promo_code"),
    overageWaivedUntil: date("overage_waived_until"),
    priceOverride: decimal("price_override"),

    // Stripe
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("idx_subscriptions_active").on(table.tenantId),
  ]
);
