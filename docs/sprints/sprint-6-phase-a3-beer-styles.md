# SPRINT 6 — FÁZE A3: PIVNÍ STYLY (BJCP 2021 + vizualizace)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 27.02.2026

---

## CÍL

Rozšířit stávající pivní styly na kompletních 118 BJCP 2021 stylů s vizuálně atraktivním zobrazením. Přidat české názvy skupin, obrázky skupin (statické fotky) a runtime React komponentu `<BeerGlass>` pro dynamické zobrazení půlitru s barvou piva dle EBC.

**Závisí na:** Sprint 2 (stávající beer_styles + beer_style_groups)

---

## KONTEXT

### Co máme

- Tabulka `beer_style_groups` — 8 skupin (Czech Lager, International Lager, Pale Ale/IPA, Wheat Beer, Stout/Porter, Belgian, Sour/Wild, Specialty)
- Tabulka `beer_styles` — ~40 stylů se základními parametry (ABV, IBU, EBC, OG, FG)
- Seed script v `src/lib/db/seed-beer-styles.ts` a `scripts/seed-sprint2.mjs`
- Drizzle schema v `drizzle/schema/beer-styles.ts`

### Co chceme

- **118 stylů** z BJCP 2021 (kompletní set z Bubble exportu)
- **Víc skupin** — uživatel má jiné dělení než našich 8 (dodá CSV export z Bubble)
- **České názvy skupin** + obrázky půlitrů per skupina
- **BeerGlass komponenta** — SVG půlitr obarvený dle EBC, použitelný všude v aplikaci
- **Bohatší textové popisy** — Appearance, Aroma, Flavor, Mouthfeel, Impression, Ingredients, History, CommercialExamples

---

## KROK 1: SCHEMA ROZŠÍŘENÍ

### 1.1 beer_style_groups — nové sloupce

```sql
ALTER TABLE beer_style_groups ADD COLUMN name_cz TEXT;           -- Český název skupiny
ALTER TABLE beer_style_groups ADD COLUMN image_url TEXT;          -- Cesta k obrázku (/images/styles/groups/czech-lager.png)
```

**Drizzle schema** (`drizzle/schema/beer-styles.ts`):

```typescript
export const beerStyleGroups = pgTable("beer_style_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),                    // EN název
  nameCz: text("name_cz"),                         // CZ název
  imageUrl: text("image_url"),                      // /images/styles/groups/slug.png
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

### 1.2 beer_styles — nové sloupce

```sql
-- Textové popisy z BJCP
ALTER TABLE beer_styles ADD COLUMN impression TEXT;               -- Overall Impression
ALTER TABLE beer_styles ADD COLUMN mouthfeel TEXT;                -- Mouthfeel
ALTER TABLE beer_styles ADD COLUMN history TEXT;                  -- History
ALTER TABLE beer_styles ADD COLUMN ingredients TEXT;              -- Characteristic Ingredients
ALTER TABLE beer_styles ADD COLUMN style_comparison TEXT;         -- Style Comparison
ALTER TABLE beer_styles ADD COLUMN commercial_examples TEXT;      -- Commercial Examples
ALTER TABLE beer_styles ADD COLUMN origin TEXT;                   -- Country/region of origin

-- SRM (americký standard — Bubble data mají SRM, my konvertujeme na EBC)
ALTER TABLE beer_styles ADD COLUMN srm_min DECIMAL;              -- SRM min (pro referenci)
ALTER TABLE beer_styles ADD COLUMN srm_max DECIMAL;              -- SRM max (pro referenci)

