# RECIPE DESIGNER — UX VYLEPŠENÍ
## Průběžné zadání pro Claude Code | ProfiBrew.com
### Živý dokument — průběžně doplňovaný

---

## UX-01: Nová receptura — předvyplnění z primárního zařízení

**Problém:** Při založení nové receptury je varní soustava prázdná. Sládek musí manuálně vybrat.

**Řešení:**
- Při vytvoření nové receptury automaticky předvyplnit varní soustavu = primární zařízení primární provozovny (brewery)
- Z předvyplněné soustavy ihned načíst konstanty (efektivita, ztráty, teploty, objem)
- Předvyplnit batch_size z soustavy
- Sládek může kdykoli změnit na jinou soustavu

**Logika výběru default soustavy:**
1. Provozovna (brewery) má primární brewing_system (FK nebo `is_primary` flag)
2. Pokud nemá → první aktivní brewing_system tenantu
3. Pokud žádný neexistuje → DEFAULT_BREWING_SYSTEM (hardcoded defaults)

**Implementace:**
- `createRecipe()` server action → při INSERT nastavit `brewing_system_id` z default soustavy
- Na frontendu: po navigaci na `/brewery/recipes/new` ihned zobrazit načtené konstanty
- Posuvníky v Design sekci dostávají batch_size z předvyplněné soustavy

---

## UX-02: Změna varní soustavy — potvrzení a přepočet

**Problém:** Uživatel změní varní soustavu na existující receptuře. Konstanty a výpočty se musí aktualizovat, ale nemělo by se to dít bez vědomí uživatele.

**Řešení:** Konfirmační dialog:

```
┌──────────────────────────────────────────────┐
│  Změna varní soustavy                        │
│                                              │
│  Chcete aktualizovat konstanty a přepočítat  │
│  výpočty dle nové soustavy                   │
│  "{název nové soustavy}"?                    │
│                                              │
│  Tím se přepíšou ručně upravené konstanty.   │
│                                              │
│  [Ano, aktualizovat]  [Ne, jen změnit odkaz] │
└──────────────────────────────────────────────┘
```

**"Ano, aktualizovat":**
- Reset `constants_override` na NULL (smaže per-recipe overrides)
- Přepočítat pipeline, OG, IBU, potřebu sladu, vody
- Aktualizovat batch_size z nové soustavy (pokud uživatel nezměnil ručně)

**"Ne, jen změnit odkaz":**
- Jen FK na novou soustavu
- Konstanty zůstávají (per-recipe overrides zachovány)
- Výpočty se přepočítají s existujícími konstantami

---

## UX-03: Konfigurace SG vs. Plato

**Problém:** Čeští sládkové nemají jednotnou preferenci — někteří pracují v °Plato, jiní v Specific Gravity. Systém musí podporovat obojí.

**Řešení:** Nastavení na úrovni tenantu (brewery settings):

```
Primární jednotka stupňovitosti: [°Plato ▾ / Specific Gravity]
```

**Dopad na UI:**
- **Design posuvníky:** 
  - Plato mód: `OG ═══●═══ [12.0] °P` (sekundární zobrazení: `1.048 SG`)
  - SG mód: `OG ═══●═══ [1.048] SG` (sekundární zobrazení: `12.0 °P`)
- **FG posuvník:** analogicky
- **Range na posuvnících:** Track min/max dle zvoleného systému
  - Plato: OG 0–30, FG 0–15, step 0.1
  - SG: OG 1.000–1.125, FG 1.000–1.060, step 0.001
- **Style ranges na pozadí posuvníku:** konvertovat z BJCP (BJCP je v SG) do aktuálního systému
- **Sidebar, kalkulace tab, recipe browser:** všude zobrazovat v preferované jednotce

**Schema:**
```sql
-- Na tenants nebo brewery_settings tabulku
ALTER TABLE tenants ADD COLUMN gravity_unit TEXT DEFAULT 'plato'; -- 'plato' | 'sg'
```

**Konverze (stávající):**
```typescript
// Plato → SG
const sg = 1 + plato / (258.6 - 227.1 * (plato / 258.2));
// SG → Plato
const plato = -676.0671 + 1286.4878 * sg - 800.6171 * sg * sg + 190.1151 * sg * sg * sg;
```

**Interní uložení:** Vždy v °Plato (recipes.og, recipes.fg). Konverze jen na UI vrstvě.

**Helper:**
```typescript
function formatGravity(plato: number, unit: 'plato' | 'sg'): string {
  if (unit === 'sg') return platoToSG(plato).toFixed(3) + ' SG';
  return plato.toFixed(1) + ' °P';
}
```

---

## UX-04: Řazení chmelů — automatické dle fáze a času

**Problém:** Drag & drop řazení chmelů nedává smysl — sládek chce vidět chmele v pořadí procesu (mash → FWH → boil → whirlpool → dry hop), ne v libovolném pořadí.

**Řešení:** Automatické řazení, žádný drag & drop na hop tabu.

**Řadící logika:**

```typescript
const STAGE_ORDER: Record<string, number> = {
  mash: 1,
  fwh: 2,
  boil: 3,
  whirlpool: 4,
  dry_hop_warm: 5,
  dry_hop_cold: 6,
};

function sortHops(hops: RecipeItem[]): RecipeItem[] {
  return [...hops].sort((a, b) => {
    // 1. Podle fáze (procesní pořadí)
    const stageA = STAGE_ORDER[a.useStage ?? 'boil'] ?? 99;
    const stageB = STAGE_ORDER[b.useStage ?? 'boil'] ?? 99;
    if (stageA !== stageB) return stageA - stageB;

    // 2. V rámci stejné fáze: sestupně dle času (delší var = víc hořkosti = první)
    const timeA = a.useTimeMin ?? 0;
    const timeB = b.useTimeMin ?? 0;
    return timeB - timeA;  // sestupně: 60min před 15min před 5min
  });
}
```

**Vizuální separátory mezi fázemi:**

```
── Chmelovar ──────────────────
  Žatecký červeňák  300g  60min  24.5 IBU
  Žatecký červeňák  100g  15min   3.7 IBU

── Whirlpool (85°C) ──────────
  Citra             150g  20min   4.2 IBU

── Dry hop (studený) ─────────
  Citra             200g  5 dní   0.0 IBU
  Galaxy            200g  5 dní   0.0 IBU
```

