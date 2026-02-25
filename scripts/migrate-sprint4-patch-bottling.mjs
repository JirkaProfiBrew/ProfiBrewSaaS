/**
 * Sprint 4 patch — Bottling: lot number, expiry date, production price
 * Alters: batches (lot_number, bottled_date), recipes (shelf_life_days)
 * Backfills: lot_number from batch_number
 *
 * Run with: node scripts/migrate-sprint4-patch-bottling.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL);

const migrationPath = resolve(__dirname, "../drizzle/migrations/0007_sprint4_patch_bottling.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

const statements = migrationSql
  .replace(/^--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function run() {
  console.log("Running Sprint 4 patch migration (Bottling: lot, expiry, price)...\n");

  for (const stmt of statements) {
    const preview = stmt.substring(0, 100).replace(/\n/g, " ");
    console.log(`  → ${preview}...`);
    try {
      await sql.unsafe(stmt);
      console.log("    OK");
    } catch (err) {
      console.error(`    Error: ${err.message}`);
    }
  }

  console.log("\nMigration complete.");
  await sql.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
