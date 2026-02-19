/**
 * Fix counters constraint: drop old (tenant_id, entity) unique constraint
 * and ensure new (tenant_id, entity, warehouse_id) constraint exists.
 *
 * The Sprint 3 migration tried to DROP CONSTRAINT "counters_tenant_entity"
 * but PostgreSQL auto-named it "counters_tenant_id_entity_key". This script
 * fixes the constraint naming issue.
 *
 * Run with: node scripts/fix-counters-constraint.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  console.log("Fixing counters constraint...\n");

  // 1. Ensure warehouse_id column exists
  await sql`ALTER TABLE "counters" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid`;
  console.log("✓ warehouse_id column ensured");

  // 2. Drop the old constraint (auto-generated name by PostgreSQL)
  await sql`ALTER TABLE "counters" DROP CONSTRAINT IF EXISTS "counters_tenant_id_entity_key"`;
  console.log("✓ Dropped old constraint counters_tenant_id_entity_key");

  // Also try the Drizzle-named version just in case
  await sql`ALTER TABLE "counters" DROP CONSTRAINT IF EXISTS "counters_tenant_entity"`;
  console.log("✓ Dropped old constraint counters_tenant_entity (if existed)");

  // 3. Create the new constraint (tenant_id, entity, warehouse_id)
  await sql`ALTER TABLE "counters" DROP CONSTRAINT IF EXISTS "counters_tenant_entity_warehouse"`;
  await sql`ALTER TABLE "counters" ADD CONSTRAINT "counters_tenant_entity_warehouse"
    UNIQUE ("tenant_id", "entity", "warehouse_id")`;
  console.log("✓ Created new constraint counters_tenant_entity_warehouse");

  // 4. Verify
  const constraints = await sql`
    SELECT conname, pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = 'counters'::regclass AND contype = 'u'
  `;
  console.log("\nCurrent unique constraints on counters:");
  for (const c of constraints) {
    console.log(`  ${c.conname}: ${c.definition}`);
  }

  await sql.end();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