**Drag & drop:** ZRUŠIT na hop tabu. Zachovat na malt tabu (tam řazení dává smysl — základní slad první, speciality pak).

---

## UX-05: Sbalená forma Design sekce — vizuálně výrazné hodnoty

**Problém:** Když je Design sekce sbalená (existující receptura), kompaktní řádek textu je špatně čitelný. Sládek potřebuje na první pohled vidět klíčové parametry piva.

**Aktuální stav (sbalený):**
```
▶ Design piva   Czech Premium Pale Lager | 100 L | OG 12.0 | IBU 35 | EBC 8 | ABV 5.2%
```

**Nový stav (sbalený) — vizuální kontejnery:**
```
▶ Design piva   Czech Premium Pale Lager

  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  100 L   │  │ 12.0 °P  │  │  3.3 °P  │  │  35 IBU  │  │  8 EBC   │  │ 5.2% ABV │
  │  objem   │  │    OG    │  │    FG    │  │  hořkost │  │  barva   │  │  alkohol │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Specifikace kontejnerů:**
- Inline flex layout, horizontálně vedle sebe
- Každý kontejner: `border rounded-lg px-4 py-2 text-center`
- Horní řádek: **hodnota** (font-semibold, text-lg)
- Spodní řádek: **label** (text-xs, text-muted-foreground)
- Barevné kódování dle target range stylu:
  - V rozsahu: `border-green-200 bg-green-50`
  - Mírně mimo: `border-amber-200 bg-amber-50`
  - Daleko mimo: `border-red-200 bg-red-50`
  - Bez stylu: `border-gray-200 bg-gray-50`
- ABV kontejner vždy neutrální (readonly, odvozená hodnota)
- EBC kontejner: levý okraj nebo spodní proužek v dynamické EBC barvě (`ebcToColor()`)
- Objem kontejner: vždy neutrální (není target range)

**Responsive:**
- Desktop (≥768px): 6 kontejnerů v řadě
- Mobil (<768px): 3+3 (dva řádky po třech)

---

## UX-06: Posuvník hustoty sladu v Design sekci

**Problém:** "Voda L/kg sladu" (water_per_kg_malt) je schovaná v Konstantách. Sládek ji ale nastavuje při designu receptu — ovlivňuje potřebu vody a tloušťku díla (mash thickness).

**Řešení:** Přidat posuvník na poslední místo v Design sekci (pod EBC, nad ABV readonly).

**Finální pořadí posuvníků v Design sekci:**
1. OG (°P / SG)
2. FG (°P / SG)
3. IBU
4. EBC + mini BeerGlass
5. **Voda / slad (L/kg)** ← NOVÝ
6. ABV (readonly)

**Specifikace posuvníku:**

```
Voda/slad  ═══════●══════════  [3.0] L/kg
           ░░░░▓▓▓▓▓▓▓▓░░░░░  2.5–4.0 (doporučený rozsah)
```

| Vlastnost | Hodnota |
|-----------|---------|
| Label | Voda / slad |
| Jednotka | L/kg |
| Track min | 1.5 |
| Track max | 6.0 |
| Step | 0.1 |
| Default | z brewing_system.water_per_kg_malt (typicky 3.0) |
| Doporučený rozsah (style range zone) | 2.5–4.0 (fix, nezávisí na stylu) |
| Sekundární zobrazení | "Tloušťka díla: {hodnota} L/kg" |

**Barevné kódování:**
- Zelená: 2.5–4.0 L/kg (standardní rozsah)
- Oranžová: 2.0–2.5 nebo 4.0–5.0 (nezvyklé ale funkční)
- Červená: < 2.0 nebo > 5.0 (extrémní)

**Uložení:**
- Hodnota z posuvníku → `constants_override.waterPerKgMalt` na receptuře
- Pokud se nezmění oproti brewing_system default → neuložit override (NULL)
- Při změně → okamžitý přepočet potřeby vody v sidebaru

**Vazba na UX-02:** Při změně varní soustavy s "Ano, aktualizovat" se reset i tento posuvník na hodnotu z nové soustavy.

**i18n:**
```json
{
  "designer": {
    "design": {
      "waterPerKgLabel": "Voda / slad",
      "waterPerKgUnit": "L/kg",
      "mashThickness": "Tloušťka díla: {value} L/kg",
      "waterPerKgRange": "doporučeno 2.5–4.0"
    }
  }
}
```

---

## UX-07: Dual BeerGlass na tabu Slady — target vs. calculated EBC

**Problém:** Sládek na tabu Slady nevidí vizuálně jak daleko je od cílové barvy. Čísla (EBC 14.2 vs cíl 8) jsou méně intuitivní než barva.

**Řešení:** Dva BeerGlass komponenty vedle sebe v sumárním řádku tabu Slady.

**Layout v sumárním řádku:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Celkem: 38.0 kg | Plán: 40.9 kg | Rozdíl: -2.9 kg 🔴         │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐             │
│  │   [BeerGlass ██]    │    │   [BeerGlass ████]   │             │
│  │      8 EBC          │    │     14.2 EBC         │             │
│  │      cíl            │    │     recept            │             │
│  └─────────────────────┘    └─────────────────────┘             │
│                                                                  │
│  Barva: 14.2 EBC | Cíl: 7–14 EBC ⚠️ mírně nad                 │
│  Extraktivita: 79.3%                                             │
└──────────────────────────────────────────────────────────────────┘
```

**Specifikace:**

| Prvek | Levý BeerGlass | Pravý BeerGlass |
|-------|----------------|-----------------|
| Label | "cíl" | "recept" |
| Hodnota | `target_ebc` z Design posuvníku | Calculated EBC z `calculateEBC()` |
| Barva | `ebcToColor(target_ebc)` | `ebcToColor(calculated_ebc)` |
| Velikost | `size="md"` (~48px) | `size="md"` (~48px) |
| Pod sklem | EBC číslo (bold) | EBC číslo (bold) |

**Dynamické barvení:** Použít stávající `ebcToColor()` s plynulou interpolací (16 referenčních bodů, implementováno v Claude Code). Obě sklenice se barvují nezávisle — sládek okamžitě vidí vizuální rozdíl.

**Real-time aktualizace:**
- Levý (cíl): mění se při posouvání EBC posuvníku v Design sekci
- Pravý (recept): mění se při přidání/odebrání/změně množství sladu (debounce 300ms)

