import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tenantSchema from "@/../drizzle/schema/tenants";
import * as authSchema from "@/../drizzle/schema/auth";
import * as subscriptionSchema from "@/../drizzle/schema/subscriptions";
import * as systemSchema from "@/../drizzle/schema/system";

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, {
  schema: {
    ...tenantSchema,
    ...authSchema,
    ...subscriptionSchema,
    ...systemSchema,
  },
});
