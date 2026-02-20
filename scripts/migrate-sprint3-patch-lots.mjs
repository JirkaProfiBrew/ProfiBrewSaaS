/**
 * Sprint 3 Patch: Lots = Receipt Lines migration
 * Adds lot columns to stock_issue_lines, migrates issue_mode values, backfills remaining_qty.
 * Run with: node scripts/migrate-sprint3-patch-lots.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL);

const migrationPath = resolve(__dirname, "../drizzle/migrations/0002_sprint3_patch_lots.sql");
const migrationSql = readFileSync(migrationPath, "utf-8");

// Strip standalone comment lines, then split by semicolons
const statements = migrationSql
  .replace(/^--.*$/gm, "") // remove comment-only lines
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function run() {
  console.log("🚀 Running Sprint 3 Patch: Lots = Receipt Lines...\n");

  for (const stmt of statements) {
    const preview = stmt.substring(0, 80).replace(/\n/g, " ");
    console.log(`  → ${preview}...`);
    try {
      await sql.unsafe(stmt);
      console.log("    ✅ OK");
    } catch (err) {
      console.error(`    ❌ Error: ${err.message}`);
    }
  }

  console.log("\n✅ Migration complete.");
  await sql.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