**Stav shody:**
- Pokud `|target - calculated| ≤ 2 EBC` → oba sklenice vizuálně téměř stejné → ✅ pod nimi
- Pokud `|target - calculated| > 2 EBC` → viditelný rozdíl → ⚠️ nebo 🔴

---

## UX-08: BeerGlass v záhlaví — calculated EBC, ne target

**Problém:** BeerGlass v záhlaví (vlevo nahoře vedle názvu receptury) ukazuje target EBC z designu. Ale sládek chce vidět SKUTEČNOU barvu piva — tedy vypočítanou ze sladů.

**Aktuální stav:**
```
← [BeerGlass ██ target EBC]  Světlý ležák 12°P
```

**Nový stav:**
```
← [BeerGlass ██ calculated EBC]  Světlý ležák 12°P
```

**Logika:**
- BeerGlass v záhlaví = `ebcToColor(calculated_ebc)` z `calculateEBC(ingredients, batchSizeL)`
- Real-time: mění se při úpravě sladů (debounce 300ms)
- Pokud `calculated_ebc > 0` → normální dynamická barva

**Fallback — žádné slady / EBC nelze vypočítat:**

Pokud nejsou žádné slady v receptuře (nová receptura, nebo smazány všechny):
- BeerGlass zobrazit jako **prázdnou sklenici** se vzorem teček/šrafováním
- Barva výplně: `transparent` nebo velmi světlá šedá (`bg-gray-100`)
- Přes sklenici: pattern drobných teček (`●●●`) nebo diagonální šrafy
- Vizuálně jasné: "tady ještě není co zobrazit"

```
Stav                     Zobrazení
─────────────────────────────────────
Žádné slady              [BeerGlass ·····] prázdná s tečkami
EBC = 0 (jen adjunkty)   [BeerGlass ·····] prázdná s tečkami  
EBC > 0                  [BeerGlass ████]  plynulá barva
```

**Implementace:**
```typescript
// V záhlaví
<BeerGlass
  ebc={calculatedEbc > 0 ? calculatedEbc : undefined}
  placeholder={calculatedEbc <= 0}  // nová prop → tečkovaný pattern
  size="lg"
/>
```

**BeerGlass komponenta — nová prop `placeholder`:**
- `placeholder={false}` (default): normální chování, barva dle EBC
- `placeholder={true}`: SVG fill = pattern teček nebo diagonální čáry místo plné barvy

**Rozlišení od Design EBC posuvníku:**
- **Záhlaví BeerGlass** = calculated (ze sladů) ← tato změna
- **EBC posuvník mini BeerGlass** = target (z posuvníku) ← beze změny
- **Tab Slady dual BeerGlass** = target + calculated vedle sebe (UX-07)

---

## UX-09: Recipe karty (tiles) — levý border s dynamickou EBC barvou

**Problém:** V tiles zobrazení receptur jsou karty vizuálně uniformní. V Bubble prototypu má každá karta silný levý border v barvě odpovídající EBC receptury — sládek na první pohled rozliší světlý ležák od tmavého.

**Řešení:** Přidat levý border na recipe karty s dynamickou barvou dle calculated EBC.

**Vizuální specifikace:**

```
┌────────────────────────────┐
█                            │
█  [foto style group]        │
█                            │
█  Světlý ležák 12°P         │
█  Czech Premium Pale Lager  │
█                            │
█  OG 12.5  IBU 38  EBC 14  │
█  Objem 1000 L              │
└────────────────────────────┘
█ = levý border 4-6px, barva = ebcToColor(calculated_ebc)
```

**CSS:**
```typescript
// Na kartě v RecipeBrowser (tiles view)
<div
  className="rounded-lg border overflow-hidden"
  style={{
    borderLeftWidth: '5px',
    borderLeftColor: ebcToColor(recipe.ebc), // calculated EBC
  }}
>
```

**Fallback:**
- `ebc = 0` nebo `null` → border barva = `#d1d5db` (gray-300, neutrální)
- `ebc > 0` → dynamická barva z `ebcToColor()`

**Kde zobrazit:**
- ✅ Tiles/grid view v recipe browseru
- ✅ Recipe karty na dashboardu (pokud existují)
- ✅ Batch karty (pokud mají EBC z receptury)
- ❌ List view — tam nedává smysl (řádky, ne karty)

**Alternativní zobrazení — BeerGlass SVG místo fota (volitelné, nice-to-have):**

Pro případ že realistické foto neodpovídá barvě piva (např. Czech Pale Lager foto je světlé, ale receptura je 40 EBC):

Uživatelské nastavení (tenant-level, nice-to-have):
```
Zobrazení receptur: [Fotografie stylů ▾ / BeerGlass dynamický]
```

- **Fotografie stylů** (default): realistické foto z style_group + levý border EBC
- **BeerGlass dynamický**: SVG BeerGlass s plynulou EBC barvou (žádné foto)

Pro MVP: jen fotografie + levý border. BeerGlass alternativa post-MVP.

---

## UX-10: Pivní styly browser — dual BeerGlass min/max + foto + redesign sklenice

**Problém:** 
1. Tiles pivních stylů zobrazují jen jeden BeerGlass — styl ale definuje ROZSAH barev (min–max EBC)
2. Chybí realistické foto stylu
3. BeerGlass SVG vypadá jako hrnec s pokličkou, ne jako skutečný půllitr

### 10a: Dual BeerGlass — min a max EBC

**Aktuální stav:**
```
┌───────────────────┐
│   [BeerGlass ██]  │  ← jeden, s průměrnou barvou
│                   │
│ American Lager    │
```

**Nový stav:**
```
┌─────────────────────────────┐
│                             │
│  [foto style group]        │
│                             │
│  [Glass ░░]  →  [Glass ██] │
│   min EBC       max EBC    │
│    3.9           7.9       │
│                             │
│  American Lager             │
│  Ostatní ležáky             │
│                             │
│  ABV 4.2–5.3  IBU 8–18    │
│  EBC 3.9–7.9  OG 10–12.3  │
└─────────────────────────────┘
```

**Specifikace:**
- Dva BeerGlass `size="sm"` (~32px) vedle sebe
- Levý: `ebcToColor(style.ebc_min)` — nejsvětlejší varianta stylu
- Pravý: `ebcToColor(style.ebc_max)` — nejtmavší varianta stylu
- Mezi nimi: šipka `→` nebo gradient přechod
- Pod každým: hodnota EBC (menší text)
- Realistické foto style_group NAD sklenicemi (hlavní vizuál karty)

