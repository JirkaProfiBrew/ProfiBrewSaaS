import { db } from "@/lib/db";
import { countries, units } from "@/../drizzle/schema/system";
import { seedBeerStyles, seedMashingProfiles } from "./seed-beer-styles";

/**
 * Seed system codebooks — countries, units, beer styles, mashing profiles.
 * These are global (no tenant_id) and should be run once.
 */
export async function seedSystemData(): Promise<void> {
  await seedCountries();
  await seedUnits();
  await seedBeerStyles();
  await seedMashingProfiles();
}

async function seedCountries(): Promise<void> {
  const countryData = [
    { code: "CZ", nameCs: "Česko", nameEn: "Czech Republic" },
    { code: "SK", nameCs: "Slovensko", nameEn: "Slovakia" },
    { code: "PL", nameCs: "Polsko", nameEn: "Poland" },
    { code: "DE", nameCs: "Německo", nameEn: "Germany" },
    { code: "AT", nameCs: "Rakousko", nameEn: "Austria" },
    { code: "HU", nameCs: "Maďarsko", nameEn: "Hungary" },
    { code: "GB", nameCs: "Velká Británie", nameEn: "United Kingdom" },
    { code: "US", nameCs: "USA", nameEn: "United States" },
    { code: "BE", nameCs: "Belgie", nameEn: "Belgium" },
    { code: "NL", nameCs: "Nizozemsko", nameEn: "Netherlands" },
    { code: "IE", nameCs: "Irsko", nameEn: "Ireland" },
    { code: "DK", nameCs: "Dánsko", nameEn: "Denmark" },
    { code: "SE", nameCs: "Švédsko", nameEn: "Sweden" },
    { code: "NO", nameCs: "Norsko", nameEn: "Norway" },
    { code: "FI", nameCs: "Finsko", nameEn: "Finland" },
    { code: "FR", nameCs: "Francie", nameEn: "France" },
    { code: "IT", nameCs: "Itálie", nameEn: "Italy" },
    { code: "ES", nameCs: "Španělsko", nameEn: "Spain" },
  ];

  await db
    .insert(countries)
    .values(countryData)
    .onConflictDoNothing({ target: countries.code });
}

async function seedUnits(): Promise<void> {
  const unitData = [
    // Weight units
    { code: "kg", nameCs: "kilogram", nameEn: "kilogram", symbol: "kg", category: "weight", baseUnitCode: null, toBaseFactor: null, sortOrder: 1 },
    { code: "g", nameCs: "gram", nameEn: "gram", symbol: "g", category: "weight", baseUnitCode: "kg", toBaseFactor: "0.001", sortOrder: 2 },
    // Volume units
    { code: "l", nameCs: "litr", nameEn: "liter", symbol: "l", category: "volume", baseUnitCode: null, toBaseFactor: null, sortOrder: 3 },
    { code: "ml", nameCs: "mililitr", nameEn: "milliliter", symbol: "ml", category: "volume", baseUnitCode: "l", toBaseFactor: "0.001", sortOrder: 4 },
    { code: "hl", nameCs: "hektolitr", nameEn: "hectoliter", symbol: "hl", category: "volume", baseUnitCode: "l", toBaseFactor: "100", sortOrder: 5 },
    // Count units
    { code: "ks", nameCs: "kus", nameEn: "piece", symbol: "ks", category: "count", baseUnitCode: null, toBaseFactor: null, sortOrder: 6 },
    { code: "bal", nameCs: "balení", nameEn: "package", symbol: "bal", category: "count", baseUnitCode: null, toBaseFactor: null, sortOrder: 7 },
  ];

  // System units have no tenant_id, isSystem defaults to true
  await db
    .insert(units)
    .values(unitData)
    .onConflictDoNothing({ target: units.code });
}
