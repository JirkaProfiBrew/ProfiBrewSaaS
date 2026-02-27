# SPRINT 6 — FÁZE A3 PATCH: REÁLNÉ FOTKY + BROWSER STYLŮ
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 27.02.2026

---

## CÍL

Dva doplňky k již implementované fázi A3 (Beer Styles):

1. **Reálné fotky skupin na kartách receptur/várek** — místo BeerGlass SVG zobrazit PNG obrázek z beer_style_groups.image_url
2. **Beer Styles Browser** — readonly prohlížeč 118 BJCP stylů s filtry a detailem

---

## ČÁST 1: REÁLNÉ FOTKY NA KARTÁCH

### Pravidlo

| Místo v UI | Zobrazit | Zdroj |
|------------|----------|-------|
| Recipe card view | **Reálná fotka skupiny** (PNG) | recipe → beer_style → style_group → image_url |
| Batch card view | **Reálná fotka skupiny** (PNG) | batch → recipe → beer_style → style_group → image_url |
| Dashboard (naplánované/probíhající vary) | **Reálná fotka skupiny** (PNG) | stejný chain jako batch |
| Beer style select/dropdown | **BeerGlass SVG** (dynamická EBC barva) | `<BeerGlass ebc={avg(ebc_min, ebc_max)} size="sm" />` |
| Beer styles browser | **BeerGlass SVG** + group image | viz Část 2 |

### 1.1 Recipe browser — card view

**Zdroj obrázku:**
```
recipe.beer_style_id → beer_styles.style_group_id → beer_style_groups.image_url
```

**Implementace:**
- Na recipe list query přidat JOIN: `recipes → beer_styles → beer_style_groups` pro získání `image_url`
- Alternativně: rozšířit stávající query o `style_group_image_url` field

**Zobrazení:**
- Pozice: pravý horní roh karty (jako v Bubble prototypu — viz DashboardBrewery.jpg)
- Velikost: cca 64-80px výška, `object-fit: contain`
- Použít Next.js `<Image>` s optimalizací
- Rounded corners, subtle shadow (odpovídá designu karet)

**Fallback (v tomto pořadí):**
1. `beer_style_groups.image_url` existuje a soubor je dostupný → zobrazit fotku
2. Recipe má `ebc` hodnotu → `<BeerGlass ebc={recipe.ebc} size="md" />`
3. Recipe má beer_style s ebc_min/max → `<BeerGlass ebc={avg} size="md" />`
4. Nic → `<BeerGlass ebc={12} size="md" />` (default světlý ležák)

### 1.2 Batch browser — card view

Stejný princip. Chain je delší:
```
batch.recipe_id → recipes.beer_style_id → beer_styles.style_group_id → beer_style_groups.image_url
```

**Implementace:** Pokud batch query už JOINuje recipes, přidat další JOIN na beer_styles → beer_style_groups. Nebo přidat `style_group_image_url` na batch list response.

**Fallback:** Stejný jako u receptur.

### 1.3 Dashboard karty várek

Pokud dashboard zobrazuje karty várek (naplánované/probíhající), aplikovat stejnou logiku jako 1.2.

### 1.4 Beer style select na receptuře

**Beze změny** — v dropdownu používat `<BeerGlass>` SVG s dynamickou EBC barvou. Reálné fotky by dropdown zbytečně zpomalovaly.

---

## ČÁST 2: BEER STYLES BROWSER

### 2.1 Navigace

**Sidebar** — přidat pod modul Pivovar:

```
Pivovar:
  - Přehled
  - Partneři
  - Kontakty
  - Suroviny
  - Receptury
  - Vary
  - Varní soustavy
  - Pivní styly          ← NOVÉ
  - Rmutovací profily
  - Zařízení
```

**Ikona:** `Beer` nebo `GlassWater` z lucide-react

**Routes:**
- `/brewery/beer-styles` — browser (seznam stylů)
- `/brewery/beer-styles/[id]` — readonly detail stylu

### 2.2 Backend actions

**Soubor:** `src/modules/beer-styles/actions.ts` (nový modul nebo rozšířit existující)

