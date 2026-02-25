/**
 * Migration: Add packaging_cost and filling_cost to items table.
 * Run: node scripts/migrate-sprint4-patch-packaged.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";

// Load .env.local (Supabase connection string)
config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  console.log("Adding packaging_cost and filling_cost to items...");

  await sql`
    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS packaging_cost DECIMAL,
      ADD COLUMN IF NOT EXISTS filling_cost DECIMAL;
  `;

  console.log("Done.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
