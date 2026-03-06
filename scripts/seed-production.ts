/**
 * Idempotent production seed script.
 *
 * Seeds global (non-tenant) data: plans, countries, units, beer styles,
 * mashing profiles, and excise rates.
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/seed-production.ts
 */

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// ─── Plans ───────────────────────────────────────────────────────────
async function seedPlans(): Promise<void> {
  console.log("[seed] Plans...");

  // Plans are seeded by migration 0028 — this is a safety net
  const existing = await sql`SELECT count(*)::int AS cnt FROM plans` as { cnt: number }[];
  if ((existing[0]?.cnt ?? 0) >= 4) {
    console.log("[seed] Plans already seeded, skipping");
    return;
  }

  console.log("[seed] Plans will be seeded by migration 0028_plans_seed_v2.sql");
}

// ─── Countries ───────────────────────────────────────────────────────
async function seedCountries(): Promise<void> {
  console.log("[seed] Countries...");

  const countryData = [
    { code: "CZ", name_cs: "Česko", name_en: "Czech Republic" },
    { code: "SK", name_cs: "Slovensko", name_en: "Slovakia" },
    { code: "PL", name_cs: "Polsko", name_en: "Poland" },
    { code: "DE", name_cs: "Německo", name_en: "Germany" },
    { code: "AT", name_cs: "Rakousko", name_en: "Austria" },
    { code: "HU", name_cs: "Maďarsko", name_en: "Hungary" },
    { code: "GB", name_cs: "Velká Británie", name_en: "United Kingdom" },
    { code: "US", name_cs: "USA", name_en: "United States" },
    { code: "BE", name_cs: "Belgie", name_en: "Belgium" },
    { code: "NL", name_cs: "Nizozemsko", name_en: "Netherlands" },
    { code: "IE", name_cs: "Irsko", name_en: "Ireland" },
    { code: "DK", name_cs: "Dánsko", name_en: "Denmark" },
    { code: "SE", name_cs: "Švédsko", name_en: "Sweden" },
    { code: "NO", name_cs: "Norsko", name_en: "Norway" },
    { code: "FI", name_cs: "Finsko", name_en: "Finland" },
    { code: "FR", name_cs: "Francie", name_en: "France" },
    { code: "IT", name_cs: "Itálie", name_en: "Italy" },
    { code: "ES", name_cs: "Španělsko", name_en: "Spain" },
  ];

  for (const c of countryData) {
    await sql`
      INSERT INTO countries (code, name_cs, name_en)
      VALUES (${c.code}, ${c.name_cs}, ${c.name_en})
      ON CONFLICT (code) DO NOTHING
    `;
  }

  console.log(`[seed] ${countryData.length} countries`);
}

// ─── Units ───────────────────────────────────────────────────────────
async function seedUnits(): Promise<void> {
  console.log("[seed] Units...");

  const unitData = [
    { code: "kg", name_cs: "kilogram", name_en: "kilogram", symbol: "kg", category: "weight", base_unit_code: null, to_base_factor: "1", sort_order: 1 },
    { code: "g", name_cs: "gram", name_en: "gram", symbol: "g", category: "weight", base_unit_code: "kg", to_base_factor: "0.001", sort_order: 2 },
    { code: "l", name_cs: "litr", name_en: "liter", symbol: "l", category: "volume", base_unit_code: null, to_base_factor: "1", sort_order: 3 },
    { code: "ml", name_cs: "mililitr", name_en: "milliliter", symbol: "ml", category: "volume", base_unit_code: "l", to_base_factor: "0.001", sort_order: 4 },
    { code: "hl", name_cs: "hektolitr", name_en: "hectoliter", symbol: "hl", category: "volume", base_unit_code: "l", to_base_factor: "100", sort_order: 5 },
    { code: "ks", name_cs: "kus", name_en: "piece", symbol: "ks", category: "count", base_unit_code: null, to_base_factor: "1", sort_order: 6 },
    { code: "bal", name_cs: "balení", name_en: "package", symbol: "bal", category: "count", base_unit_code: null, to_base_factor: "1", sort_order: 7 },
  ];

  for (const u of unitData) {
    await sql`
      INSERT INTO units (code, name_cs, name_en, symbol, category, base_unit_code, to_base_factor, sort_order)
      VALUES (${u.code}, ${u.name_cs}, ${u.name_en}, ${u.symbol}, ${u.category}, ${u.base_unit_code}, ${u.to_base_factor}, ${u.sort_order})
      ON CONFLICT (code) DO NOTHING
    `;
  }

  console.log(`[seed] ${unitData.length} units`);
}

// ─── Excise Rates (CZ 2024 default rates) ────────────────────────────
async function seedExciseRates(): Promise<void> {
  console.log("[seed] Excise rates...");

  // Check if table exists first
  const tableCheck = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'excise_rates') AS exists
  ` as { exists: boolean }[];
  if (!tableCheck[0]?.exists) {
    console.log("[seed] excise_rates table does not exist, skipping");
    return;
  }

  // System-wide defaults (tenant_id = NULL)
  // Categories A–E based on Czech beer tax law
  const rates = [
    { category: "A", rate_per_plato_hl: "16.00", valid_from: "2024-01-01" }, // malý nezávislý pivovar do 10 000 hl
    { category: "B", rate_per_plato_hl: "19.20", valid_from: "2024-01-01" }, // 10 001–50 000 hl
    { category: "C", rate_per_plato_hl: "22.40", valid_from: "2024-01-01" }, // 50 001–100 000 hl
    { category: "D", rate_per_plato_hl: "25.60", valid_from: "2024-01-01" }, // 100 001–150 000 hl
    { category: "E", rate_per_plato_hl: "32.00", valid_from: "2024-01-01" }, // nad 150 000 hl (základní sazba)
  ];

  for (const r of rates) {
    const existing = await sql`
      SELECT id FROM excise_rates
      WHERE tenant_id IS NULL AND category = ${r.category} AND valid_from = ${r.valid_from}
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO excise_rates (tenant_id, category, rate_per_plato_hl, valid_from)
        VALUES (NULL, ${r.category}, ${r.rate_per_plato_hl}, ${r.valid_from})
      `;
    }
  }

  console.log(`[seed] ${rates.length} excise rate categories`);
}

// ─── Main ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("=== ProfiBrew Production Seed ===\n");

  await seedPlans();
  await seedCountries();
  await seedUnits();
  await seedExciseRates();

  // Beer styles and mashing profiles are imported via separate scripts
  // (import-beer-styles.mjs) because they come from CSV data.
  console.log("\n[info] Beer styles: run separately via `node scripts/import-beer-styles.mjs`");

  console.log("\n=== Done ===");
  await sql.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