-- Vizualizace
ALTER TABLE beer_styles ADD COLUMN style_family TEXT;             -- Style family (pro filtrování)
```

**Drizzle schema** — přidat sloupce do `beerStyles` tabulky.

### 1.3 Konverze SRM ↔ EBC

**Vzorec:** `EBC = SRM × 1.97` (a obráceně `SRM = EBC / 1.97`)

**Pravidlo:** V DB ukládáme **obojí** — `ebc_min/ebc_max` (primární, pro výpočty a zobrazení v ČR/EU) + `srm_min/srm_max` (referenční, z originálních BJCP dat).

Pokud CSV z Bubble obsahuje SRM (což je pravděpodobné dle schématu), import script musí:
1. Uložit originální SRM do `srm_min/srm_max`
2. Vypočítat a uložit `ebc_min = srm_min × 1.97`, `ebc_max = srm_max × 1.97`

### 1.4 Migrace

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## KROK 2: DATA IMPORT

### 2.1 Očekávaný vstup

Uživatel dodá **2 CSV soubory** exportované z Bubble:

**A) `beer_style_groups.csv`** — skupiny:
```
_id, name (EN), nameCZ, image (Bubble URL)
```

**B) `beer_styles.csv`** — 118 stylů:
```
_id, BJCPnumb, BJCPCategory, Style (název), stylegroup (FK → group._id),
ABVmin, ABVmax, IBUmin, IBUmax, SRMmin, SRMmax, OGmin, OGmax, FGmin, FGmax,
Appearance, Aroma, Flavor, Comments, History, Impression, Ingredients,
Mouthfell, Notes, Origin, CommercialExamples, StyleComparison, StyleFamily, image
```

**⚠️ POZOR na Bubble specifika:**
- FK vazby jsou Bubble internal IDs (ne UUID) — mapovat přes `_id`
- SRM v datech, ne EBC — konvertovat
- OG/FG mohou být v SG formátu (1.044) NEBO v °Plato — ověřit z dat
- Čísla mohou mít desetinné tečky nebo čárky — ošetřit

### 2.2 Import script

**Soubor:** `scripts/import-beer-styles.mjs`

```javascript
/**
 * Import beer styles from Bubble CSV export.
 * 
 * Usage:
 *   node scripts/import-beer-styles.mjs \
 *     --groups ./data/beer_style_groups.csv \
 *     --styles ./data/beer_styles.csv
 * 
 * Steps:
 * 1. Truncate existing beer_styles and beer_style_groups (CASCADED)
 * 2. Import groups → build _id → uuid map
 * 3. Import styles with FK mapping and SRM→EBC conversion
 */
```

**Logika:**
1. Přečíst CSV (papaparse nebo csv-parse)
2. TRUNCATE `beer_styles` CASCADE, pak `beer_style_groups` CASCADE
3. Pro každou skupinu: vygenerovat UUID, uložit do DB, mapovat Bubble `_id` → nový UUID
4. Pro každý styl:
   - Namapovat `stylegroup` Bubble `_id` → UUID skupiny
   - Konvertovat SRM → EBC: `ebc_min = srm_min * 1.97`, `ebc_max = srm_max * 1.97`
   - Ověřit OG/FG formát (pokud > 1 → SG, pokud < 1 → asi špatná data)
   - Uložit do DB

**⚠️ TRUNCATE je OK** — jsou to systémové tabulky bez tenant dat. Ale POZOR: recipes mají FK `beer_style_id` → CASCADE by smazal vazbu na receptech! Proto:
```sql
-- Místo TRUNCATE: nejdřív odpoj recepty
UPDATE recipes SET beer_style_id = NULL WHERE beer_style_id IS NOT NULL;
-- Pak smaž styly a skupiny
DELETE FROM beer_styles;
DELETE FROM beer_style_groups;
-- Pak importuj
```

### 2.3 Verifikace po importu

```sql
-- Počet skupin
SELECT COUNT(*) FROM beer_style_groups;  -- Mělo by odpovídat CSV

-- Počet stylů
SELECT COUNT(*) FROM beer_styles;  -- Mělo by být 118

-- Kontrola FK integrity
SELECT bs.name, bsg.name AS group_name
FROM beer_styles bs
JOIN beer_style_groups bsg ON bs.style_group_id = bsg.id
ORDER BY bsg.sort_order, bs.bjcp_number
LIMIT 10;

-- Kontrola EBC konverze
SELECT name, srm_min, srm_max, ebc_min, ebc_max,
       ROUND(srm_min * 1.97, 1) AS computed_ebc_min