### 10b: Realistické foto

- Zdroj: `beer_style_groups.image_url` (implementováno v A3 patch)
- Foto jako hlavní vizuál karty (horní část)
- BeerGlass dual pod fotem (menší, doplňkový)
- Fallback (žádné foto): zobrazit jen dual BeerGlass ve větší velikosti

### 10c: Redesign BeerGlass SVG

**Aktuální problém:** BeerGlass vypadá jako válcový hrnec s plochým víkem (= pěna).

**Nový design — klasický český půllitr (tuplák):**

```svg
<!-- Koncept: klasický půllitr s uchem -->
<!--
  - Mírně se rozšiřující tělo (ne válec)
  - Ucho vpravo (charakteristický prvek)
  - Pěna nahoře: vlnitá/bublinkovitá (ne rovná čára)
  - Průhlednost: sklo efekt (lehký gradient/opacity)
  - Hladina piva: zaoblená meniskus
-->
```

**Varianty sklenice (nice-to-have, post-MVP):**

Různé styly piva se tradičně servírují v různých sklenicích:

| Styl | Sklenice |
|------|----------|
| Ležáky, Pilsner | Půllitr (tuplák) / Pilsner flétna |
| Wheat beer | Weizen sklenice (vysoká, úzká) |
| IPA, Pale Ale | Tulipán / US pint |
| Stout, Porter | Imperial pint / Tulipán |
| Belgian | Kalich (chalice) |

Pro MVP: **jeden univerzální design — moderní půllitr.** Post-MVP: per-style sklenice.

**Nový SVG — specifikace pro implementaci:**

```
Rozměry: viewBox="0 0 64 80" (poměr stran ~4:5)

Tělo sklenice:
- Tvar: lichoběžník, dole užší (~36px), nahoře širší (~44px)
- Zaoblené rohy (rx=4)
- Fill: EBC barva (dynamická)
- Opacity: 0.85 (efekt skla)
- Lehký vertikální gradient (světlejší uprostřed → simulace průhlednosti)

Ucho:
- Pravá strana, oblouk
- Stroke only (no fill), šedá/tmavě šedá
- Stroke-width: 2.5

Pěna:
- Horní část, bílá/krémová
- Spodní okraj pěny: vlnitá/oblá křivka (ne rovná)  
- 2-3 bublinky (malé kruhy, opacity 0.3)
- Výška pěny: ~15% celkové výšky

Hladina:
- Mezi pivem a pěnou: jemný přechod (ne ostrá hrana)

Okraj sklenice:
- Tenký horní okraj (stroke, 1px)
```

**Implementace:**
- Přepsat `BeerGlass.tsx` komponentu s novým SVG
- Zachovat API: `<BeerGlass ebc={14} size="sm|md|lg" placeholder={boolean} />`
- Velikosti: sm=32px, md=48px, lg=64px
- Dynamická barva: fill těla = `ebcToColor(ebc)`
- Placeholder mód (UX-08): tečkovaný pattern místo barvy

---

## UX-11: Slady — procentuální zadávání s posuvníky

**Problém:** Sládek musí ručně počítat kg každého sladu. Přitom receptury se typicky navrhují v poměrech (80% základní, 10% mnichovský, 5% karamel, 5% speciální). Při změně objemu nebo OG se musí ručně přepočítat všechny hodnoty.

**Řešení:** Dva režimy zadávání sladů — přepínatelné togglem.

### 11a: Toggle na tabu Slady

```
[ kg ]  [ % ]   ← segment toggle, horní lišta tabu Slady
```

- **kg mód** (stávající): inputy v kg, bez posuvníků, drag & drop řazení
- **% mód** (nový): posuvníky v %, kg se dopočítávají z `maltRequiredKg`

Výchozí mód: **%** pro novou recepturu, **kg** pro existující (pokud nemají uložené %)

### 11b: Základ pro výpočet kg z %

```
maltRequiredKg = calculateMaltRequired(targetOG, preBoilL, postBoilL, efficiency, extract)
```

= potřeba sladu z target OG (design posuvník). Tuto hodnotu už počítáme (brewing-calculations-reference.md).

```
slad_kg = maltRequiredKg × (slad_pct / 100)
```

### 11c: Automatické výchozí % při vkládání sladů

**1. slad:** 100%

**2. slad:** vloží se jako 30%, první klesne na 70%

**3.+ slad:** vloží se jako `Math.round(nejmenší_pct / 2)`, ta nejmenší klesne o polovinu

```typescript
function getDefaultPercentages(currentSlads: MaltEntry[], newIndex: number): number[] {
  if (currentSlads.length === 0) {
    // První slad
    return [100];
  }

  if (currentSlads.length === 1) {
    // Druhý slad: 70/30
    return [70, 30];
  }

  // 3+ slad: polovina nejmenší
  const percents = currentSlads.map(s => s.percent);
  const minPct = Math.min(...percents);
  const minIndex = percents.lastIndexOf(minPct); // poslední nejmenší

  const newPct = Math.max(1, Math.round(minPct / 2)); // minimum 1%
  const reducedMinPct = minPct - newPct;

  const result = percents.map((p, i) => i === minIndex ? reducedMinPct : p);
  result.push(newPct);

  return result;
}
```

**Příklad postupného vkládání:**

| Akce | Slad 1 | Slad 2 | Slad 3 | Slad 4 | Suma |
|------|--------|--------|--------|--------|------|
| Vložit 1. | 100% | | | | 100% |
| Vložit 2. | 70% | 30% | | | 100% |
| Vložit 3. | 70% | 15% | 15% | | 100% |
| Vložit 4. | 70% | 15% | 8% | 7% | 100% |

### 11d: Posuvník — proporcionální přerozdělení

Když uživatel posune posuvník jednoho sladu:

