import { db } from "@/lib/db";
import { countries, units } from "@/../drizzle/schema/system";

/**
 * Seed system codebooks — countries and units.
 * These are global (no tenant_id) and should be run once.
 */
export async function seedSystemData(): Promise<void> {
  await seedCountries();
  await seedUnits();
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
    { name: "kg", baseUnit: "g", conversionFactor: "1000" },
    { name: "g", baseUnit: "g", conversionFactor: "1" },
    { name: "l", baseUnit: "ml", conversionFactor: "1000" },
    { name: "ml", baseUnit: "ml", conversionFactor: "1" },
    { name: "ks", baseUnit: null, conversionFactor: null },
    { name: "balení", baseUnit: null, conversionFactor: null },
  ];

  // System units have no tenant_id
  for (const unit of unitData) {
    await db
      .insert(units)
      .values({
        tenantId: null,
        name: unit.name,
        baseUnit: unit.baseUnit,
        conversionFactor: unit.conversionFactor,
      })
      .onConflictDoNothing();
  }
}