FROM beer_styles
WHERE srm_min IS NOT NULL
LIMIT 5;
```

---

## KROK 3: OBRÁZKY SKUPIN

### 3.1 Adresářová struktura

```
public/
└── images/
    └── styles/
        └── groups/
            ├── czech-lager.png
            ├── international-lager.png
            ├── pale-ale-ipa.png
            ├── wheat-beer.png
            ├── stout-porter.png
            ├── belgian.png
            ├── sour-wild.png
            ├── specialty.png
            └── ... (další dle skupin z Bubble)
```

### 3.2 Pojmenování

Slug z anglického názvu skupiny: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')` → `czech-lager.png`

### 3.3 DB hodnota

`image_url` v `beer_style_groups` = `/images/styles/groups/czech-lager.png`

V Next.js zobrazit přes `<Image src={group.imageUrl} ... />` (next/image optimalizace).

### 3.4 Postup

1. Uživatel dodá PNG soubory obrázků skupin
2. Přejmenovat dle slug konvence
3. Uložit do `public/images/styles/groups/`
4. V import scriptu nebo ručně nastavit `image_url` v DB

**Pokud obrázky nejsou dodány:** Ponechat `image_url = NULL`. UI zobrazí fallback (generický BeerGlass komponent s průměrnou EBC skupiny).

---

## KROK 4: BEERGLASS KOMPONENTA

### 4.1 Princip

React SVG komponenta zobrazující půlitr piva obarvený dle EBC hodnoty. Jedna komponenta, použitelná všude:
- Browser pivních stylů
- Card view receptur
- Detail receptury
- Detail šarže
- Jakékoliv místo kde chceme vizualizovat barvu piva

### 4.2 Umístění

```
src/components/ui/beer-glass/
├── BeerGlass.tsx          -- Hlavní komponenta
├── ebc-to-color.ts        -- Konverze EBC → CSS barva
└── index.ts
```

### 4.3 API

```typescript
interface BeerGlassProps {
  /** EBC hodnota (barva piva). 0 = velmi světlé, 80+ = černé */
  ebc: number
  /** Velikost v pixelech (šířka, výška se dopočítá dle poměru) */
  size?: 'sm' | 'md' | 'lg'    // sm=40px, md=64px, lg=96px
  /** Typ sklenice */
  variant?: 'pint' | 'mug'     // pint = klasický půlitr (default), mug = krigel s uchem
  /** Volitelný className pro wrapper */
  className?: string
}

export function BeerGlass({ ebc, size = 'md', variant = 'mug', className }: BeerGlassProps)
```

### 4.4 EBC → barva konverze

**Soubor:** `ebc-to-color.ts`

Tabulka/funkce mapující EBC na hex barvu. Standardní SRM/EBC color reference:

```typescript
/**
 * Konverze EBC na CSS hex barvu.
 * Založeno na standardní SRM color chart.
 * EBC = SRM × 1.97, takže EBC 2 ≈ SRM 1 (very pale), EBC 80 ≈ SRM 40 (black)
 */
export function ebcToColor(ebc: number): string {
  // Clamp
  const clamped = Math.max(0, Math.min(ebc, 160))
  const srm = clamped / 1.97

  // Standardní SRM → RGB mapping (zjednodušená interpolace)
  // Reference: https://www.brewersfriend.com/color-guide/
  const colorMap: [number, string][] = [
    [0,  '#FFE699'],  // Water / very pale
    [1,  '#FFD878'],  // Pale straw
    [2,  '#FFCA5A'],  // Straw
    [3,  '#FFBF42'],  // Pale gold
    [4,  '#FBB123'],  // Deep gold
    [5,  '#F8A600'],  // Pale amber
    [6,  '#F39C00'],  // Medium amber
    [8,  '#EA8F00'],  // Deep amber
    [10, '#E58500'],  // Amber-brown
    [13, '#CA6500'],  // Brown
    [17, '#A85600'],  // Ruby brown
    [20, '#8D4C32'],  // Deep brown
    [24, '#7C452D'],  // Dark brown
    [29, '#6B3A1E'],  // Very dark brown
    [35, '#5A301A'],  // Near black
    [40, '#3B1F12'],  // Black
  ]

  // Interpolate between nearest values
  // ... (implementace lineární interpolace)
}
```