```typescript
"use server"

// === LIST ===
export async function getBeerStyles(filters?: {
  groupId?: string;
  search?: string;
}): Promise<BeerStyleWithGroup[]>
// JOIN beer_styles → beer_style_groups
// Filtr: group, fulltext search (name, bjcp_number)
// Řazení: group.sort_order, bjcp_number

// === DETAIL ===
export async function getBeerStyle(id: string): Promise<BeerStyleDetail | null>
// Vrací styl + group info + všechna rozšířená pole (impression, mouthfeel, history...)

// === GROUPS ===
export async function getBeerStyleGroups(): Promise<BeerStyleGroup[]>
// Pro filtry a sidebar
```

**Typy:**

```typescript
export interface BeerStyleWithGroup {
  id: string;
  bjcpNumber: string;
  name: string;
  groupId: string;
  groupName: string;
  groupNameCz: string | null;
  groupImageUrl: string | null;
  abvMin: number; abvMax: number;
  ibuMin: number; ibuMax: number;
  ebcMin: number; ebcMax: number;
  ogMin: number; ogMax: number;
  fgMin: number; fgMax: number;
}

export interface BeerStyleDetail extends BeerStyleWithGroup {
  bjcpCategory: string | null;
  appearance: string | null;
  aroma: string | null;
  flavor: string | null;
  mouthfeel: string | null;
  impression: string | null;
  history: string | null;
  ingredients: string | null;
  styleComparison: string | null;
  commercialExamples: string | null;
  origin: string | null;
  comments: string | null;
  srmMin: number | null;
  srmMax: number | null;
}
```

### 2.3 BeerStyleBrowser

**DataBrowser config:**

**List view sloupce:**

| Sloupec | Typ | Sortable |
|---------|-----|----------|
| BeerGlass | `<BeerGlass ebc={avg} size="sm" />` | - |
| BJCP | text (bjcp_number) | ✓ |
| Název | link → detail | ✓ |
| Skupina | badge (group.name_cz nebo name) | ✓ |
| ABV | range "{min}–{max} %" | ✓ |
| IBU | range "{min}–{max}" | ✓ |
| EBC | range "{min}–{max}" | ✓ |
| OG | range "{min}–{max} °P" | ✓ |

**Quick filtry:** Vše | + jeden filtr per BeerStyleGroup (Czech Lager, IPA, Wheat...)

- Generovat z `getBeerStyleGroups()` dynamicky
- Každý filtr: `{ style_group_id: groupId }`

**Card view:**
- BeerGlass (lg, průměrná EBC) vlevo
- Název + BJCP číslo
- Skupina (badge)
- Parametry: ABV, IBU, EBC jako ranges
- Group image v pozadí nebo rohu (pokud existuje)

**Search:** Fulltext přes název a BJCP číslo

**Žádný "Vytvořit" button** — systémový číselník, readonly.

### 2.4 BeerStyleDetail

**Route:** `/brewery/beer-styles/[id]`

**Layout:**
- **Celý formulář READONLY** — žádná editace, žádný Save button
- Zobrazit jako detail view (ne form)

**Hlavička:**
- BeerGlass (lg) + název + BJCP číslo + skupina (badge s group image)

**Sekce "Parametry":**
```
ABV:  4.0 – 5.4 %
IBU:  30 – 45
EBC:  7 – 14
OG:   11.2 – 13.8 °P
FG:   2.6 – 4.0 °P
SRM:  3.5 – 7.1 (referenční)
```

**Sekce "Charakteristika"** (zobrazit jen pole co mají obsah):
- Celkový dojem (impression)
- Vzhled (appearance)
- Aroma
- Chuť (flavor)
- Pocit v ústech (mouthfeel)
- Typické suroviny (ingredients)
- Historie (history)
- Komerční příklady (commercial_examples)
- Porovnání stylů (style_comparison)
- Původ (origin)
- Poznámky (comments)

**Akce:**
- Zpět na browser
- "Použít v receptuře" → navigace na novou recepturu s předvybraným stylem (nice-to-have)

### 2.5 Module structure

