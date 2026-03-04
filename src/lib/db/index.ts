import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tenantSchema from "@/../drizzle/schema/tenants";
import * as authSchema from "@/../drizzle/schema/auth";
import * as subscriptionSchema from "@/../drizzle/schema/subscriptions";
import * as systemSchema from "@/../drizzle/schema/system";
import * as shopsSchema from "@/../drizzle/schema/shops";
import * as equipmentSchema from "@/../drizzle/schema/equipment";
import * as itemsSchema from "@/../drizzle/schema/items";
import * as partnersSchema from "@/../drizzle/schema/partners";
import * as beerStylesSchema from "@/../drizzle/schema/beer-styles";
import * as recipesSchema from "@/../drizzle/schema/recipes";
import * as batchesSchema from "@/../drizzle/schema/batches";
import * as warehousesSchema from "@/../drizzle/schema/warehouses";
import * as stockSchema from "@/../drizzle/schema/stock";
import * as depositsSchema from "@/../drizzle/schema/deposits";
import * as ordersSchema from "@/../drizzle/schema/orders";
import * as cashflowsSchema from "@/../drizzle/schema/cashflows";
import * as exciseSchema from "@/../drizzle/schema/excise";

const schema = {
  ...tenantSchema,
  ...authSchema,
  ...subscriptionSchema,
  ...systemSchema,
  ...shopsSchema,
  ...equipmentSchema,
  ...itemsSchema,
  ...partnersSchema,
  ...beerStylesSchema,
  ...recipesSchema,
  ...batchesSchema,
  ...warehousesSchema,
  ...stockSchema,
  ...depositsSchema,
  ...ordersSchema,
  ...cashflowsSchema,
  ...exciseSchema,
};

// Reuse client across HMR in dev to avoid exhausting the connection pool
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  drizzleDb?: PostgresJsDatabase<typeof schema>;
};

const client = globalForDb.pgClient ?? postgres(process.env.DATABASE_URL!, {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
});
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db: PostgresJsDatabase<typeof schema> =
  globalForDb.drizzleDb ?? drizzle(client, { schema });
if (process.env.NODE_ENV !== "production") globalForDb.drizzleDb = db;