### 4.5 SVG struktura

Půlitr (mug variant) jako inline SVG:
- Obrys sklenice (stroke, průhledný)
- Výplň piva (rect/path s barvou z `ebcToColor(ebc)`)
- Pěna nahoře (bílá/krémová, mírně průhledná)
- Ucho (pro mug variant)

**Vizuální reference:** Screenshoty z Bubble — jednoduché, čisté, rozpoznatelné ikony. NE fotorealistické.

### 4.6 Použití

```tsx
// V browseru stylů
<BeerGlass ebc={style.ebcMin + (style.ebcMax - style.ebcMin) / 2} size="lg" />

// V card view receptur
<BeerGlass ebc={recipe.targetEbc || 12} size="md" />

// V detailu šarže
<BeerGlass ebc={batch.ogActual ? computeEbc(batch) : 12} size="lg" />
```

---

## KROK 5: AKTUALIZACE STÁVAJÍCÍHO UI

### 5.1 Recipe browser (card view)

Aktuálně karty receptur nemají obrázek piva. Přidat `<BeerGlass>`:
- EBC z recipe kalkulace (pokud existuje) nebo z beer_style.ebc_min/max průměr
- Pozice: pravý horní roh karty (jako na Bubble screenshotu)

### 5.2 Beer style browser/select

Pokud existuje select/dropdown pro výběr pivního stylu na receptuře:
- Přidat `<BeerGlass>` vedle názvu stylu v dropdown
- Zobrazit skupinu s obrázkem (pokud má image_url)

### 5.3 Beer style list view (budoucí, ne v této fázi)

Screenshot z Bubble ukazuje dedikovaný browser stylů se sloupci BJCPnumb, Style, Položka (group), Objem várky, MJ, Plato, Šarže, Naskladněno + obrázky. To je **scope S7/S8** (propojení s recepturami a výrobou), ne teď.

---

## KROK 6: I18N

### 6.1 Nové klíče

**`src/i18n/messages/cs/beer-styles.json`** (nový soubor pokud neexistuje):

```json
{
  "title": "Pivní styly",
  "columns": {
    "bjcpNumber": "BJCP",
    "name": "Styl",
    "group": "Skupina",
    "abv": "ABV %",
    "ibu": "IBU",
    "ebc": "EBC",
    "og": "OG",
    "fg": "FG"
  },
  "detail": {
    "appearance": "Vzhled",
    "aroma": "Aroma",
    "flavor": "Chuť",
    "mouthfeel": "Pocit v ústech",
    "impression": "Celkový dojem",
    "ingredients": "Typické suroviny",
    "history": "Historie",
    "commercialExamples": "Komerční příklady",
    "comments": "Poznámky",
    "origin": "Původ",
    "styleComparison": "Srovnání stylů"
  },
  "ranges": {
    "abv": "ABV",
    "ibu": "IBU",
    "ebc": "EBC",
    "og": "OG (°P)",
    "fg": "FG (°P)"
  }
}
```

**EN verze** analogicky.

---

## KROK 7: DOKUMENTACE

### CHANGELOG.md

```markdown
## Sprint 6 — Fáze A3: Pivní styly BJCP
- [x] beer_style_groups: name_cz, image_url sloupce
- [x] beer_styles: rozšíření o textové popisy, SRM, style_family
- [x] Import 118 BJCP 2021 stylů z Bubble CSV exportu
- [x] Skupiny s českými názvy a obrázky (/public/images/styles/groups/)
- [x] BeerGlass React komponenta (SVG půlitr, barva dle EBC)
- [x] EBC ↔ SRM konverze utility
- [x] i18n: cs + en
```

### PRODUCT-SPEC.md

