/**
 * Sprint 2 Patch: Units migration
 * Upgrades units table, extends items and recipe_items, seeds system units.
 * Run with: node scripts/migrate-patch-units.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL);

const statements = [
  // ── Step 1: Upgrade units table ──────────────────────────────
  // Add new columns (IF NOT EXISTS for safety)
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS code text`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS name_cs text`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS name_en text`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS symbol text`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS category text`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS base_unit_code text`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS to_base_factor numeric`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT true`,
  `ALTER TABLE units ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0`,

  // Remove old columns if they exist (they might not if this is a fresh install)
  `ALTER TABLE units DROP COLUMN IF EXISTS name`,
  `ALTER TABLE units DROP COLUMN IF EXISTS base_unit`,
  `ALTER TABLE units DROP COLUMN IF EXISTS conversion_factor`,

  // Add unique constraint on code if not exists
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'units_code_unique'
     ) THEN
       ALTER TABLE units ADD CONSTRAINT units_code_unique UNIQUE (code);
     END IF;
   END $$`,

  // Set NOT NULL on required columns (only after data is seeded)
  // We'll do this after seed

  // ── Step 2: Seed system units ──────────────────────────────
  `INSERT INTO units (code, name_cs, name_en, symbol, category, base_unit_code, to_base_factor, is_system, sort_order)
   VALUES
     ('kg', 'kilogram', 'kilogram', 'kg', 'weight', NULL, NULL, true, 1),
     ('g', 'gram', 'gram', 'g', 'weight', 'kg', 0.001, true, 2),
     ('l', 'litr', 'liter', 'l', 'volume', NULL, NULL, true, 3),
     ('ml', 'mililitr', 'milliliter', 'ml', 'volume', 'l', 0.001, true, 4),
     ('hl', 'hektolitr', 'hectoliter', 'hl', 'volume', 'l', 100, true, 5),
     ('ks', 'kus', 'piece', 'ks', 'count', NULL, NULL, true, 6),
     ('bal', 'balení', 'package', 'bal', 'count', NULL, NULL, true, 7)
   ON CONFLICT (code) DO NOTHING`,

  // Now set NOT NULL on required columns
  `ALTER TABLE units ALTER COLUMN code SET NOT NULL`,
  `ALTER TABLE units ALTER COLUMN name_cs SET NOT NULL`,
  `ALTER TABLE units ALTER COLUMN name_en SET NOT NULL`,
  `ALTER TABLE units ALTER COLUMN symbol SET NOT NULL`,
  `ALTER TABLE units ALTER COLUMN category SET NOT NULL`,

  // ── Step 3: Extend items table ──────────────────────────────
  `ALTER TABLE items ADD COLUMN IF NOT EXISTS recipe_unit_id UUID REFERENCES units(id)`,

  // Backfill items: set unit_id based on material_type
  // Malts/grain → kg
  `UPDATE items SET unit_id = (SELECT id FROM units WHERE code = 'kg')
   WHERE material_type IN ('malt', 'grain') AND unit_id IS NULL`,

  // Hops → stock unit kg, recipe unit g
  `UPDATE items SET unit_id = (SELECT id FROM units WHERE code = 'kg')
   WHERE material_type = 'hop' AND unit_id IS NULL`,
  `UPDATE items SET recipe_unit_id = (SELECT id FROM units WHERE code = 'g')
   WHERE material_type = 'hop' AND recipe_unit_id IS NULL`,

  // Yeast → g
  `UPDATE items SET unit_id = (SELECT id FROM units WHERE code = 'g')
   WHERE material_type = 'yeast' AND unit_id IS NULL`,

  // Adjunct → kg
  `UPDATE items SET unit_id = (SELECT id FROM units WHERE code = 'kg')
   WHERE material_type = 'adjunct' AND unit_id IS NULL`,

  // Other items → kg as default
  `UPDATE items SET unit_id = (SELECT id FROM units WHERE code = 'kg')
   WHERE unit_id IS NULL AND is_brew_material = true`,

  // ── Step 4: Extend recipe_items table ──────────────────────
  `ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id)`,

  // Backfill recipe_items: use item's recipe_unit_id (for hops), otherwise item's unit_id
  `UPDATE recipe_items ri SET unit_id = COALESCE(
    (SELECT i.recipe_unit_id FROM items i WHERE i.id = ri.item_id AND i.recipe_unit_id IS NOT NULL),
    (SELECT i.unit_id FROM items i WHERE i.id = ri.item_id)
  )
  WHERE ri.unit_id IS NULL`,

  // ── Step 5: RLS policies ──────────────────────────────────
  // System units readable by all authenticated users
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE policyname = 'units_system_read' AND tablename = 'units'
     ) THEN
       EXECUTE 'CREATE POLICY units_system_read ON units FOR SELECT USING (tenant_id IS NULL)';
     END IF;
   END $$`,

  // Tenant custom units (future)
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE policyname = 'units_tenant_read' AND tablename = 'units'
     ) THEN
       EXECUTE 'CREATE POLICY units_tenant_read ON units FOR SELECT USING (tenant_id = (auth.jwt()->>''tenant_id'')::uuid)';
     END IF;
   END $$`,
];

async function main() {
  console.log("Starting units patch migration...\n");

  for (const stmt of statements) {
    const preview = stmt.trim().slice(0, 80).replace(/\n/g, " ");
    console.log(`→ ${preview}...`);
    try {
      await sql.unsafe(stmt);
      console.log("  ✓ OK");
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      // Don't throw — continue with remaining statements
    }
  }

  // Validation queries
  console.log("\n── Validation ──────────────────────────────────");

  const unitCount = await sql`SELECT COUNT(*) as cnt FROM units WHERE tenant_id IS NULL`;
  console.log(`System units: ${unitCount[0].cnt}`);

  const itemsNoUnit = await sql`SELECT COUNT(*) as cnt FROM items WHERE unit_id IS NULL AND is_brew_material = true`;
  console.log(`Brew material items without unit_id: ${itemsNoUnit[0].cnt} (should be 0)`);

  const hopNoRecipeUnit = await sql`SELECT COUNT(*) as cnt FROM items WHERE material_type = 'hop' AND recipe_unit_id IS NULL`;
  console.log(`Hop items without recipe_unit_id: ${hopNoRecipeUnit[0].cnt} (should be 0)`);

  const riNoUnit = await sql`SELECT COUNT(*) as cnt FROM recipe_items WHERE unit_id IS NULL`;
  console.log(`Recipe items without unit_id: ${riNoUnit[0].cnt}`);

  console.log("\n✓ Migration complete!");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
