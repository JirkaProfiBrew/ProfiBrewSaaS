import { drizzle } from "drizzle-orm/postgres-js";
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

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, {
  schema: {
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
  },
});