```typescript
function redistributePercentages(
  slads: MaltEntry[],
  changedIndex: number,
  newPercent: number
): number[] {
  const remaining = 100 - newPercent;

  // Suma % ostatních (bez změněného)
  const othersSum = slads.reduce(
    (sum, s, i) => i === changedIndex ? sum : sum + s.percent, 0
  );

  if (othersSum <= 0) {
    // Edge case: ostatní jsou na 0 → rozdělit rovnoměrně
    const otherCount = slads.length - 1;
    return slads.map((s, i) =>
      i === changedIndex ? newPercent : Math.round(remaining / otherCount)
    );
  }

  // Proporcionální přerozdělení: zachovat vzájemné poměry ostatních
  const result = slads.map((s, i) => {
    if (i === changedIndex) return newPercent;
    return Math.round((s.percent / othersSum) * remaining * 10) / 10;
  });

  // Korekce zaokrouhlení — přidat/odebrat zbytek k největší položce
  const sum = result.reduce((a, b) => a + b, 0);
  const diff = 100 - sum;
  if (diff !== 0) {
    const largestOtherIdx = result.reduce(
      (maxIdx, val, idx) => idx !== changedIndex && val > result[maxIdx] ? idx : maxIdx,
      changedIndex === 0 ? 1 : 0
    );
    result[largestOtherIdx] = Math.round((result[largestOtherIdx] + diff) * 10) / 10;
  }

  return result;
}
```

### 11e: UI — karta sladu v % módu

```
┌──────────────────────────────────────────────────┐
│ ⋮⋮  Slad plzeňský                           ✕   │
│                                                  │
│  ═══════════════════════●══════  [70.0] %        │
│                                                  │
│  = 28.0 kg  (z celkem 40.0 kg)   EBC: 3.5      │
└──────────────────────────────────────────────────┘
```

**Prvky karty (% mód):**
- Drag handle (⋮⋮) — zachovat pro ruční řazení
- Item select (výběr sladu)
- **Posuvník** (0–100%, step 0.5%)
- **Number input** (% hodnota, editovatelný, synchronizovaný s posuvníkem)
- **Dopočítané kg** (readonly text): `= {kg} kg (z celkem {maltRequiredKg} kg)`
- EBC (readonly, z item)
- ✕ pro odebrání

**Debounce:** Posuvník → přepočet % ostatních + přepočet kg → update feedback panel. Debounce 100ms (posuvník potřebuje být rychlý).

### 11f: UI — karta sladu v kg módu

Stávající chování beze změny:
```
┌──────────────────────────────────────────────────┐
│ ⋮⋮  Slad plzeňský                           ✕   │
│                                                  │
│  Množství: [28.0] kg    Podíl: 70.0%            │
│  EBC: 3.5   Extrakt: 80%                        │
└──────────────────────────────────────────────────┘
```

V kg módu: zobrazit **Podíl %** jako readonly informaci (dopočítaný z aktuálních kg).

### 11g: Sumární řádek (% mód)

```
Celkem: 100.0%  =  40.0 kg (plán dle target OG 12.0°P)
Barva: 14.2 EBC | Cíl: 7–14 EBC ⚠️

[BeerGlass cíl 8 EBC]  →  [BeerGlass recept 14.2 EBC]
```

### 11h: Edge cases

**Odebrání sladu v % módu:**
- Přerozdělit % odebraného proporcionálně mezi zbývající
- Příklad: odstraním 15% → zbývající 85% se proporcionálně nafouknout na 100%

**Posuvník na 0%:**
- Povoleno (slad zůstává v receptu, ale má 0 kg)
- Ostatní se proporcionálně přerozdělí na 100%

**Posuvník na 100%:**
- Ostatní klesnou na 0%
- Varování: "Všechny ostatní slady mají 0%"

**Přepnutí kg → %:**
- Dopočítat % z aktuálních kg: `pct = (slad_kg / suma_kg) × 100`
- Pokud suma_kg = 0 → rovnoměrné rozdělení

**Přepnutí % → kg:**
- Dopočítat kg z aktuálních %: `kg = maltRequiredKg × (pct / 100)`
- Uložit kg hodnoty do recipe_items.amount_g

**Změna target OG (design posuvník) v % módu:**
- `maltRequiredKg` se změní → kg hodnoty se automaticky přepočítají
- % zůstávají stejné
- Sládek vidí okamžitě nové kg

### 11i: Schema

Nový sloupec na recipe_items:

```sql
ALTER TABLE recipe_items ADD COLUMN percent NUMERIC;
```

Drizzle:
```typescript
percent: numeric("percent"),  // nullable — NULL = kg mód
```

Nový sloupec na recipes (preference módu):

```sql
ALTER TABLE recipes ADD COLUMN malt_input_mode TEXT DEFAULT 'percent';
```

```typescript
maltInputMode: text("malt_input_mode").default("percent"), // 'kg' | 'percent'
```

### 11j: Uložení

**% mód:**
- `recipe_items.percent` = hodnota z posuvníku
- `recipe_items.amount_g` = dopočítané kg (pro zpětnou kompatibilitu a kalkulace)
- `recipes.malt_input_mode` = 'percent'

**kg mód:**
- `recipe_items.percent` = NULL (nebo dopočítané informativně)
- `recipe_items.amount_g` = hodnota z inputu
- `recipes.malt_input_mode` = 'kg'

**Kalkulace:** Vždy pracuje s `amount_g` (kg) — % mód jen dopočítává kg před uložením.

### 11k: i18n

```json
{
  "designer": {
    "maltMode": {
      "kg": "kg",
      "percent": "%",
      "totalPlan": "Celkem: {pct}% = {kg} kg (plán dle target OG {og}°P)",
      "fromTotal": "= {kg} kg (z celkem {total} kg)",
      "allOthersZero": "Všechny ostatní slady mají 0%"
    }
  }
}
```

---

## UX-12: Rmutovací profily — oprava názvosloví + ramp time

### 12a: Problém

Aktuální model rmutovacího profilu neodpovídá realitě:
- `decoction` jako step_type je špatně — dekokce je METODA ohřevu, ne typ kroku
- Seed data modelují dekokci jako dva kroky (odběr + var) s nesmyslnými teplotami
- `rest` je příliš generický — chybí pojmenování konkrétních prodlev
- Chybí `ramp_time_min` na profilech (existuje jen v recipe_steps)
- Chybí krok `heat` pro infuzní/přímý ohřev

### 12b: Nový model kroku

Každý krok = "dosáhni cílové teploty (metodou X) + drž Y minut"

**Pole kroku:**

| Pole | Typ | Popis |
|------|-----|-------|
| `name` | text | Název kroku (volný text, např. "Bílkovinná prodleva") |
| `step_type` | enum | Typ: mash_in, rest, heat, decoction, mash_out |
| `target_temperature_c` | number | Cílová teplota kroku (°C) |
| `ramp_time_min` | number | **NOVÉ** — Náběh: čas na dosažení cílové teploty z předchozího kroku (min) |
| `hold_time_min` | number | Výdrž: čas na cílové teplotě (min). Přejmenovat z `time` |
| `notes` | text | Poznámka |

