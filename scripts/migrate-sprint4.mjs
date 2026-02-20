/**
 * Sprint 4 migration — Orders & Finance
 * Creates: deposits, orders, order_items, cashflow_categories, cashflows,
 *          cashflow_templates, cash_desks
 * Alters: stock_issues (is_reserved), stock_issue_lines (recipe_item_id)
 * Seeds: cashflow counter for existing tenants
 *
 * Run with: node scripts/migrate-sprint4.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL);

const migrationPath = resolve(__dirname, "../drizzle/migrations/0005_sprint4_orders_finance.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

// Strip standalone comment lines, then split by semicolons
const statements = migrationSql
  .replace(/^--.*$/gm, "") // remove comment-only lines
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function run() {
  console.log("Running Sprint 4 migration (Orders & Finance)...\n");

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
