/**
 * Import beer styles from Bubble CSV exports into ProfiBrew PostgreSQL.
 *
 * Sources:
 *   - Groups: docs/BeerStyles/export_All-BeerStyleGroups-modified_2026-02-27_15-29-04.csv
 *   - Styles: docs/BeerStyles/export_All-BeerStylePUBS-modified--_2026-02-27_15-25-00.csv
 *
 * Prerequisites:
 *   npm install csv-parse   (if not already installed)
 *
 * Run with:
 *   node scripts/import-beer-styles.mjs
 */
import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL);

// ---------------------------------------------------------------------------
// Czech → English group name mapping
// ---------------------------------------------------------------------------
const CZ_TO_EN = {
  "Speciální styly": "Specialty",
  "Polotmavé ležáky": "Amber Lager",
  "IPA / Pale Ale": "IPA / Pale Ale",
  "Tmavší Ale": "Dark Ale",
  "Silná speciální piva": "Strong Specialty",
  "Stout / Porter": "Stout / Porter",
  "Kyselá / speciální piva": "Sour / Wild",
  "Belgická piva": "Belgian",
  "Tmavé ležáky": "Dark Lager",
  "Světlé ležáky": "Pale Lager",
  "Svrchně kvašené Ale": "Ale",
  "Ostatní ležáky": "Other Lager",
  "Pšeničná piva": "Wheat Beer",
};

// Sort order — Pale Lager first, then Amber, Dark, specialty, ales, etc.
const SORT_ORDER = {
  "Světlé ležáky": 1,
  "Polotmavé ležáky": 2,
  "Tmavé ležáky": 3,
  "Ostatní ležáky": 4,
  "Pšeničná piva": 5,
  "IPA / Pale Ale": 6,
  "Svrchně kvašené Ale": 7,
  "Tmavší Ale": 8,
  "Stout / Porter": 9,
  "Belgická piva": 10,
  "Kyselá / speciální piva": 11,
  "Silná speciální piva": 12,
  "Speciální styly": 13,
};

