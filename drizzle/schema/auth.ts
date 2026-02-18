import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  isSuperadmin: boolean("is_superadmin").default(false),
  preferences: jsonb("preferences").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("viewer"),
    isActive: boolean("is_active").default(true),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("tenant_users_tenant_user").on(table.tenantId, table.userId)]
);