```
src/modules/beer-styles/
├── components/
│   ├── BeerStyleBrowser.tsx
│   └── BeerStyleDetail.tsx
├── config.ts
├── actions.ts
├── types.ts
└── index.ts
```

### 2.6 Pages

```
src/app/[locale]/(dashboard)/brewery/beer-styles/
├── page.tsx              → <BeerStyleBrowser />
└── [id]/
    └── page.tsx          → <BeerStyleDetail />
```

---

## ČÁST 3: I18N

### 3.1 Rozšířit `src/i18n/messages/cs/beer-styles.json`

Přidat (pokud chybí):

```json
{
  "title": "Pivní styly",
  "browser": {
    "search": "Hledat styl...",
    "noResults": "Žádné styly nenalezeny"
  },
  "quickFilters": {
    "all": "Vše"
  },
  "columns": {
    "glass": "",
    "bjcpNumber": "BJCP",
    "name": "Styl",
    "group": "Skupina",
    "abv": "ABV %",
    "ibu": "IBU",
    "ebc": "EBC",
    "og": "OG °P",
    "fg": "FG °P"
  },
  "detail": {
    "title": "Detail stylu",
    "parameters": "Parametry",
    "characteristics": "Charakteristika",
    "appearance": "Vzhled",
    "aroma": "Aroma",
    "flavor": "Chuť",
    "mouthfeel": "Pocit v ústech",
    "impression": "Celkový dojem",
    "ingredients": "Typické suroviny",
    "history": "Historie",
    "commercialExamples": "Komerční příklady",
    "styleComparison": "Porovnání stylů",
    "origin": "Původ",
    "comments": "Poznámky",
    "srmRange": "SRM (referenční)",
    "useInRecipe": "Použít v receptuře"
  },
  "ranges": {
    "abv": "{min}–{max} %",
    "ibu": "{min}–{max}",
    "ebc": "{min}–{max}",
    "og": "{min}–{max} °P",
    "fg": "{min}–{max} °P"
  }
}
```

EN verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### Reálné fotky na kartách
1. [ ] Recipe card view: zobrazuje obrázek skupiny (PNG) z beer_style_groups.image_url
2. [ ] Recipe card: fallback na BeerGlass pokud obrázek skupiny neexistuje
3. [ ] Recipe card: fallback na BeerGlass pokud receptura nemá beer_style
4. [ ] Batch card view: zobrazuje obrázek skupiny (chain přes recipe → style → group)
5. [ ] Dashboard karty várek: stejné obrázky jako batch cards
6. [ ] Beer style select/dropdown: stále používá BeerGlass SVG (ne fotky)
7. [ ] Next.js `<Image>` optimalizace na všech fotkách

### Beer Styles Browser
8. [ ] Route `/brewery/beer-styles` zobrazuje seznam stylů
9. [ ] List view: BeerGlass, BJCP číslo, název, skupina, ABV, IBU, EBC, OG
10. [ ] Quick filtry: generované dynamicky z beer_style_groups
11. [ ] Search: filtrování dle názvu a BJCP čísla
12. [ ] Card view: BeerGlass + parametry + skupina badge

### Beer Style Detail
13. [ ] Route `/brewery/beer-styles/[id]` zobrazuje readonly detail
14. [ ] Hlavička: BeerGlass + název + BJCP + skupina
15. [ ] Sekce Parametry: ABV, IBU, EBC, OG, FG, SRM ranges
16. [ ] Sekce Charakteristika: zobrazuje jen vyplněná pole
17. [ ] Celý formulář READONLY — žádná editace

### Navigace
18. [ ] Sidebar: "Pivní styly" pod Pivovar s ikonou
19. [ ] Klik na styl v browseru → navigace na detail
20. [ ] Zpět z detailu na browser

### Obecné
21. [ ] i18n: cs + en
22. [ ] `npm run build` bez chyb
23. [ ] TypeScript: zero errors

---

## CO NEIMPLEMENTOVAT

- **Editace stylů** — systémový číselník, readonly. Custom styly per tenant = post-MVP
- **"Použít v receptuře" akce** — nice-to-have, ne blokující
- **Složité filtry** (range sliders pro ABV/IBU/EBC) — quick filtry per group stačí pro MVP