// Czech group name → image filename slug
const IMAGE_SLUGS = {
  "Světlé ležáky": "pale-lager",
  "Polotmavé ležáky": "amber-lager",
  "Tmavé ležáky": "dark-lager",
  "Ostatní ležáky": "other-lager",
  "Pšeničná piva": "wheat-beer",
  "IPA / Pale Ale": "ipa-pale-ale",
  "Svrchně kvašené Ale": "ale",
  "Tmavší Ale": "dark-ale",
  "Stout / Porter": "stout-porter",
  "Belgická piva": "belgian",
  "Kyselá / speciální piva": "sour-wild",
  "Silná speciální piva": "strong-specialty",
  "Speciální styly": "specialty",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a decimal value from CSV (uses comma as decimal separator).
 * Returns null for empty / non-numeric values.
 */
function parseDecimal(value) {
  if (value === undefined || value === null || value === "") return null;
  const cleaned = String(value).replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Convert SRM to EBC.  ebc = srm * 1.97, rounded to 1 decimal.
 */
function srmToEbc(srm) {
  if (srm === null) return null;
  return Math.round(srm * 1.97 * 10) / 10;
}

/**
 * Convert SG (specific gravity, e.g. 1.044) to Plato.
 * Formula: °P ≈ 259 - (259 / SG), rounded to 1 decimal.
 * Returns null if SG is missing or <= 0.
 */
function sgToPlato(sg) {
  if (sg === null || sg <= 0) return null;
  const plato = 259 - 259 / sg;
  return Math.round(plato * 10) / 10;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // --- Read CSV files -------------------------------------------------------
  const groupsCsvPath = resolve(
    __dirname,
    "../docs/BeerStyles/export_All-BeerStyleGroups-modified_2026-02-27_15-29-04.csv"
  );
  const stylesCsvPath = resolve(
    __dirname,
    "../docs/BeerStyles/export_All-BeerStylePUBS-modified--_2026-02-27_15-25-00.csv"
  );

  const groupsRaw = readFileSync(groupsCsvPath, "utf-8");
  const stylesRaw = readFileSync(stylesCsvPath, "utf-8");

  const groupRows = parse(groupsRaw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  const styleRows = parse(stylesRaw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  console.log(`Read ${groupRows.length} group rows, ${styleRows.length} style rows from CSV.\n`);

  // --- Disconnect FK references from recipes --------------------------------
  console.log("Disconnecting beer_style_id references from recipes...");
  const recipeResult = await sql`
    UPDATE recipes SET beer_style_id = NULL WHERE beer_style_id IS NOT NULL
  `;
  console.log(`  Updated ${recipeResult.count} recipe(s).\n`);

  // --- Delete existing data -------------------------------------------------
  console.log("Deleting existing beer styles and groups...");
  const deletedStyles = await sql`DELETE FROM beer_styles`;
  const deletedGroups = await sql`DELETE FROM beer_style_groups`;
  console.log(`  Deleted ${deletedStyles.count} styles, ${deletedGroups.count} groups.\n`);

  // --- Import groups --------------------------------------------------------
  console.log("Importing beer style groups...");

  // Map: Bubble unique id → { uuid, nameCz, nameEn }
  const groupMap = new Map();

  for (const row of groupRows) {
    const bubbleId = row["unique id"];
    const nameCz = row["nameCZ"];
    const nameEn = CZ_TO_EN[nameCz];

    if (!nameEn) {
      console.warn(`  WARNING: No English mapping for group "${nameCz}" (bubble id: ${bubbleId}). Using Czech name.`);
    }

    const sortOrder = SORT_ORDER[nameCz] ?? 99;
    const imageSlug = IMAGE_SLUGS[nameCz];
    const imageUrl = imageSlug ? `/Images/Styles/Groups/${imageSlug}.png` : null;

    const [inserted] = await sql`
      INSERT INTO beer_style_groups (name, name_cz, image_url, sort_order)
      VALUES (${nameEn || nameCz}, ${nameCz}, ${imageUrl}, ${sortOrder})
      RETURNING id
    `;

    groupMap.set(bubbleId, {
      uuid: inserted.id,
      nameCz,
      nameEn: nameEn || nameCz,
    });
  }

  console.log(`  Imported ${groupMap.size} groups.\n`);

  // --- Import styles --------------------------------------------------------
  console.log("Importing beer styles...");

  let importedCount = 0;
  let skippedCount = 0;
  const warnings = [];
  const samples = [];

  for (const row of styleRows) {
    const bubbleGroupId = row["stylegroup"];
    const groupInfo = groupMap.get(bubbleGroupId);

    if (!groupInfo) {
      const styleName = row["Style"] || "(unnamed)";
      warnings.push(`Style "${styleName}" has unmapped stylegroup "${bubbleGroupId}" — skipped.`);
      skippedCount++;
      continue;
    }

    // Parse numeric fields
    const abvMin = parseDecimal(row["ABVmin"]);
    const abvMax = parseDecimal(row["ABVmax"]);
    const ibuMin = parseDecimal(row["IBUmin"]);
    const ibuMax = parseDecimal(row["IBUmax"]);
    const srmMin = parseDecimal(row["SRMmin"]);
    const srmMax = parseDecimal(row["SRMmax"]);
    const ogMinSg = parseDecimal(row["OGmin"]);
    const ogMaxSg = parseDecimal(row["OGmax"]);
    const fgMinSg = parseDecimal(row["FGmin"]);
    const fgMaxSg = parseDecimal(row["FGmax"]);

    // Conversions
    const ebcMin = srmToEbc(srmMin);
    const ebcMax = srmToEbc(srmMax);
    const ogMin = sgToPlato(ogMinSg);
    const ogMax = sgToPlato(ogMaxSg);
    const fgMin = sgToPlato(fgMinSg);
    const fgMax = sgToPlato(fgMaxSg);

    // Text fields
    const styleName = row["Style"] || "";
    const bjcpNumber = row["BJCPnumb"] || null;
    const bjcpCategory = row["BJCPCategory"] || null;
    const appearance = row["Appearance"] || null;
    const aroma = row["Aroma"] || null;
    const flavor = row["Flavor"] || null;
    const comments = row["Comments"] || null;
    const impression = row["Impression"] || null;
    const mouthfeel = row["Mouthfell"] || null; // Note: typo in CSV column name
    const history = row["History"] || null;
    const ingredients = row["Ingredients"] || null;
    const styleComparison = row["StyleComparison"] || null;
    const commercialExamples = row["CommercialExamples"] || null;
    const origin = row["Origin"] || null;
    const styleFamily = row["StyleFamily"] || null;

    await sql`
      INSERT INTO beer_styles (
        style_group_id, bjcp_number, bjcp_category, name,
        abv_min, abv_max, ibu_min, ibu_max,
        ebc_min, ebc_max, srm_min, srm_max,
        og_min, og_max, fg_min, fg_max,
        appearance, aroma, flavor, comments,
        impression, mouthfeel, history, ingredients,
        style_comparison, commercial_examples, origin, style_family
      )
      VALUES (
        ${groupInfo.uuid}, ${bjcpNumber}, ${bjcpCategory}, ${styleName},
        ${abvMin}, ${abvMax}, ${ibuMin}, ${ibuMax},
        ${ebcMin}, ${ebcMax}, ${srmMin}, ${srmMax},
        ${ogMin}, ${ogMax}, ${fgMin}, ${fgMax},
        ${appearance}, ${aroma}, ${flavor}, ${comments},
        ${impression}, ${mouthfeel}, ${history}, ${ingredients},
        ${styleComparison}, ${commercialExamples}, ${origin}, ${styleFamily}
      )
    `;

    importedCount++;

    // Collect first 3 samples for verification
    if (samples.length < 3) {
      samples.push({
        name: styleName,
        group: groupInfo.nameEn,
        srmMin,
        srmMax,
        ebcMin,
        ebcMax,
        ogMinSg,
        ogMaxSg,
        ogMinPlato: ogMin,
        ogMaxPlato: ogMax,
      });
    }
  }

  // --- Summary --------------------------------------------------------------
  console.log(`  Imported ${importedCount} styles, skipped ${skippedCount}.\n`);

  if (warnings.length > 0) {
    console.log("WARNINGS:");
    for (const w of warnings) {
      console.log(`  ${w}`);
    }
    console.log();
  }

  console.log("Sample styles (first 3) for verification:");
  for (const s of samples) {
    console.log(`  ${s.name} (${s.group})`);
    console.log(`    SRM: ${s.srmMin}–${s.srmMax}  →  EBC: ${s.ebcMin}–${s.ebcMax}`);
    console.log(`    OG (SG): ${s.ogMinSg}–${s.ogMaxSg}  →  OG (°P): ${s.ogMinPlato}–${s.ogMaxPlato}`);
  }

  console.log("\nDone.");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  })
  .finally(() => {
    sql.end();
  });
