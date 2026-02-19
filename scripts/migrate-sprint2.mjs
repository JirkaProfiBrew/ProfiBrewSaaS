/**
 * Sprint 2 migration: Create beer_styles, recipes, batches tables
 * Run with: node scripts/migrate-sprint2.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL);

const statements = [
  // ── Beer Styles ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "beer_style_groups" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "beer_styles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "style_group_id" uuid NOT NULL REFERENCES "beer_style_groups"("id"),
    "bjcp_number" text,
    "bjcp_category" text,
    "name" text NOT NULL,
    "abv_min" numeric, "abv_max" numeric,
    "ibu_min" numeric, "ibu_max" numeric,
    "ebc_min" numeric, "ebc_max" numeric,
    "og_min" numeric, "og_max" numeric,
    "fg_min" numeric, "fg_max" numeric,
    "appearance" text, "aroma" text, "flavor" text, "comments" text,
    "created_at" timestamp with time zone DEFAULT now()
  )`,

  // ── Mashing Profiles ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "mashing_profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "tenants"("id"),
    "name" text NOT NULL,
    "steps" jsonb DEFAULT '[]'::jsonb,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now()
  )`,

  // ── Recipes ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "recipes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "code" text,
    "name" text NOT NULL,
    "beer_style_id" uuid REFERENCES "beer_styles"("id"),
    "status" text DEFAULT 'draft' NOT NULL,
    "batch_size_l" numeric,
    "batch_size_bruto_l" numeric,
    "beer_volume_l" numeric,
    "og" numeric, "fg" numeric, "abv" numeric,
    "ibu" numeric, "ebc" numeric,
    "boil_time_min" integer,
    "cost_price" numeric,
    "duration_fermentation_days" integer,
    "duration_conditioning_days" integer,
    "notes" text,
    "is_from_library" boolean DEFAULT false,
    "source_library_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "recipe_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "recipe_id" uuid NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
    "item_id" uuid NOT NULL REFERENCES "items"("id"),
    "category" text NOT NULL,
    "amount_g" numeric NOT NULL,
    "use_stage" text,
    "use_time_min" integer,
    "hop_phase" text,
    "notes" text,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "recipe_steps" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "recipe_id" uuid NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
    "mash_profile_id" uuid REFERENCES "mashing_profiles"("id"),
    "step_type" text NOT NULL,
    "name" text NOT NULL,
    "temperature_c" numeric,
    "time_min" integer,
    "ramp_time_min" integer,
    "temp_gradient" numeric,
    "notes" text,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "recipe_calculations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "recipe_id" uuid NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
    "calculated_at" timestamp with time zone DEFAULT now(),
    "data" jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
  )`,

  // ── Batches ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "batches" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "batch_number" text NOT NULL,
    "batch_seq" integer,
    "recipe_id" uuid REFERENCES "recipes"("id"),
    "item_id" uuid REFERENCES "items"("id"),
    "status" text DEFAULT 'planned' NOT NULL,
    "brew_status" text,
    "planned_date" timestamp with time zone,
    "brew_date" timestamp with time zone,
    "end_brew_date" timestamp with time zone,
    "actual_volume_l" numeric,
    "og_actual" numeric, "fg_actual" numeric, "abv_actual" numeric,
    "equipment_id" uuid REFERENCES "equipment"("id"),
    "primary_batch_id" uuid,
    "excise_relevant_hl" numeric,
    "excise_reported_hl" numeric,
    "excise_status" text,
    "is_paused" boolean DEFAULT false,
    "notes" text,
    "brewer_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "batches_tenant_batch_number" UNIQUE("tenant_id","batch_number")
  )`,
  `CREATE TABLE IF NOT EXISTS "batch_steps" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "batch_id" uuid NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
    "step_type" text NOT NULL,
    "brew_phase" text,
    "name" text NOT NULL,
    "temperature_c" numeric,
    "time_min" integer,
    "pause_min" integer,
    "auto_switch" boolean DEFAULT false,
    "equipment_id" uuid REFERENCES "equipment"("id"),
    "start_time_plan" timestamp with time zone,
    "start_time_real" timestamp with time zone,
    "end_time_real" timestamp with time zone,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "batch_measurements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "batch_id" uuid NOT NULL REFERENCES "batches"("id"),
    "measurement_type" text NOT NULL,
    "value" numeric,
    "value_plato" numeric,
    "value_sg" numeric,
    "temperature_c" numeric,
    "is_start" boolean DEFAULT false,
    "is_end" boolean DEFAULT false,
    "notes" text,
    "measured_at" timestamp with time zone DEFAULT now(),
    "created_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "batch_notes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "batch_id" uuid NOT NULL REFERENCES "batches"("id"),
    "batch_step_id" uuid REFERENCES "batch_steps"("id"),
    "text" text NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "bottling_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "batch_id" uuid NOT NULL REFERENCES "batches"("id"),
    "item_id" uuid NOT NULL REFERENCES "items"("id"),
    "quantity" integer NOT NULL,
    "base_units" numeric,
    "bottled_at" timestamp with time zone DEFAULT now(),
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "batch_material_lots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "batch_id" uuid NOT NULL REFERENCES "batches"("id"),
    "lot_id" uuid,
    "item_id" uuid NOT NULL REFERENCES "items"("id"),
    "quantity_used" numeric,
    "created_at" timestamp with time zone DEFAULT now()
  )`,

  // ── Indexes ─────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS "idx_recipes_tenant_status" ON "recipes" USING btree ("tenant_id","status")`,
  `CREATE INDEX IF NOT EXISTS "idx_recipe_items_recipe" ON "recipe_items" USING btree ("recipe_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_recipe_steps_recipe" ON "recipe_steps" USING btree ("recipe_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_batches_tenant_status" ON "batches" USING btree ("tenant_id","status")`,
  `CREATE INDEX IF NOT EXISTS "idx_batches_tenant_date" ON "batches" USING btree ("tenant_id","brew_date")`,
  `CREATE INDEX IF NOT EXISTS "idx_batch_steps_batch" ON "batch_steps" USING btree ("batch_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_batch_measurements_batch" ON "batch_measurements" USING btree ("batch_id")`,

  // ── Missing constraint on counters (safe — IF NOT EXISTS) ──
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'counters_tenant_entity'
    ) THEN
      ALTER TABLE "counters" ADD CONSTRAINT "counters_tenant_entity" UNIQUE("tenant_id","entity");
    END IF;
  END $$`,
];

console.log("Running Sprint 2 migration...");

for (const stmt of statements) {
  const label = stmt.match(/(?:CREATE TABLE|CREATE INDEX|DO)/)?.[0] ?? "SQL";
  const name = stmt.match(/"(\w+)"/)?.[1] ?? "";
  try {
    await sql.unsafe(stmt);
    console.log(`  ✓ ${label} ${name}`);
  } catch (err) {
    console.error(`  ✗ ${label} ${name}: ${err.message}`);
  }
}

console.log("Done.");
await sql.end();