Aktualizovat sekci pivních stylů — počet stylů, vizualizace, BeerGlass komponenta.

---

## AKCEPTAČNÍ KRITÉRIA

### Schema & Data
1. [ ] `beer_style_groups` má sloupce `name_cz`, `image_url`
2. [ ] `beer_styles` má sloupce `impression`, `mouthfeel`, `history`, `ingredients`, `style_comparison`, `commercial_examples`, `origin`, `srm_min`, `srm_max`, `style_family`
3. [ ] Drizzle schema aktualizováno a migrováno
4. [ ] Import script `scripts/import-beer-styles.mjs` funguje
5. [ ] Po importu: `SELECT COUNT(*) FROM beer_styles` = 118
6. [ ] Po importu: všechny styly mají `style_group_id` (žádný NULL)
7. [ ] EBC hodnoty odpovídají SRM × 1.97
8. [ ] Stávající recipes.beer_style_id vazby ošetřeny (SET NULL před import)

### Obrázky skupin
9. [ ] Adresář `public/images/styles/groups/` existuje
10. [ ] Placeholder/fallback funguje pokud obrázek chybí
11. [ ] `image_url` v DB odpovídá skutečným souborům

### BeerGlass komponenta
12. [ ] `<BeerGlass ebc={5} />` zobrazí světlý půlitr
13. [ ] `<BeerGlass ebc={40} />` zobrazí tmavý půlitr
14. [ ] `<BeerGlass ebc={80} />` zobrazí černý půlitr
15. [ ] `ebcToColor()` vrací plynulý gradient (žádné skoky)
16. [ ] Varianty `size` sm/md/lg fungují
17. [ ] Komponenta je SVG (ne canvas, ne rasterový obrázek)

### Integrace
18. [ ] Recipe card view zobrazuje BeerGlass (pokud existuje EBC nebo beer_style)
19. [ ] Beer style select/dropdown zobrazuje BeerGlass vedle názvu

### Obecné
20. [ ] i18n: cs + en
21. [ ] `npm run build` bez chyb
22. [ ] TypeScript: zero errors
23. [ ] Dokumentace aktualizována

---

## CO NEIMPLEMENTOVAT

- **Dedikovaný browser pivních stylů** (jako na screenshotu z Bubble — tabulka s filtry) — scope S7/S8
- **Custom pivní styly per tenant** — post-MVP. Zatím jen systémové (globální) styly.
- **Editace BJCP dat** — readonly, systémová tabulka
- **AI generování obrázků** pro skupiny — dodá uživatel jako PNG soubory

---

## TECHNICKÉ POZNÁMKY

- **SRM vs EBC:** V DB ukládáme obojí. EBC je primární (ČR/EU standard), SRM je referenční (originál z BJCP). Konverze: `EBC = SRM × 1.97`.
- **OG/FG formát:** Bubble data pravděpodobně mají OG/FG jako SG (specific gravity, např. 1.044). Naše DB má `og_min/og_max` — ověřit zda to ukládáme jako SG nebo °Plato. Pokud °Plato (jak naznačuje stávající seed), konvertovat: `°P ≈ 259 - (259 / SG)`.
- **TRUNCATE bezpečnost:** NIKDY TRUNCATE CASCADE — nejdřív odpoj FK vazby (recipes.beer_style_id = NULL), pak DELETE.
- **Bubble image URLs:** CSV z Bubble bude mít Bubble CDN URL pro obrázky. Ty NEPOUŽÍVÁME (jsou vázané na Bubble účet). Obrázky skupin dodá uživatel jako soubory.
- **BeerGlass SVG:** Držet jednoduché — max 10-15 SVG elementů. Ne fotorealistické, ale rozpoznatelné. Inspirace: screenshoty z Bubble (čistý, ikonický styl).
- **Stávající seed:** Po úspěšném importu z CSV smazat nebo zakomentovat starý seed v `src/lib/db/seed-beer-styles.ts` a `scripts/seed-sprint2.mjs` (sekci beer styles). Import script je nahrazuje.