**Celkový čas kroku = ramp_time_min + hold_time_min**

### 12c: Nové step_type enum

| step_type | CS | EN | Popis |
|-----------|----|----|-------|
| `mash_in` | Zapáření | Mash-in | Zamíchání sladu s vodou. Ramp = čas míchání. |
| `rest` | Prodleva | Rest | Výdrž na teplotě. Ramp = 0 (teplota se nemění). |
| `heat` | Ohřev | Heat | Zvýšení teploty přímým ohřevem nebo infuzí horké vody. |
| `decoction` | Dekokce | Decoction | Zvýšení teploty dekokční metodou (odběr → var → návrat jako celek). |
| `mash_out` | Odrmutování | Mash-out | Finální ohřev na 76–78°C pro zastavení enzymů. |

**Zrušit z recipe_steps:** `boil`, `whirlpool`, `cooling` — tyto nepatří do rmutovacího profilu, jsou to fáze výroby (řeší se jinde).

### 12d: Typické prodlevy — nápověda/templates

Při přidávání kroku nabídnout rychlé šablony:

| Šablona | step_type | target_temp | hold_time | Poznámka |
|---------|-----------|-------------|-----------|----------|
| Kyselá prodleva | rest | 40 | 15 | Snížení pH, nedoporučeno bez testů |
| Beta-glukánová prodleva | rest | 40 | 20 | Pro pšeničný/ovesný slad, žitný slad |
| Bílkovinná prodleva | rest | 52 | 15 | Rozklad bílkovin, pěnivost |
| Maltózová prodleva | rest | 63 | 30 | Zkvasitelné cukry → suchší pivo |
| Sacharifikační prodleva | rest | 72 | 30 | Nezkvasitelné cukry → plnější tělo |
| Odrmutování | mash_out | 78 | 10 | Zastavení enzymové aktivity |

UI: dropdown/autocomplete při psaní názvu kroku → nabídne šablonu s předvyplněnou teplotou a časem.

### 12e: Aktualizované seed profily

**Infuze — 1 rmut:**

| # | Název | Typ | Cíl °C | Náběh | Výdrž |
|---|-------|-----|--------|-------|-------|
| 1 | Zapáření | mash_in | 62 | 5 | 5 |
| 2 | Maltózová prodleva | rest | 62 | 0 | 30 |
| 3 | Ohřev na sacharifikaci | heat | 72 | 10 | 0 |
| 4 | Sacharifikační prodleva | rest | 72 | 0 | 30 |
| 5 | Odrmutování | mash_out | 78 | 5 | 10 |

Celkem: 5+5+0+30+10+0+0+30+5+10 = **95 min**

**Infuze — 2 rmuty:**

| # | Název | Typ | Cíl °C | Náběh | Výdrž |
|---|-------|-----|--------|-------|-------|
| 1 | Zapáření | mash_in | 52 | 5 | 5 |
| 2 | Bílkovinná prodleva | rest | 52 | 0 | 15 |
| 3 | Ohřev na maltózu | heat | 62 | 10 | 0 |
| 4 | Maltózová prodleva | rest | 62 | 0 | 30 |
| 5 | Ohřev na sacharifikaci | heat | 72 | 10 | 0 |
| 6 | Sacharifikační prodleva | rest | 72 | 0 | 30 |
| 7 | Odrmutování | mash_out | 78 | 5 | 10 |

Celkem: **120 min**

**Dekokce — 1 rmut:**

| # | Název | Typ | Cíl °C | Náběh | Výdrž |
|---|-------|-----|--------|-------|-------|
| 1 | Zapáření | mash_in | 62 | 5 | 5 |
| 2 | Maltózová prodleva | rest | 62 | 0 | 20 |
| 3 | 1. dekokce | decoction | 72 | 25 | 0 |
| 4 | Sacharifikační prodleva | rest | 72 | 0 | 30 |
| 5 | Odrmutování | mash_out | 78 | 5 | 10 |

Celkem: **100 min**
Dekokce ramp 25 min = odběr (~3 min) + ohřev na 100°C (~7 min) + var (~10 min) + návrat a promíchání (~5 min)

**Dekokce — 2 rmuty:**

| # | Název | Typ | Cíl °C | Náběh | Výdrž |
|---|-------|-----|--------|-------|-------|
| 1 | Zapáření | mash_in | 52 | 5 | 5 |
| 2 | Bílkovinná prodleva | rest | 52 | 0 | 10 |
| 3 | 1. dekokce | decoction | 62 | 25 | 0 |
| 4 | Maltózová prodleva | rest | 62 | 0 | 20 |
| 5 | 2. dekokce | decoction | 72 | 25 | 0 |
| 6 | Sacharifikační prodleva | rest | 72 | 0 | 30 |
| 7 | Odrmutování | mash_out | 78 | 5 | 10 |

Celkem: **135 min**

### 12f: MashStep interface — aktualizace

```typescript
export type MashStepType = "mash_in" | "rest" | "heat" | "decoction" | "mash_out";

export interface MashStep {
  name: string;
  stepType: MashStepType;        // přejmenovat z 'type' na 'stepType' pro konzistenci
  targetTemperatureC: number;     // přejmenovat z 'temperature'
  rampTimeMin: number;            // NOVÉ — náběh (min)
  holdTimeMin: number;            // přejmenovat z 'time' — výdrž (min)
  notes?: string;
}
```

**Migrace stávajících profilů:**
- `type` → `stepType`
- `temperature` → `targetTemperatureC`
- `time` → `holdTimeMin`
- Přidat `rampTimeMin` — odhadnout z kontextu:
  - `mash_in` → rampTimeMin = 5
  - `rest` (stejná teplota jako předchozí) → rampTimeMin = 0
  - `rest` (vyšší teplota) → rampTimeMin = 10
  - `decoction` → rampTimeMin = 25
  - `mash_out` → rampTimeMin = 5
- Smazat staré dekokční odběr+var kroky, nahradit jedním dekokčním krokem

### 12g: Výpočet celkového času rmutování

