import { db } from "@/lib/db";
import { beerStyleGroups, beerStyles } from "@/../drizzle/schema/beer-styles";
import { mashingProfiles } from "@/../drizzle/schema/recipes";

/**
 * Seed BJCP 2021 beer style groups and styles.
 * Global data — no tenant_id.
 */
export async function seedBeerStyles(): Promise<void> {
  // ── Groups ──────────────────────────────────────────────────
  const groups = [
    { name: "Czech Lager", sortOrder: 1 },
    { name: "International Lager", sortOrder: 2 },
    { name: "Pale Ale / IPA", sortOrder: 3 },
    { name: "Wheat Beer", sortOrder: 4 },
    { name: "Stout / Porter", sortOrder: 5 },
    { name: "Belgian", sortOrder: 6 },
    { name: "Sour / Wild", sortOrder: 7 },
    { name: "Specialty", sortOrder: 8 },
  ];

  const insertedGroups = await db
    .insert(beerStyleGroups)
    .values(groups)
    .onConflictDoNothing()
    .returning({ id: beerStyleGroups.id, name: beerStyleGroups.name });

  // Build name→id map (handle both fresh inserts and re-runs)
  const groupMap = new Map<string, string>();
  for (const g of insertedGroups) {
    groupMap.set(g.name, g.id);
  }

  // If onConflictDoNothing returned nothing, query existing
  if (groupMap.size === 0) {
    const existing = await db.select({ id: beerStyleGroups.id, name: beerStyleGroups.name }).from(beerStyleGroups);
    for (const g of existing) {
      groupMap.set(g.name, g.id);
    }
  }

  // ── Styles ──────────────────────────────────────────────────
  // Values: [bjcpNumber, bjcpCategory, name, abvMin, abvMax, ibuMin, ibuMax, ebcMin, ebcMax, ogMin, ogMax, fgMin, fgMax, groupName]
  type StyleTuple = [string, string, string, string, string, string, string, string, string, string, string, string, string, string];

  const styleData: StyleTuple[] = [
    // Czech Lager
    ["3A", "Czech Lager", "Czech Pale Lager", "3.0", "4.1", "20", "35", "6", "12", "7.0", "10.0", "1.5", "3.5", "Czech Lager"],
    ["3B", "Czech Lager", "Czech Premium Pale Lager", "4.2", "5.8", "30", "45", "7", "14", "10.5", "14.0", "2.5", "4.0", "Czech Lager"],
    ["3C", "Czech Lager", "Czech Amber Lager", "4.4", "5.8", "20", "35", "20", "35", "10.5", "14.0", "2.5", "4.0", "Czech Lager"],
    ["3D", "Czech Lager", "Czech Dark Lager", "4.4", "5.8", "18", "34", "30", "70", "10.5", "14.0", "2.5", "4.0", "Czech Lager"],

    // International Lager
    ["1A", "Standard American Beer", "American Light Lager", "2.8", "4.2", "8", "12", "4", "6", "6.0", "8.5", "1.0", "2.5", "International Lager"],
    ["1B", "Standard American Beer", "American Lager", "4.2", "5.3", "8", "18", "4", "8", "9.5", "12.5", "1.5", "3.0", "International Lager"],
    ["2A", "International Lager", "International Pale Lager", "4.6", "6.0", "18", "25", "4", "12", "9.5", "12.5", "1.5", "3.0", "International Lager"],
    ["2B", "International Lager", "International Amber Lager", "4.6", "6.0", "8", "25", "14", "30", "10.5", "14.0", "2.5", "4.0", "International Lager"],
    ["2C", "International Lager", "International Dark Lager", "4.2", "6.0", "8", "20", "30", "56", "9.5", "14.0", "2.0", "4.0", "International Lager"],

    // Pale Ale / IPA
    ["12A", "Pale Commonwealth Beer", "British Golden Ale", "3.8", "5.0", "20", "45", "4", "12", "9.0", "12.5", "1.5", "3.0", "Pale Ale / IPA"],
    ["12C", "Pale Commonwealth Beer", "English IPA", "5.0", "7.5", "40", "60", "12", "24", "12.5", "17.5", "2.5", "4.5", "Pale Ale / IPA"],
    ["18B", "Pale American Ale", "American Pale Ale", "4.5", "6.2", "30", "50", "10", "20", "11.0", "14.5", "2.0", "3.5", "Pale Ale / IPA"],
    ["21A", "IPA", "American IPA", "5.5", "7.5", "40", "70", "12", "28", "13.5", "17.5", "2.5", "4.0", "Pale Ale / IPA"],
    ["21B", "IPA", "Specialty IPA", "6.3", "7.5", "50", "70", "12", "28", "15.5", "18.5", "3.0", "4.5", "Pale Ale / IPA"],
    ["22A", "Strong American Ale", "Double IPA", "7.5", "10.0", "60", "100", "12", "28", "17.5", "23.5", "3.0", "5.0", "Pale Ale / IPA"],
    ["21C", "IPA", "Hazy IPA", "6.0", "9.0", "25", "60", "6", "18", "15.0", "21.0", "3.0", "4.5", "Pale Ale / IPA"],

    // Wheat Beer
    ["10A", "German Wheat Beer", "Weissbier", "4.3", "5.6", "8", "15", "4", "14", "10.5", "14.0", "2.5", "4.0", "Wheat Beer"],
    ["10B", "German Wheat Beer", "Dunkles Weissbier", "4.3", "5.6", "10", "18", "28", "50", "10.5", "14.5", "2.5", "4.5", "Wheat Beer"],
    ["10C", "German Wheat Beer", "Weizenbock", "6.5", "9.0", "15", "30", "12", "50", "16.0", "22.5", "4.0", "6.5", "Wheat Beer"],
    ["24A", "Belgian Ale", "Witbier", "4.5", "5.5", "8", "20", "4", "12", "10.5", "13.5", "2.0", "3.5", "Wheat Beer"],

    // Stout / Porter
    ["13A", "Brown British Beer", "Dark Mild", "3.0", "3.8", "10", "25", "24", "70", "7.5", "10.0", "2.0", "3.5", "Stout / Porter"],
    ["13C", "Brown British Beer", "English Porter", "4.0", "5.4", "18", "35", "40", "70", "10.0", "13.5", "2.5", "4.0", "Stout / Porter"],
    ["15B", "Irish Beer", "Irish Stout", "4.0", "4.5", "25", "45", "50", "80", "9.5", "11.0", "2.5", "3.5", "Stout / Porter"],
    ["15C", "Irish Beer", "Irish Extra Stout", "5.5", "6.5", "35", "50", "60", "80", "13.5", "16.0", "3.5", "5.0", "Stout / Porter"],
    ["16A", "Dark British Beer", "Sweet Stout", "4.0", "6.0", "20", "40", "60", "80", "10.0", "15.5", "3.0", "5.5", "Stout / Porter"],
    ["16B", "Dark British Beer", "Oatmeal Stout", "4.2", "5.9", "25", "40", "44", "80", "10.5", "15.0", "2.5", "4.0", "Stout / Porter"],
    ["20B", "American Porter and Stout", "American Stout", "5.0", "7.0", "35", "75", "60", "80", "12.5", "17.5", "2.5", "4.5", "Stout / Porter"],
    ["20C", "American Porter and Stout", "Imperial Stout", "8.0", "12.0", "50", "90", "60", "120", "19.5", "28.0", "4.0", "8.0", "Stout / Porter"],

    // Belgian
    ["24B", "Belgian Ale", "Belgian Pale Ale", "4.8", "5.5", "20", "30", "16", "24", "11.5", "14.0", "2.5", "3.5", "Belgian"],
    ["25A", "Strong Belgian Ale", "Belgian Blond Ale", "6.0", "7.5", "15", "30", "8", "14", "15.0", "18.0", "3.0", "4.5", "Belgian"],
    ["25B", "Strong Belgian Ale", "Saison", "5.0", "7.0", "20", "35", "10", "18", "12.5", "16.5", "1.0", "3.0", "Belgian"],
    ["25C", "Strong Belgian Ale", "Belgian Golden Strong Ale", "7.5", "10.5", "22", "35", "6", "10", "17.0", "23.5", "1.5", "4.0", "Belgian"],
    ["26B", "Trappist Ale", "Belgian Dubbel", "6.0", "7.6", "15", "25", "20", "40", "15.0", "18.5", "3.0", "5.0", "Belgian"],
    ["26C", "Trappist Ale", "Belgian Tripel", "7.5", "9.5", "20", "40", "9", "14", "17.5", "22.0", "3.0", "5.0", "Belgian"],
    ["26D", "Trappist Ale", "Belgian Dark Strong Ale", "8.0", "12.0", "20", "35", "24", "50", "18.0", "26.5", "4.0", "8.0", "Belgian"],

    // Sour / Wild
    ["23A", "European Sour Ale", "Berliner Weisse", "2.8", "3.8", "3", "8", "4", "6", "6.5", "9.0", "1.5", "2.5", "Sour / Wild"],
    ["23B", "European Sour Ale", "Flanders Red Ale", "4.6", "6.5", "10", "25", "20", "40", "11.5", "16.5", "2.5", "4.5", "Sour / Wild"],
    ["23C", "European Sour Ale", "Oud Bruin", "4.0", "8.0", "20", "25", "30", "44", "10.0", "18.5", "2.5", "5.0", "Sour / Wild"],
    ["23D", "Belgian Ale", "Lambic", "5.0", "6.5", "0", "10", "6", "14", "10.5", "14.5", "1.5", "3.5", "Sour / Wild"],
    ["23F", "Belgian Ale", "Fruit Lambic", "5.0", "7.0", "0", "10", "6", "14", "10.5", "14.5", "1.5", "3.5", "Sour / Wild"],

    // Specialty
    ["28A", "American Wild Ale", "Brett Beer", "4.0", "8.0", "0", "50", "0", "60", "10.0", "19.5", "1.5", "5.0", "Specialty"],
    ["29A", "Fruit Beer", "Fruit Beer", "4.0", "7.0", "0", "50", "0", "60", "10.0", "17.5", "1.5", "4.5", "Specialty"],
    ["30A", "Spiced Beer", "Spice, Herb, or Vegetable Beer", "4.0", "7.0", "0", "50", "0", "60", "10.0", "17.5", "1.5", "4.5", "Specialty"],
    ["30B", "Spiced Beer", "Autumn Seasonal Beer", "4.0", "8.0", "0", "50", "0", "60", "10.0", "19.5", "1.5", "5.0", "Specialty"],
    ["30D", "Spiced Beer", "Winter Seasonal Beer", "4.0", "8.0", "0", "50", "0", "60", "10.0", "19.5", "1.5", "5.0", "Specialty"],
  ];

  const stylesToInsert = styleData
    .map(([bjcpNumber, bjcpCategory, name, abvMin, abvMax, ibuMin, ibuMax, ebcMin, ebcMax, ogMin, ogMax, fgMin, fgMax, groupName]) => {
      const groupId = groupMap.get(groupName);
      if (!groupId) return null;
      return {
        styleGroupId: groupId,
        bjcpNumber,
        bjcpCategory,
        name,
        abvMin,
        abvMax,
        ibuMin,
        ibuMax,
        ebcMin,
        ebcMax,
        ogMin,
        ogMax,
        fgMin,
        fgMax,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (stylesToInsert.length > 0) {
    await db
      .insert(beerStyles)
      .values(stylesToInsert)
      .onConflictDoNothing();
  }
}

/**
 * Seed system mashing profiles (no tenant_id).
 */
export async function seedMashingProfiles(): Promise<void> {
  const profiles = [
    {
      tenantId: null,
      name: "Jednokvasný infuzní",
      mashingType: "infusion" as const,
      steps: [
        { name: "Zapáření", stepType: "mash_in", targetTemperatureC: 62, rampTimeMin: 5, holdTimeMin: 5 },
        { name: "Maltózová prodleva", stepType: "rest", targetTemperatureC: 62, rampTimeMin: 0, holdTimeMin: 30 },
        { name: "Ohřev na sacharifikaci", stepType: "heat", targetTemperatureC: 72, rampTimeMin: 10, holdTimeMin: 0 },
        { name: "Sacharifikační prodleva", stepType: "rest", targetTemperatureC: 72, rampTimeMin: 0, holdTimeMin: 30 },
        { name: "Odrmutování", stepType: "mash_out", targetTemperatureC: 78, rampTimeMin: 5, holdTimeMin: 10 },
      ],
      notes: "Základní infuzní postup — jednoduchý, vhodný pro většinu ležáků.",
    },
    {
      tenantId: null,
      name: "Dvourastový infuzní",
      mashingType: "infusion" as const,
      steps: [
        { name: "Zapáření", stepType: "mash_in", targetTemperatureC: 52, rampTimeMin: 5, holdTimeMin: 5 },
        { name: "Bílkovinná prodleva", stepType: "rest", targetTemperatureC: 52, rampTimeMin: 0, holdTimeMin: 15 },
        { name: "Ohřev na maltózu", stepType: "heat", targetTemperatureC: 62, rampTimeMin: 10, holdTimeMin: 0 },
        { name: "Maltózová prodleva", stepType: "rest", targetTemperatureC: 62, rampTimeMin: 0, holdTimeMin: 30 },
        { name: "Ohřev na sacharifikaci", stepType: "heat", targetTemperatureC: 72, rampTimeMin: 10, holdTimeMin: 0 },
        { name: "Sacharifikační prodleva", stepType: "rest", targetTemperatureC: 72, rampTimeMin: 0, holdTimeMin: 30 },
        { name: "Odrmutování", stepType: "mash_out", targetTemperatureC: 78, rampTimeMin: 5, holdTimeMin: 10 },
      ],
      notes: "Dvourastový infuzní postup — pro plnější tělo a lepší konverzi.",
    },
    {
      tenantId: null,
      name: "Český dekokční — jednomezový",
      mashingType: "decoction" as const,
      steps: [
        { name: "Zapáření", stepType: "mash_in", targetTemperatureC: 62, rampTimeMin: 5, holdTimeMin: 5 },
        { name: "Maltózová prodleva", stepType: "rest", targetTemperatureC: 62, rampTimeMin: 0, holdTimeMin: 20 },
        { name: "1. dekokce", stepType: "decoction", targetTemperatureC: 72, rampTimeMin: 25, holdTimeMin: 0 },
        { name: "Sacharifikační prodleva", stepType: "rest", targetTemperatureC: 72, rampTimeMin: 0, holdTimeMin: 30 },
        { name: "Odrmutování", stepType: "mash_out", targetTemperatureC: 78, rampTimeMin: 5, holdTimeMin: 10 },
      ],
      notes: "Klasický český jednomezový dekokční postup.",
    },
    {
      tenantId: null,
      name: "Český dekokční — dvoumezový",
      mashingType: "decoction" as const,
      steps: [
        { name: "Zapáření", stepType: "mash_in", targetTemperatureC: 52, rampTimeMin: 5, holdTimeMin: 5 },
        { name: "Bílkovinná prodleva", stepType: "rest", targetTemperatureC: 52, rampTimeMin: 0, holdTimeMin: 10 },
        { name: "1. dekokce", stepType: "decoction", targetTemperatureC: 62, rampTimeMin: 25, holdTimeMin: 0 },
        { name: "Maltózová prodleva", stepType: "rest", targetTemperatureC: 62, rampTimeMin: 0, holdTimeMin: 20 },
        { name: "2. dekokce", stepType: "decoction", targetTemperatureC: 72, rampTimeMin: 25, holdTimeMin: 0 },
        { name: "Sacharifikační prodleva", stepType: "rest", targetTemperatureC: 72, rampTimeMin: 0, holdTimeMin: 30 },
        { name: "Odrmutování", stepType: "mash_out", targetTemperatureC: 78, rampTimeMin: 5, holdTimeMin: 10 },
      ],
      notes: "Tradiční český dvoumezový dekokční postup — pro nejlepší výtěžnost.",
    },
  ];

  for (const profile of profiles) {
    await db
      .insert(mashingProfiles)
      .values(profile)
      .onConflictDoNothing();
  }
}
