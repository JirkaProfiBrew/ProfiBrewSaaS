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

// ============================================================
// PILOT INVITATIONS (invite-based registration)
// ============================================================
export const pilotInvitations = pgTable(
  "pilot_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").unique().notNull(),
    email: text("email").notNull(),
    planSlug: text("plan_slug").notNull().default("pro"),
    trialDays: integer("trial_days").notNull().default(30),
    priceOverride: decimal("price_override"),
    notes: text("notes"),
    status: text("status").notNull().default("pending"), // 'pending' | 'sent' | 'registered' | 'expired'
    sentAt: timestamp("sent_at", { withTimezone: true }),
    registeredAt: timestamp("registered_at", { withTimezone: true }),
    registeredTenantId: uuid("registered_tenant_id").references(() => tenants.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_pilot_invitations_token").on(table.token),
    index("idx_pilot_invitations_email").on(table.email),
  ]
);