```typescript
function calculateMashDuration(steps: MashStep[]): MashDuration {
  let totalRampMin = 0;
  let totalHoldMin = 0;

  for (const step of steps) {
    totalRampMin += step.rampTimeMin;
    totalHoldMin += step.holdTimeMin;
  }

  return {
    totalMin: totalRampMin + totalHoldMin,
    rampMin: totalRampMin,
    holdMin: totalHoldMin,
    formatted: formatMinutes(totalRampMin + totalHoldMin), // "2h 15min"
  };
}
```

Zobrazit v UI profilu:
```
Celkový čas rmutování: 2h 15min (náběhy: 65 min, prodlevy: 70 min)
```

Na receptuře v sidebar pipeline:
```
── Časový plán ──
Rmutování:    135 min  (2h 15min)
Var:           90 min
Whirlpool:     20 min
Chlazení:      30 min
Celkem:       275 min  (4h 35min)
```

### 12h: UI — aktualizace step editoru

**Tabulka kroků (profil i receptura):**

| # | Název | Typ | Cíl °C | Náběh (min) | Výdrž (min) | Celkem | Poznámka |
|---|-------|-----|--------|-------------|-------------|--------|----------|
| 1 | Zapáření | Zapáření ▾ | 52 | 5 | 5 | 10 | |
| 2 | Bílkovinná prodleva | Prodleva ▾ | 52 | 0 | 15 | 15 | |
| 3 | 1. dekokce | Dekokce ▾ | 62 | 25 | 0 | 25 | odběr+var+návrat |
| 4 | Maltózová prodleva | Prodleva ▾ | 62 | 0 | 20 | 20 | |
| **Σ** | | | | **30** | **40** | **70** | |

Sloupec "Celkem" = ramp + hold (readonly, computed).

**Select options pro Typ:**
```
Zapáření
Prodleva
Ohřev
Dekokce
Odrmutování
```

**Nápověda při výběru názvu:**
Při psaní do pole "Název" nabídnout autocomplete z typických prodlev (12d). Při výběru šablony předvyplnit teplotu a výdrž.

### 12i: i18n

```json
{
  "stepType": {
    "mash_in": "Zapáření",
    "rest": "Prodleva",
    "heat": "Ohřev",
    "decoction": "Dekokce",
    "mash_out": "Odrmutování"
  },
  "steps": {
    "title": "Kroky rmutování",
    "targetTemp": "Cíl (°C)",
    "rampTime": "Náběh (min)",
    "holdTime": "Výdrž (min)",
    "totalTime": "Celkem",
    "totalDuration": "Celkový čas rmutování",
    "rampTotal": "Náběhy",
    "holdTotal": "Prodlevy",
    "templates": {
      "acidRest": "Kyselá prodleva",
      "betaGlucanRest": "Beta-glukánová prodleva",
      "proteinRest": "Bílkovinná prodleva",
      "maltoseRest": "Maltózová prodleva",
      "saccharificationRest": "Sacharifikační prodleva",
      "mashOut": "Odrmutování"
    }
  }
}
```

EN:
```json
{
  "stepType": {
    "mash_in": "Mash-in",
    "rest": "Rest",
    "heat": "Heat",
    "decoction": "Decoction",
    "mash_out": "Mash-out"
  },
  "steps": {
    "targetTemp": "Target (°C)",
    "rampTime": "Ramp (min)",
    "holdTime": "Hold (min)",
    "totalTime": "Total",
    "totalDuration": "Total mash duration",
    "rampTotal": "Ramp time",
    "holdTotal": "Hold time",
    "templates": {
      "acidRest": "Acid rest",
      "betaGlucanRest": "Beta-glucan rest",
      "proteinRest": "Protein rest",
      "maltoseRest": "Maltose rest",
      "saccharificationRest": "Saccharification rest",
      "mashOut": "Mash-out"
    }
  }
}
```

### 12j: Schema migrace

**recipe_steps — odstranit non-mash typy:**

`boil`, `whirlpool`, `cooling` step_type se neodstraňují z DB, ale z rmutovacího profilu se nepoužívají. Pokud existují v recipe_steps, nechat (zpětná kompatibilita). V UI rmutovacího tabu filtrovat jen mash typy.

**mashing_profiles.steps JSONB — migrace:**

```sql
-- Aktualizovat JSONB strukturu ve všech profilech
-- Přejmenovat pole, přidat rampTimeMin
-- Toto je jednorázový migrační script
```

Prakticky: aktualizovat seed script + re-seed systémové profily s novými daty.

### 12k: Akceptační kritéria

1. [ ] MashStepType enum: mash_in, rest, heat, decoction, mash_out
2. [ ] MashStep interface: stepType, targetTemperatureC, rampTimeMin, holdTimeMin
3. [ ] Seed profily aktualizovány (4 profily s novým modelem)
4. [ ] Migrace stávajících JSONB dat v mashing_profiles
5. [ ] recipe_steps: ramp_time_min sloupec použit (existuje, jen nebyl v profilech)
6. [ ] Step editor: sloupec Náběh (min) + Výdrž (min) + Celkem
7. [ ] calculateMashDuration() — celkový čas rmutování
8. [ ] Celkový čas zobrazen v profilu i na receptuře
9. [ ] Autocomplete šablony prodlev při psaní názvu
10. [ ] i18n: cs + en (step types, templates, labels)
11. [ ] Odstranit step types boil/whirlpool/cooling z mash profilu UI
12. [ ] npm run build bez chyb

---

## UX-13: Systémové profily + Admin přístup (superadmin guard)

**Problém:** 
1. Systémové profily (tenant_id = NULL) jsou readonly — nelze editovat bez přístupu k DB
2. Middleware na `/admin` routes kontroluje jen přihlášení, **NE is_superadmin** — bezpečnostní díra

### 13a: Fix middleware — superadmin kontrola (KRITICKÉ)

**Aktuální stav** (`src/middleware.ts`):
```typescript
// NEBEZPEČNÉ — kdokoli přihlášený se dostane na /admin
if (routeGroup === "admin" && !user) {
  return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
}
```

**Požadovaný stav:**
```typescript
if (routeGroup === "admin") {
  if (!user) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }
  const isSuperadmin = await checkSuperadmin(user.id);
  if (!isSuperadmin) {
    // Tichý redirect, žádný error — normální uživatel neví že admin existuje
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }
}
```

**checkSuperadmin() implementace:**
```typescript
async function checkSuperadmin(userId: string): Promise<boolean> {
  // Query user_profiles.is_superadmin
  // Sloupec existuje v DB (Sprint 0 schema)
  const result = await db
    .select({ isSuperadmin: userProfiles.isSuperadmin })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  return result[0]?.isSuperadmin === true;
}
```

**Performance:** DB query na každý /admin request. Akceptovatelné — superadmin = 1 člověk, traffic na /admin minimální. Cache volitelně (revalidate 5 min).

### 13b: Kdo je superadmin

V produkci: **Jirka** (tvůj účet). Nastavení výhradně přes DB:
```sql
UPDATE user_profiles SET is_superadmin = true WHERE id = '<tvoje-user-id>';
```

Žádné UI pro přidávání superadminů — security. Vždy manuálně přes DB.

### 13c: Odkaz do Adminu v user menu

V avatar dropdown menu (pravý horní roh) přidat odkaz **pouze pokud `is_superadmin = true`**:

```
┌──────────────────────┐
│ Jiří Panec            │
│ jiri@profibrew.com    │
├──────────────────────┤
│ Můj profil            │
│ Nastavení             │
├──────────────────────┤
│ 🛡️ Admin panel        │  ← pouze superadmin
├──────────────────────┤
│ Odhlásit se           │
└──────────────────────┘
```

**Implementace:**
- `is_superadmin` načíst v TenantProvider / session context (jednou při loginu)
- V `UserMenu` komponentě: `{isSuperadmin && <MenuItem href="/admin" icon={Shield}>Admin panel</MenuItem>}`
- Ikona: `Shield` z lucide-react (nebo `ShieldCheck`)
- Vizuální odlišení: jemně jiná barva nebo separator nad/pod

**Kontext pro budoucí admin rozhraní:**
Admin panel bude postupně obsahovat:
- SaaS Monitor (KPI dashboard)
- Správa tenantů (CRUD, subscription, usage)
- Správa uživatelů (cross-tenant)
- Systémové browsery (rmutovací profily, pivní styly, jednotky, ...)
- Konfigurace plánů a ceníku
- Monitoring (errors, DB health)

Tyto moduly budou řešeny v samostatném sprintu. UX-13 řeší jen vstupní bránu (middleware guard + menu odkaz) a první admin agendu (systémové rmutovací profily).

### 13e: Admin sidebar — systémové browsery

Admin layout sidebar (existující placeholder `(admin)/layout.tsx`):

```
Admin panel
├── SaaS Monitor
├── Účty (tenants)
├── Správa uživatelů
├── Systémové browsery       ← SEKCE
│   ├── Rmutovací profily    ← NOVÉ
│   ├── Pivní styly          ← nice-to-have
│   └── ...
├── APIs
└── General SET
```

### 13d: Admin CRUD na systémové rmutovací profily

**Route:** `/admin/mashing-profiles` + `/admin/mashing-profiles/[id]`

UI = stejné jako tenant verze, ale:
- Zobrazuje POUZE systémové profily (tenant_id = NULL)
- Plná editace: název, kroky, typ, popis
- Přidání nového systémového profilu (tenant_id = NULL)
- Smazání systémového profilu (soft delete)
- Žádný "readonly" banner

**Server actions:**
```typescript
// Admin-guarded actions — kontrola is_superadmin místo withTenant()
export async function adminUpdateMashingProfile(id, data) {
  return withSuperadmin(async () => { ... });
}
export async function adminCreateMashingProfile(data) {
  return withSuperadmin(async () => {
    // INSERT s tenant_id = NULL
  });
}
```

**withSuperadmin() helper:**
```typescript
async function withSuperadmin<T>(action: () => Promise<T>): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ForbiddenError("Not authenticated");
  
  const isSuperadmin = await checkSuperadmin(user.id);
  if (!isSuperadmin) throw new ForbiddenError("Superadmin required");
  
  return action();
}
```

**Tenant UI** (`/brewery/mashing-profiles`) beze změny — systémové readonly + duplikace.

### 13e: Seed vs. admin-managed

- Seed vytvoří 4 počáteční profily (ON CONFLICT DO NOTHING)
- Admin přidává/edituje další přes UI
- Seed nepřepisuje admin úpravy

### 13f: Akceptační kritéria

1. [ ] Middleware: `/admin` routes kontrolují `is_superadmin` (ne jen přihlášení)
2. [ ] Non-superadmin na `/admin` → tichý redirect na `/dashboard`
3. [ ] `is_superadmin` flag dostupný v session/context (načten při loginu)
4. [ ] User menu: odkaz "Admin panel" viditelný pouze pro superadmin
5. [ ] `withSuperadmin()` helper pro admin server actions
6. [ ] Admin route `/admin/mashing-profiles` s plným CRUD
7. [ ] Server actions: `adminCreate/Update/DeleteMashingProfile()` s superadmin guard
8. [ ] Tenant UI beze změny (systémové readonly + duplikace)
9. [ ] Seed nepřepisuje existující systémové profily

---

## REJSTŘÍK ZMĚN

| ID | Popis | Status |
|----|-------|--------|
| UX-01 | Default varní soustava z provozovny | Zadáno |
| UX-02 | Konfirmace při změně soustavy | Zadáno |
| UX-03 | SG vs Plato konfigurace | Zadáno |
| UX-04 | Auto-řazení chmelů dle fáze+čas | Zadáno |
| UX-05 | Sbalený Design — vizuální kontejnery s hodnotami | Zadáno |
| UX-06 | Posuvník Voda/slad (L/kg) v Design sekci | Zadáno |
| UX-07 | Dual BeerGlass na tabu Slady — target vs calculated EBC | Zadáno |
| UX-08 | Záhlaví BeerGlass = calculated EBC ze sladů, ne target | Zadáno |
| UX-09 | Recipe karty — levý border s dynamickou EBC barvou | Zadáno |
| UX-10 | Beer styles tiles — dual BeerGlass min/max + foto + redesign SVG | Zadáno |
| UX-11 | Slady — procentuální zadávání s posuvníky + automatické výchozí % | Zadáno |
| UX-12 | Rmutovací profily — oprava názvosloví + ramp time + celkový čas | Zadáno |
| UX-13 | Systémové rmutovací profily — editovatelné adminem v aplikaci | Zadáno |

---

*Dokument průběžně doplňován. Každý UX item má vlastní ID pro referenci v dalších specifikacích.*
