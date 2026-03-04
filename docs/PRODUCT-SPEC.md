# PRODUCT-SPEC — Funkční specifikace
## ProfiBrew.com | Jak systém funguje
### Aktualizováno: 04.03.2026 | Poslední sprint: Sprint 7 Patch (Brew Lifecycle Opravy)

> **Tento dokument je živý.** Aktualizuje se po každém sprintu. Popisuje reálný stav systému — co funguje, jak to funguje, jaká jsou pravidla. Slouží jako source of truth pro vývoj i jako základ budoucí uživatelské dokumentace.

---

## KONVENCE DOKUMENTU

- ✅ **Implementováno** — funguje v produkci
- 🚧 **Rozpracováno** — částečně hotové
- 📋 **Specifikováno** — detailně popsáno, čeká na implementaci
- 💡 **Plánováno** — bude upřesněno v budoucím sprintu
- ~~Zrušeno~~ — původně plánováno, rozhodnuto jinak (s důvodem)

---

## 1. PŘIHLÁŠENÍ A REGISTRACE

### 1.1 Registrace 📋

**Flow:**
1. Uživatel zadá: název pivovaru, email, heslo
2. Systém vytvoří: tenant (status=trial) → user_profile → tenant_user (role=owner) → subscription (plan=Free, status=trialing, trial 14 dní)
3. Redirect na dashboard (v budoucnu onboarding wizard)

**Pravidla:**
- Email musí být unikátní
- Heslo: min 8 znaků
- Název pivovaru → automaticky generovaný slug (URL-safe)
- Jeden email = jeden uživatel, ale může být ve více tenantech (edge case, later)

**Onboarding wizard (Sprint 5):** 💡
- Krok 1: Základní info o pivovaru (typ, roční výstav)
- Krok 2: První provozovna
- Krok 3: Výrobní zařízení (tanky, varna)
- Krok 4: Konfigurace spotřební daně

### 1.2 Přihlášení 📋

- Email + heslo
- Po přihlášení: načtení tenant kontextu, redirect na dashboard
- Zapomenuté heslo: magic link přes Supabase (Sprint 6)

### 1.3 Uživatelské role 📋

| Role | Kdo to je | Co může |
|------|-----------|---------|
| owner | Majitel pivovaru | Vše + billing + nastavení tenantu |
| admin | Provozní manažer | Vše kromě billing |
| brewer | Sládek | Výroba, receptury, suroviny, sklad (čtení) |
| sales | Obchodník | Prodej, partneři, objednávky, sklad (čtení) |
| viewer | Účetní, konzultant | Pouze čtení všude kde má přístup |

Granulární práva: owner/admin mohou per uživatel nastavit přístup k modulům a agendám (user_module_rights, user_agenda_rights).

---

## 2. NAVIGACE A LAYOUT

### 2.1 Hlavní layout ✅

```
TopBar:  [Název pivovaru]  Pivovar | Sklad | Obchod | Finance | Plán    [🔔] [👤]
Sidebar: Agendy aktuálního modulu (collapsible)
Content: DataBrowser / DetailView / Dashboard
```

**TopBar:**
- Module tabs: přepínají sidebar agendy a obsah
- Moduly mimo subscription: šedé s 🔒, klik → upsell prompt
- User menu: profil, nastavení, odhlásit

**Sidebar:**
- Collapse/expand (« tlačítko), stav se pamatuje per user
- Collapsed = pouze ikony
- Aktivní agenda zvýrazněna
- Logo ProfiBrew dole

### 2.2 Moduly a agendy ✅

**Pivovar:**
Přehled, Partneři, Kontakty, Suroviny, Receptury, Vary, Varní soustavy, Tanky

**Sklad:**
Položky (katalog), Skladové pohyby, Tracking, Daňové pohyby, Měsíční podání

**Obchod:**
Objednávky

**Finance:**
Cash Flow, Pokladna

**Plán:** 💡 (Fáze 2)

**Nastavení** (vždy dostupné):
Obecné, Provozovny, Uživatelé, Číslovací řady, Zálohy, Kategorie CF, Pokladny, Billing

---

## 3. DATABROWSER — UNIVERZÁLNÍ PROHLÍŽEČ DAT

### 3.1 Obecné chování ✅

DataBrowser je hlavní komponenta pro zobrazení seznamu záznamů. Používá se na každé agendě. Konfigurace per agenda definuje sloupce, filtry, akce.

**Dva režimy zobrazení:**
- **List View** (≡) — tabulka s řazením, checkboxy pro bulk select
- **Card View** (⊞) — dlaždice s obrázkem, titulem, badgy, metrikami

**Toolbar:**
- Tlačítko "+ Nový záznam" (dle oprávnění)
- Přepínač view mode (list/card)
- Tlačítko filtrů (otevře parametrický panel)
- Dropdown uložených pohledů
- Vyhledávací pole
- Řazení (dropdown + směr)

**Quick filters:** Horizontální taby pod toolbarem (Vše | Zákazníci | Dodavatelé). Klik přepne filtr, aktivní tab zvýrazněn.

**Parametrický filtr panel:** Vysuvný z levé strany (Sheet). Dynamicky generované filtry dle konfigurace. "Použít" a "Vymazat" tlačítka.

**Active filter chips:** Pod quick filtry, zobrazí aktivní filtry s ✕ pro odebrání. "Vymazat vše" link.

**Pagination:** Dole — celkem položek, výběr počtu na stránku (15/25/50/100), navigace stránek.

**Bulk akce:** Sticky bar dole pokud vybrány záznamy (checkbox). Akce: Export, Smazat, Změnit status.

**URL state:** Všechny parametry (view, page, sort, filters, search) v URL query params → shareable links, browser back funguje.

### 3.2 Saved Views (Uložené pohledy) 📋

- Uživatel může uložit aktuální stav browseru (filtry, sort, view mode, sloupce) jako pojmenovaný pohled
- Shared pohledy viditelné všem v tenantu
- Osobní pohledy jen pro daného uživatele
- Default pohled = výchozí při otevření agendy

### 3.3 Konfigurace per agenda ✅

Každá agenda má konfigurační soubor v `src/config/modules/` definující:
- Sloupce (list view)
- Card layout (card view)
- Quick filters
- Parametrické filtry
- Defaultní řazení
- Povolené akce
- Oprávnění

---

## 4. MODUL PIVOVAR

### 4.1 Partneři ✅

**Co to je:** Evidence obchodních partnerů — zákazníků i dodavatelů v jedné agendě.

**Jak to funguje:**
- Partner má flagy `is_customer` a `is_supplier` — může být obojí
- Právnická nebo fyzická osoba
- IČO s možností automatického stažení údajů z ARES
- Quick filters: Vše | Zákazníci | Dodavatelé

**Detail partnera (taby):**
- Základní info: název, IČO, DIČ, právní forma, primární adresa
- Kontakty: seznam kontaktních osob (jméno, pozice, email, telefon)
- Bankovní účty: číslo účtu, IBAN, SWIFT
- Adresy: fakturační, dodací, provozovny (více adres)
- Obchodní podmínky: splatnost, ceník (Fáze 2), kredit limit
- Doklady: vazba na objednávky a skladové doklady (read-only přehled)
- Přílohy: soubory (smlouvy, certifikáty)

**Byznys pravidla:**
- Smazání partnera = soft delete (is_active=false), pokud nemá aktivní objednávky/doklady
- ARES integrace: po zadání IČO nabídne "Aktualizovat z ARES" → stáhne název, adresu, právní formu
- DIČ validace formátu (CZxxxxxxxx)

### 4.2 Kontakty ✅

**Co to je:** Přehled všech kontaktních osob napříč partnery.

**Jak to funguje:**
- Samostatná agenda = flat list kontaktů
- Klik na kontakt → otevře detail partnera na tabu Kontakty
- Quick filters: Vše (případně dle partnera)

### 4.3 Suroviny (pohled na Items) ✅

**Co to je:** Filtrovaný pohled na položky kde `is_brew_material = true`.

**Jak to funguje:**
- DataBrowser s baseFilter `{ is_brew_material: true }`
- Quick filters: Vše | Slady a přísady (malt + fermentable) | Chmel | Kvasnice
- Card view: obrázek suroviny, typ (Slad/Chmel/...), název, cena, alpha (u chmele)
- List view: kód, název, cena, surovina (checkbox), prodejní (checkbox), alpha, výrobce, z knihovny

**Detail suroviny:**
- Základní info: kód, název, značka/výrobce
- Flagy: Surovina na výrobu piva ✓, Položka pro evidenci výroby ☐, Prodávat položku ✓
- Kategorie skladu, spotřební daň (toggle), mód výdeje (FIFO / Ruční výběr šarže)
- Material-specific: typ suroviny (dropdown: slad/chmel/kvasnice/zkvasitelná přísada/ostatní), alpha (chmel), EBC (slad + fermentable), výtěžnost (slad + fermentable)
- Typ zkvasitelné suroviny (`fermentable_type`): select viditelný pro slad + zkvasitelnou přísadu — grain/adjunct_grain/sugar/honey/dry_extract/liquid_extract. Systémový číselník `fermentable_types` s default_extract. Výchozí: grain pro slad, sugar pro fermentable.
- Forma chmele (`hop_form`): select viditelný pouze pro chmel — pellet/leaf/plug/cryo. Ovlivňuje IBU výpočet (utilization_factor: pellet=1.10, leaf=1.00, plug=1.02, cryo=1.10). Výchozí: pellet.
- Forma kvasnic (`yeast_form`): select viditelný pouze pro kvasnice — dry/liquid. Při změně formy auto-switch MJ (dry→g, liquid→ml). Výchozí: dry. V receptuře zobrazeno jako badge na YeastCard.
- Měrná jednotka (MJ sklad): select z povolených MJ dle typu suroviny (slad=kg readonly, chmel=kg/g, kvasnice=g/kg/ml/l/ks, fermentable=kg/g/l/ml)
- Měrná jednotka receptury (MJ receptury): viditelné pouze pro chmel — odlišná MJ pro skladovou evidenci (kg) vs recepturu (g)
- Auto-fill MJ při změně typu suroviny (malt→kg, hop→kg+g, yeast→g, fermentable→kg). Kvasnice: forma navíc ovlivňuje výchozí MJ (dry→g, liquid→ml).
- Cenotvorba: kalkulační cena, průměrná skladová, prodejní cena, režie
- Cenotvorba balených položek (viditelná pouze pro sale item s base_item): náklady na obal (`packaging_cost`), náklady na stočení (`filling_cost`), kalkulovaná cena = `(výrobní_cena_za_litr × objem) + obal + stočení`
- POS: zpřístupnit na pokladně, nabízet na webu
- Barva položky, kategorie, poznámka
- Tab přílohy: obrázky, datasheets

**Byznys pravidla:**
- Kód položky generován automaticky z číslovací řady (it00001)
- Průměrná skladová cena se přepočítává automaticky ze skladových pohybů
- Import z knihovny: zkopíruje údaje do vlastní položky, označí `is_from_library=true`

### 4.4 Receptury ✅

**Co to je:** Definice složení a výrobního postupu piva.

**Jak to funguje:**
- DataBrowser: seznam receptur (název, styl, status, OG, IBU, EBC, cena várky)
- Status: draft → active → archived

**Recipe Designer (Sprint 7):**
UI receptury je třísekční designer s aktivními designovými slidery a real-time zpětnou vazbou:

**Sekce 1 — Návrh piva (RecipeDesignSection):**
- Název + status + pivní styl (select) + batch size (input) — hlavní designové parametry
- 5 aktivních DesignSliderů: OG (°P), FG (°P), IBU, EBC, Water/malt (L/kg) — sládek nejprve NAVRHNE cílové parametry piva
- Každý slider: vizualizace rozsahu pivního stylu (zelená zóna), barevný thumb (zelená = v rozsahu, oranžová = mírně mimo, červená = daleko), marker ▲ pro kalkulovanou hodnotu
- ABV readonly výpočet (Balling formule), SG konverze pro OG/FG
- Výběr stylu → auto midpoint: při výběru stylu se slidery nastaví na střed rozsahu (pokud jsou na 0)
- Collapsed view: vizuální MetricBoxy (OG/FG/IBU/EBC/ABV) s barevným kódováním dle rozsahu stylu (zelená/oranžová/červená)
- BeerGlass vizualizace: "tuplák" SVG s barvou dle EBC — header priorita: kalkulované EBC → target → midpoint stylu; placeholder pro prázdné

**Sekce 2 — Výroba (RecipeExecutionSection):**
- Kolabovatelný panel s výrobními parametry (kód, varní soustava, rmutovací profil, výrobní položka, čas varu, kvašení, dokvašování, trvanlivost)
- Nová receptura automaticky předvyplní primární varní soustavu
- Změna soustavy na existující receptuře → potvrzovací dialog (aktualizovat konstanty vs. jen změnit odkaz)
- V kolapsnutém stavu: jednořádkový souhrn "{název} | {soustava}"

**Sekce 3 — Editor (RecipeEditor) s 7 sub-taby:**
- **Zkvasitelné suroviny (Fermentables):** drag & drop kartičky (MaltCard) — toggle kg/% mód. V % módu: posuvníky s proporcionálním přerozdělením, auto výchozí % při vkládání (100→70/30→split). Dual BeerGlass (cíl vs. recept). Souhrn: celkem vs plán, surplus/deficit. Zobrazuje malt + fermentable kategorie.
- **Chmel:** Auto-sort dle fáze (rmut→FWH→var→whirlpool→dry hop) a času, vizuální separátory. HopCard — množství, alpha, fáze, čas, IBU příspěvek. Souhrn: IBU breakdown.
- **Kvasnice:** YeastCard — množství, odhad FG/ABV.
- **Ostatní (Other):** OtherCard — množství, fáze, čas, poznámka. Fáze: mash/boil/whirlpool/fermentation/conditioning/bottling.
- **Rmutování:** wrapper kolem RecipeStepsTab (rmutovací kroky + profily). MashStepEditor se sloupci: Cíl (°C), Náběh (min), Výdrž (min), Celkem. Sumární patička s celkovými časy.
- **Konstanty:** override tabulka (parametr / soustava / receptura) — per-recipe přepsání parametrů varní soustavy. Reset tlačítko.
- **Kalkulace:** wrapper kolem RecipeCalculation (pipeline, potřeba surovin, náklady).

**Real-time zpětná vazba:**
- `RecipeFeedbackSidebar` — dvousloupcová tabulka "Design vs Reality" (xl+ obrazovky): porovnání cílových (design) a kalkulovaných (reality) hodnot OG, FG, ABV, IBU, EBC se stavovými ikonami (✅ ≤5%, ⚠️ ≤15%, ❌ >15%) + sekce Slad, Pipeline, Voda, Náklady
- Výpočty běží client-side přes `calculateAll()` — okamžitá zpětná vazba bez server roundtrip
- Sémantická změna: `og`, `fg` v DB jsou nyní cílové hodnoty ze sliderů (ne kalkulované). `target_ibu`, `target_ebc` pro IBU/EBC targety.

**Constants override (JSONB `constants_override`):**
- Receptura může přepsat 8 parametrů varní soustavy: efektivita, ztráty (kotel, whirlpool, fermentace), extrakt sladu, voda/kg, rezerva vody, čas varu
- Override se merguje: recipe override → system defaults → DEFAULT_BREWING_SYSTEM fallback
- Duplikace receptury kopíruje constants override

**Kalkulace — varní soustava a objemová pipeline:**
- Vazba receptury na varní soustavu: `recipes.brewing_system_id` → `brewing_systems.id` (nullable, select na tabu Základní údaje)
- Efektivita varny z brewing system (ne hardcoded 75%) — ovlivňuje výpočet OG. **Stage-based efficiency**: `useStage === "mash"` → × efficiency, cokoliv jiného (boil, fermentation, conditioning, bottling) → × 1.0 (100% rozpuštění). Toto zajišťuje správný OG výpočet pro cukr/med/DME přidávané přímo do varu.
- Kategorie surovin: `malt` (slady) + `fermentable` (zkvasitelné přísady: cukr, med, DME, LME) + `other` (nezkvasitelné: Irish moss, koření). Kategorie `adjunct` eliminována.
- Objemová pipeline (zpětný výpočet od cílového objemu): pre-boil → post-boil → do fermentoru → hotové pivo
- Ztráty v litrech: kotel (kettle_loss_pct), whirlpool (whirlpool_loss_pct), fermentace (fermentation_loss_pct)
- Výpočet potřeby sladu: extract_needed / extract_estimate / efficiency → kg sladu
- Výpočet potřeby vody: maltKg × water_per_kg_malt + water_reserve
- Fallback: pokud varní soustava není nastavena → výchozí parametry (75% efektivita, 10/5/5% ztráty)
- UI: sekce "Objemová pipeline" a "Potřeba surovin" na tabu Kalkulace (nad nákladovou kalkulací)

**Kalkulace — overhead a cenotvorba surovin:**
- Zdroj cen surovin dle `ingredient_pricing_mode` z nastavení provozovny: `calc_price` (kalkulační cena z items), `avg_stock` (průměrná skladová z items.avgPrice), `last_purchase` (poslední nákupní cena z potvrzených příjemek)
- Fallback: pokud resolved cena je null → items.costPrice
- Overhead z nastavení provozovny: režie suroviny (%), náklady var (CZK), režie (CZK)
- Výpočet: `totalProductionCost = ingredientsCost + ingredientsCost×overheadPct/100 + brewCostCzk + overheadCzk`
- `recipes.costPrice` = totalProductionCost (celková výrobní cena, ne jen suroviny)
- UI: tabulka surovin + footer s breakdown (suroviny celkem, režie %, náklady var, režie, výrobní cena, cena/L, zdroj cen)
- Graceful fallback: staré snapshoty bez overhead dat zobrazí pouze celkovou cenu (bez breakdown)

**Byznys pravidla:**
- Receptura se dá duplikovat (nová kopie, status=draft, včetně `item_id` a `brewing_system_id`)
- Vazba na výrobní položku: `recipes.item_id` → `items.id` (nullable). Při vytvoření várky se `item_id` kopíruje na `batch.item_id` (pokud batch nemá vlastní).
- Při vytvoření várky se receptura zkopíruje jako snapshot (status=`batch_snapshot`, `source_recipe_id`=originál). Snapshot zahrnuje kompletní kopii receptury včetně všech surovin (recipe_items), kroků (recipe_steps) a `item_id`.
- Snapshoty se nezobrazují v RecipeBrowseru (filtrováno dle status ≠ batch_snapshot)
- Detail šarže na tabu Suroviny zobrazuje badge s odkazem na originální recepturu
- Smazání originální receptury ponechá snapshot beze změny (ON DELETE SET NULL na source_recipe_id)
- Kalkulace se ukládá jako snapshot (recipe_calculations) — historie kalkulací

### 4.5 Vary / Šarže ✅

**Co to je:** Evidence výrobních šarží piva od vaření po stáčení. Řízení vaření (Brew Management) provází sládka celým výrobním procesem v 7 fázích.

**Jak to funguje:**
- DataBrowser: seznam várek (číslo, název piva, datum, stav, tank, OG, objem)
- Vytvoření: vybrat recepturu → systém vytvoří snapshot receptury (kopie recipe + recipe_items + recipe_steps, status=`batch_snapshot`) a naváže ho na šarži
- Z detailu šarže odkaz "Řízení varu" → otevře Brew Management UI

**Status workflow (7 fází):**
```
plan → preparation → brewing → fermentation → conditioning → packaging → completed
```
Přechody fází jsou řízeny mapou `PHASE_TRANSITIONS` — každá fáze má definované povolené cílové fáze. Historie přechodů se ukládá jako `phaseHistory` (JSONB) na záznamu šarže s timestampy.

**Detail šarže (taby):**
- Přehled: číslo várky, recept, pivo (item), stav, datum vaření, tank, sládek
- Kroky vaření: tabulka kroků z receptury, u každého plánovaný vs skutečný start/konec, teploty. Krok se "odškrtává" v průběhu vaření.
- Měření: seznam měření (typ, hodnota, °P, SG, teplota, timestamp). Graf vývoje.
- Suroviny: spotřebované suroviny s lot tracking vazbou. Tlačítko "Vydat suroviny" → vytvoří draft výdejku z receptury → naviguje na detail výdejky (sládek zkontroluje, upraví, vybere šarže, potvrdí).
- Stáčení: řízeno `stock_mode` z nastavení provozovny (shop settings).
  - **bulk**: 1 řádek = výrobní položka (batch.item_id), MJ=L, decimal input, předvyplněný z actual_volume_l
  - **packaged**: N řádků = child items (`base_item_id = batch.item_id`), integer input (ks), objem dopočten. Rozšířené sloupce: Pivo (beer×objem), Obal (packaging_cost), Stočení (filling_cost), Cena/ks, Celkem. Celková hodnota v sumáři.
  - **none**: hláška "Naskladnění vypnuto" s odkazem na nastavení provozovny, žádné řádky
  - Datum stáčení (date picker, default: dnes). Ukládá se na batch.bottled_date; propaguje se do příjemky jako datum dokladu.
  - Výrobní cena: readonly zobrazení Kč/L + pricing mode (kalkulační cena / z receptury). Zdroj: shop settings `beer_pricing_mode` (fixed → items.costPrice, recipe_calc → recipe.costPrice/batchSizeL).
  - Datum expirace: computed (bottledDate + recipe.shelfLifeDays), readonly zobrazení.
  - Sumář: stočeno celkem, objem z receptury, objem z tanku, rozdíl (barevně). Tlačítko "Uložit stáčení" → atomicky uloží bottling_items + bottled_date + vypočte `packaging_loss_l`.
  - Tlačítko "Naskladnit" → confirm dialog → `createProductionReceipt()` → příjemka vytvořena + potvrzena. Info box s kódem příjemky a odkazem.
  - Příjemka obsahuje na řádcích: lot_number (z batch), expiry_date (bottledDate + shelfLifeDays), unit_price (dle pricing mode). Pro packaged: unit_price = `beer_cost_per_liter × base_item_quantity + packaging_cost + filling_cost` (per-item pricing).
  - Po naskladnění: "Uložit" disabled (tooltip: "Stornujte příjemku"), "Naskladnit" skryté, místo něj info box.
- Spotřební daň: evidované hl, status nahlášení
- Poznámky: ke krokům i celé šarži

#### 4.5a Řízení vaření (Brew Management) ✅

**Co to je:** Průvodce výrobním procesem šarže v 7 fázích. Sládek prochází celým lifecycle od plánování po dokončení s kontextovým postranním panelem.

**Route:** `/brewery/batches/[id]/brew` — sdílený layout `BatchBrewShell` + 7 fázových stránek.

**Společné prvky:**
- `BatchBrewShell` — layout wrapper: hlavička s číslem várky, šarží, provozovnou a názvem piva, fázová lišta, postranní panel
- `BatchPhaseBar` — 7-krokový stepper vizuálně zobrazující aktuální pozici v procesu. Navigace mezi fázemi s validací povolených přechodů.
- `BrewSidebar` — 7 kontextových panelů:
  1. **Recept** — Brewfather-style: key-value grid (OG/FG/ABV/IBU/EBC/Volume), rmutovací profil s teplotami, suroviny s % (slady), chmel s časem přidání, EBC barevná tečka
  2. **Objemy** — plánované vs skutečné objemy v průběhu procesu
  3. **Měření** — seznam všech měření šarže s hodnotami
  4. **Poznámky** — poznámky ke krokům i celé šarži
  5. **Porovnání** — recept vs skutečnost (design vs reality)
  6. **Lot tracking** — vstupní loty (suroviny) + výstupní loty (hotové pivo)
  7. **Spotřební daň** — plánovaná/aktuální daň, pohyby

**F1 Plán (PlanPhase):**
- 3-sloupcový layout: náhled receptury | plánování (datum vaření, fermentace dny, dokvašování dny) | výběr nádoby
- Server action `getAvailableVessels` — seznam dostupných tanků/fermentorů, filtrovaných dle provozovny (shopId) a timeline dostupnosti (žádný overlap s jinými várkami)
- Server action `updateBatchPlanData` — uložení plánovacích dat
- Odhad celkového času varu (suma brewing system stages + rmutovací profil) s předpokládaným koncem
- CKT tanky dostupné ve výběru nádob; autofill ležení při výběru CKT pro kvašení

**F2 Příprava (PrepPhase):**
- Kontrola skladu surovin — porovnání potřebného vs dostupného množství, sloupec "Skladem" s barevným zvýrazněním nedostatku
- Výpočty vody (objem, teplota)
- Timeline kroků vaření s časy začátku/konce (příprava → rmut → scezování → chmelovar → whirlpool → transfer → úklid), odvozeno od `planned_start`
- Inline poznámky — textarea pro přidání poznámky + chronologický seznam existujících poznámek
- Výdej materiálu — napojení na existující material issue flow; částečný/opakovaný výdej (tlačítko "Vydat zbývající"), badge "Suroviny vydány částečně"
- Sloučení duplicitních řádků surovin dle item_id s rounding (max 3 des. místa)

**F3 Vaření (BrewingPhase):**
- Tabulka kroků s editovatelnými skutečnými časy (plánovaný vs skutečný start/konec)
- Odpočítávání chmelení (hop countdown timer) — z `hopAdditions` JSONB na batch_steps
- 3 stopky (stopwatches) pro měření času kroků
- Měření v průběhu vaření (teplota, SG, pH)
- Dialog přechodu fáze s potvrzením

**F4 Kvašení (FermentationPhase):**
- Sdílená komponenta `FermentCondPhase` konfigurovaná pro kvašení
- Info o nádobě (tank, objem, typ)
- Progress bar (aktuální den / plánované dny kvašení)
- CRUD měření (SG, teplota, pH, poznámky)
- Přechod na další fázi (conditioning)

**F5 Dokvašování (ConditioningPhase):**
- Sdílená komponenta `FermentCondPhase` konfigurovaná pro dokvašování
- Stejná funkčnost jako F4, jiné parametry (conditioningDays)

**F6 Stáčení (PackagingPhase):**
- Embedding existujícího `BatchBottlingTab` (viz detail šarže výše)
- Tlačítko "Dokončit šarži" — přechod do stavu completed

**F7 Dokončeno (CompletedPhase):**
- Porovnání receptura vs skutečnost — tabulka cílových vs naměřených hodnot
- Navržené úpravy konstant varní soustavy (na základě odchylek)
- Finance placeholder (pro budoucí napojení na kalkulaci výrobních nákladů)

**DB rozšíření (migrace 0021):**
- `batches`: `current_phase` (text), `phase_history` (JSONB), `brew_mode` (text), `fermentation_days` (int), `conditioning_days` (int)
- `batch_steps`: `step_source` (text), `ramp_time_min` (int), `hop_additions` (JSONB), `actual_duration_min` (int), `notes` (text)
- `batch_measurements`: `phase` (text), `volume_l` (decimal)
- Nová tabulka `batch_lot_tracking`: vstupní/výstupní lot záznamy pro traceability

**Byznys pravidla:**
- Číslo várky z číslovací řady (V-2026-001)
- Číslo šarže (lot_number): auto-generováno z batch_number bez pomlček, editovatelné na overview tabu
- Šarže vždy patří k jednomu tanku/zařízení (equipment)
- Naskladnění piva je **explicitní akce** — sládek klikne "Naskladnit" na tabu Stáčení. NENÍ automatické při dokončení várky.
- `createProductionReceipt()` čte z bottling_items, vytváří příjemku (receipt, production_in) a rovnou potvrzuje.
- Příjemka z výroby: lot_number z batch, expiry_date = bottled_date + shelf_life_days, unit_price dle beer_pricing_mode
- Warehouse pro příjemku: `shop.settings.default_warehouse_beer_id` → fallback na první aktivní
- Při spotřebě surovin se vytvoří skladový výdej
- Excise: objem se eviduje v hl, systém sleduje status nahlášení
- Dokončení várky: warning pokud příjemka neexistuje (non-blocking confirm dialog), user může dokončit i bez naskladnění
- `packaging_loss_l` = actual_volume_l − SUM(qty × base_item_quantity); kladné = ztráta, záporné = přebytek
- Přechody fází validovány mapou `PHASE_TRANSITIONS` — nelze přeskočit fáze
- Phase history audit trail — každý přechod se zaloguje s timestamp do `phaseHistory` JSONB
- Lot tracking: vstupní suroviny (ze stock issue) i výstupní produkty (z příjemky) evidovány v `batch_lot_tracking`

### 4.6a Varní soustavy (Brewing Systems) ✅

**Co to je:** Šablona pro výpočty objemů, ztrát a konstant varního zařízení. Pivovar má typicky 1-2 soustavy. Slouží jako základ pro kalkulační engine receptur (Sprint 7).

**Jak to funguje:**
- DataBrowser: seznam soustav (název, batch size, efektivita, hotové pivo, provozovna, primární badge)
- Quick filters: Vše | Aktivní
- Route: `/brewery/brewing-systems`

**Detail — 5 sekcí:**
1. **Hlavička:** název, popis, batch size (L), efektivita (%), provozovna, primární toggle
2. **Teplá zóna — vizuální bloky:** 3 bloky vedle sebe (Chmelovar, Whirlpool, Fermentor) s VesselBlock vizualizací
   - Chmelovar: objem nádoby, ztráta %, dvě nádoby (sladina → mladina)
   - Whirlpool: ztráta % (textový blok, bez nádob)
   - Fermentor: objem nádoby, ztráta %, dvě nádoby (mladina → hotové pivo)
   - VesselBlock: CSS obdélníky s dynamickým vybarvením dle poměru objem/nádoba
   - Barvy: sladina (amber), mladina (zlatá), hotové pivo (světle zlatá)
   - Reaktivní přepočet při změně jakéhokoliv vstupu
3. **Konstanty:** extrakt sladu (0-1), voda L/kg slad, voda navíc (L)
4. **Časy kroků:** příprava, scezování, whirlpool, přesun, úklid (editovatelné min) + rmutování, chmelovar (readonly — "čas z receptu")
5. **Poznámky:** textarea

**Výpočet objemů (calculateVolumes):**
- `batch_size_l` = objem mladiny = objem PO chmelovaru
- `preboil` = batch_size / (1 - kettle_loss/100)
- `postWhirlpool` = batch_size × (1 - whirlpool_loss/100)
- `intoFermenter` = postWhirlpool
- `finishedBeer` = intoFermenter × (1 - fermentation_loss/100)

**Byznys pravidla:**
- Max 1 primární soustava per tenant (partial unique index)
- Ztráty v % — vždy kladné číslo
- `fermenter_volume_l` = schématická/referenční hodnota pro vizualizaci (skutečné tanky jsou v equipment)
- Soft delete (is_active = false)

**Vazby:**
- `recipes.brewing_system_id` — pro výpočty objemů, ztrát, potřebného sladu (Sprint 7)
- `batches.brewing_system_id` — zděděné z recipe, nebo přepsané

### 4.6b Tanky (Equipment) ✅

**Co to je:** Evidence fyzických nádob studené zóny pivovaru (fermentory, ležácké tanky, CKT). Dříve "Zařízení" — přejmenováno po oddělení varních soustav.

**Jak to funguje:**
- DataBrowser: seznam tanků (název, typ, kapacita, stav, provozovna)
- Quick filters: Vše | Fermentory | Ležácké | CKT

**Typy tanků:**
- fermenter (fermentor)
- brite_tank (ležácký tank)
- conditioning (kondicionér)
- ckt (CKT — cylindrokónický tank, použitelný pro kvašení i ležení)

*Odstraněné typy (Sprint 6):* brewhouse, bottling_line, keg_washer — nahrazeny modulem Varní soustavy.

**Detail:**
- Název, typ, kapacita (litry), provozovna (**povinné pole**)
- Stav: available | in_use | maintenance | retired
- Aktuální šarže (pokud obsazený) — link na šarži
- Poznámky

**Byznys pravidla:**
- Stav se mění automaticky: přiřazení šarže → in_use, dokončení šarže → available
- Kapacita slouží pro plánování (post-MVP)

### 4.6c Pivní styly (Beer Styles — BJCP 2021) ✅

**Co to je:** Systémový číselník 118 pivních stylů dle BJCP 2021, sdílený všemi tenanty (globální codebook, bez tenant_id).

**Data:**
- 13 skupin (beer_style_groups): Pale Lager, Amber/Dark Lager, Czech Lager, Pale Ale, Amber/Brown Ale, IPA, Dark British Ale, Strong European Ale, Strong Ale, Wheat Beer, Belgian Ale, Sour/Wild, Specialty
- 118 stylů: kompletní BJCP 2021 sada s parametry (OG, FG, IBU, SRM/EBC, ABV) a textovými popisy (vzhled, aroma, chuť, dojem, suroviny, historie, srovnání, komerční příklady)
- Import: `scripts/import-beer-styles.mjs` z Bubble CSV exportu (`docs/BeerStyles/`)

**Vizualizace — BeerGlass:**
- SVG komponenta "tuplák" (český půllitr) — `src/components/ui/beer-glass/BeerGlass.tsx`
- viewBox 64×80, trapézové tělo, vlnitá pěna se 4 bubliny, ucho (arc), skleněný efekt, highlight
- Barva piva dle EBC hodnoty: `ebcToColor()` — EBC-native 16-bodová RGB mapa s lineární interpolací (nahrazuje SRM konverzi)
- Exporty: `ebcToColor(ebc)` (hex), `ebcToColorRgb(ebc)` (rgb()), `ebcToColorLight(ebc, opacity)` (rgba())
- Placeholder mód: `placeholder={true}` — tečkovaný vzor bez barvy piva
- `useId()` hook pro unikátní SVG gradient/clip IDs (více BeerGlass na stránce)
- Velikosti: sm (32px), md (48px), lg (64px)
- Použití v UI:
  - RecipeBrowser card view — renderImage zobrazí BeerGlass dle EBC + levý border s EBC barvou
  - RecipeDetail header — BeerGlass dle kalkulovaného EBC → target EBC → midpoint stylu; placeholder pokud žádné EBC
  - MaltTab — dual BeerGlass: cíl EBC → kalkulované EBC
  - BeerStyleBrowser card view — dual BeerGlass (min→max EBC) + group foto

**Konverze:**
- SG → Plato: `°P ≈ 259 - (259 / SG)`
- V DB uloženy obě varianty (SRM i EBC) pro Beer Styles

### 4.6d Rmutovací profily (Mashing Profiles) ✅

**Co to je:** Šablony rmutovacích postupů — definice kroků (teplota, čas, typ) pro opakované použití v recepturách. Systémové profily (BJCP doporučené postupy) jsou sdílené a readonly, uživatel si vytváří vlastní.

**Jak to funguje:**
- DataBrowser: seznam profilů (název, typ rmutování, počet kroků, systémový/vlastní badge)
- Quick filters: Vše | Systémové | Vlastní
- Route: `/brewery/mashing-profiles`

**Systémové vs vlastní profily:**
- **Systémové** (`tenant_id = NULL`): Jednokvasný infuzní, Dvourastový infuzní, Český dekokční jednomezový, Český dekokční dvoumezový. Readonly — nelze editovat ani smazat, ale lze duplikovat.
- **Vlastní** (`tenant_id = tenantId`): plně editovatelné, soft delete (`is_active = false`)

**Detail profilu:**
- Název, typ rmutování (infusion/decoction/step), popis (textarea), poznámky (textarea)
- Systémový profil: readonly formulář + alert banner "Systémový profil — pro úpravu duplikujte" + tlačítko "Duplikovat do vlastních"
- MashStepEditor: inline tabulka kroků — typ (mash_in/heat/rest/decoction/mash_out), název, cíl °C, náběh (min), výdrž (min), celkem (min), poznámka. Sloupce: Cíl (°C) | Náběh (min) | Výdrž (min) | Celkem. Sumární patička: celkový náběh / výdrž / celkový čas. Autocomplete šablony názvů (6 běžných rastů s teplotami). Tlačítka: přidat krok, posun nahoru/dolů, smazat.

**Typy rmutování:**
- infusion — infuzní postup
- decoction — dekokční postup
- step — stupňovaný postup

**Typy kroků (MashStepType):**
- mash_in — zápara
- heat — ohřev (přechodový krok bez pauzy)
- rest — rast (teplotní pauza)
- decoction — dekokce (odběr + var)
- mash_out — odrmutování

**MashStep interface:**
```typescript
interface MashStep {
  stepType: MashStepType          // typ kroku
  name: string                    // název (autocomplete šablony)
  targetTemperatureC: number      // cílová teplota (°C)
  rampTimeMin: number             // čas náběhu na cílovou teplotu (min)
  holdTimeMin: number             // čas výdrže na cílové teplotě (min)
  note?: string                   // poznámka
}
```

**Kroky jsou uloženy jako JSONB pole** `steps` na tabulce `mashing_profiles`:
```json
[{ "name": "Bílkovinný rast", "stepType": "rest", "targetTemperatureC": 52, "rampTimeMin": 5, "holdTimeMin": 15 }]
```

**Legacy migrace:** Staré kroky s poli `temperature`, `time`, `type` jsou transparentně konvertovány funkcí `migrateStep()` při čtení (žádná DB migrace, zpětná kompatibilita).

**Výpočet celkového času:** `calculateMashDuration()` — sečte náběh a výdrž všech kroků, formátovaný výstup (celkový čas rmutování).

**Autocomplete šablony názvů:** 6 běžných rastů s typickými teplotami (bílkovinný rast 52 °C, beta-glukánový rast 40 °C, cukrotvorný rast 63 °C, zcukřovací rast 72 °C, maltózový rast 65 °C, odrmutování 78 °C).

**Integrace s recepturami:**
- Tab "Kroky" na receptuře: tlačítko "Načíst rmutovací profil" → dialog s výběrem profilu → nahradí existující rmutovací kroky
- Tab "Kroky" na receptuře: tlačítko "Uložit jako profil" → dialog s názvem → extrahuje rmutovací kroky (mash_in, rest, decoction, mash_out) a vytvoří nový vlastní profil

**Byznys pravidla:**
- Duplikace: kopie libovolného profilu (systémového i vlastního) → nový vlastní profil s sufixem "(kopie)"
- `saveRecipeStepsAsProfile()`: filtruje kroky dle typu — přenáší pouze mash_in, rest, decoction, mash_out (ne boil/whirlpool/cooling)
- Pokud receptura nemá žádné rmutovací kroky → chyba "Receptura nemá žádné rmutovací kroky"
- Soft delete: `is_active = false`, systémové profily nelze smazat

---

## 5. MODUL SKLAD

### 5.1 Katalog položek (pohled na Items) ✅

**Co to je:** Kompletní katalog všech položek v systému — suroviny, produkty, obaly, služby.

**Jak to funguje:**
- DataBrowser s parametrickým filtrem (vysuvný z levé strany)
- Quick filters: Vše | Na pokladně | Výrobní
- Card view: obrázek, typ/název, výrobce, cena, badgy (Surovina, Prodejní, Výrobní)
- Parametrický filtr: název, značka, prodejní položka, na pokladně, typ suroviny, základní vyráběná položka, kategorie skladu

**Rozdíl oproti Suroviny (Pivovar modul):**
- Suroviny = filtr `is_brew_material=true`, zaměřeno na sládka
- Katalog = vše, zaměřeno na skladníka/obchodníka, víc sloupců (EAN, balení...)

**Detail položky — taby pro výrobní položky** (`is_production_item=true`):
- Základní informace: standardní formulář
- Recepty: seznam receptur kde `recipe.item_id = thisItem.id` (tabulka: název, styl, objem, OG, IBU, status badge). Klik → navigace na detail receptu.
- Produkty: seznam položek kde `base_item_id = thisItem.id` (tabulka: název, kód, objem L). Tlačítko "+ Produkt" → vytvoření nové položky s předvyplněným `baseItemId`.
- Stav skladu: standardní stock tab

### 5.2 Skladové doklady ✅

**Co to je:** Příjemky a výdejky — dokumenty evidující pohyb zboží.

**Typy dokladů:**

| Typ | Směr | Účel | Příklad |
|-----|------|------|---------|
| Příjemka (receipt) | IN | Nákup od dodavatele | Příjem sladů od Malina |
| Příjemka (receipt) | IN | Výroba | Nastáčené pivo ze šarže V-2026-001 |
| Příjemka (receipt) | IN | Inventura přebytek | Nalezeny 2 sudy navíc |
| Příjemka (receipt) | IN | Převod | Ze skladu A do B |
| Výdejka (issue) | OUT | Prodej zákazníkovi | Výdej sudů pro restauraci |
| Výdejka (issue) | OUT | Spotřeba při výrobě | Suroviny do šarže |
| Výdejka (issue) | OUT | Odpis | Prošlé suroviny |

**Status workflow:** draft → confirmed → cancelled

**Detail dokladu:**
- Hlavička: kód (z číslovací řady), typ pohybu, účel, datum, sklad, partner, objednávka/šarže
- Řádky: položka, požadované množství, skutečné množství, chybějící, cena, celkem, číslo šarže, expirace (příjemky)
- Potvrzení dokladu vytvoří atomické stock_movements

**Alokace při výdeji:**
- **FIFO** (výchozí): systém automaticky přiřadí výdej ke konkrétním příjmům od nejstaršího (stock_issue_allocations)
- **Ruční výběr šarže** (manual_lot): uživatel vybírá konkrétní příjemkové šarže v LotSelectionDialog, alokace se uloží jako pre-alokace v draft stavu a při potvrzení se validují
- Alokace dekrementují remaining_qty na zdrojových příjemkových řádcích
- Plně alokované příjemky se automaticky uzavřou (isClosed=true)

**Vedlejší pořizovací náklady (VPN) na příjemkách:** ✅
- Na příjemce lze zadat vedlejší náklady (doprava, clo, manipulace...) v tabu "Náklady"
- Každý náklad: popis, částka, režim rozpuštění (hodnotově / množstevně)
- Systém automaticky rozpustí VPN na řádky příjemky:
  - **Hodnotově (by_value):** poměrem dle qty × NC (řádky s NC = 0 se přeskočí, fallback na množstevně)
  - **Množstevně (by_quantity):** poměrem dle qty
- Výsledek: `overheadPerUnit` (VPN na MJ) a `fullUnitPrice` = NC + VPN/MJ (pořizovací cena)
- Při potvrzení příjemky jde do stockMovements `fullUnitPrice` (ne prostá NC)
- FIFO alokační engine čerpá pořizovací cenu automaticky (bez změn)
- Na řádcích příjemky: sloupce VPN/MJ (readonly), PC (readonly)
- "Zadat celkem" toggle: zadání celkové ceny řádku, NC = celkem / množství (dopočítáno)
- VPN se přepočítává automaticky při každé změně nákladů i řádků
- Na výdejkách se sloupce VPN/PC nezobrazují

**Generování CF výdaje z příjemky:** ✅
- Na potvrzené příjemce (účel = nákup) tlačítko "Vytvořit CF" → vytvoří CF výdaj s vazbou
- Pokud CF vazba existuje → tlačítko "Otevřít CF" s navigací na detail
- Auto-generování: dle nastavení provozovny (`autoCreateCfOnReceipt` + výchozí kategorie)
- Storno příjemky: pokud má navázaný CF, nabídne "Stornovat také navázaný výdaj"
- Cross-link sekce na detailu příjemky zobrazuje vazbu na CF

**Byznys pravidla:**
- Draft doklad nemění stav skladu — teprve potvrzení (confirmed) vytvoří movements
- Potvrzený doklad nelze editovat, jen stornovat (cancelled) — storno vytvoří protipohyby
- Příjemka musí mít alespoň 1 řádek
- Výdejka nemůže vydat víc než je na skladě (kontrola stock_status)

### 5.3 Stav skladu ✅

**Co to je:** Materializovaný pohled na aktuální stav — kolik čeho je na kterém skladě.

- `stock_status` tabulka: per item × warehouse
- quantity = aktuální stav
- reserved_qty = rezervováno (naplánované výdeje v draft stavu)
- available_qty = quantity - reserved_qty (computed)
- Aktualizuje se automaticky při potvrzení dokladu

### 5.4 Lot tracking ✅

**Co to je:** Sledování šarží surovin od dodavatele. Lot = příjemkový řádek.

**Jak to funguje:**
- Při příjmu surovin: na řádku příjemky se zadá číslo šarže, expirace, atributy šarže (per materialType)
- Atributy šarže (Popover na řádku příjemky): slad (výtěžnost, vlhkost), chmel (ročník, skutečná alpha), kvasnice (generace, viabilita)
- remaining_qty: materializovaný sloupec — při potvrzení příjemky = issuedQty, dekrementuje se výdejkami, inkrementuje stornováním
- Tracking agenda (/stock/tracking): readonly browser nad potvrzenými příjemkovými řádky
  - Quick filtry: Vše, Na skladě, Částečně vydáno, Vydáno, Expirováno
  - Status je computed: in_stock (remaining = issued), partial (0 < remaining < issued), issued (remaining = 0), expired (expiry < today)
- Detail šarže: readonly — header, atributy šarže, historie výdejů (alokací)
- Traceability: z hotového piva zpět k šarži surovin (přes batch_material_lots, Sprint 4)

### 5.5 Spotřební daň ✅

**Co to je:** Zákonná povinnost — evidence piva podléhajícího spotřební dani v daňovém skladu.

**Konfigurace (per tenant, v settings JSONB):**
- `excise_enabled`: zapnout/vypnout (default: true)
- `excise_brewery_category`: A–E dle ročního výstavu (default: A = do 10 000 hl)
- `excise_tax_point`: "production" | "release" (default: production)
- `excise_plato_source`: "batch_measurement" | "recipe" | "manual" (default: batch_measurement)
- `excise_loss_norm_pct`: norma technologických ztrát v % (default: 1.5)
- UI: Settings → Spotřební daň (`/settings/excise`)

**Sazby (excise_rates):**
- Tabulka sazeb: kategorie × sazba Kč/°P/hl × platnost od/do
- Systémové sazby (tenant_id = NULL): CZ 2024 — A: 16, B: 19.20, C: 22.40, D: 25.60, E: 32 Kč
- Tenant-specific sazby mají přednost před systémovými
- Sazba se snapshotuje na každém pohybu (neměnit zpětně)

**Daňové pohyby (excise_movements):**
- Typy: production (příjem z výroby), release (propuštění do volného oběhu), loss (technologická ztráta), destruction (zničení), transfer_in/out (převod mezi sklady), adjustment (ruční korekce)
- Atributy: objem v hl, direction (in/out), stupňovitost °P, sazba, daň, období (YYYY-MM)
- Status: draft → confirmed → reported
- Vazby: batch, stock_issue, warehouse
- **Automatické generování:** z `confirmStockIssue()` na excise-relevant skladech
  - Příjemka (production_in) → production, direction=in
  - Výdejka (sale) → release, direction=out (s výpočtem daně)
  - Výdejka (waste) → destruction, direction=out
  - Výdejka (transfer) → transfer_out, direction=out
- **Automatické storno:** z `cancelStockIssue()` → adjustment s opačným direction
- **Packaging loss:** z `saveBottlingData()` pokud packaging_loss_l > 0 → loss, direction=out
- **Výpočet daně:** volume_hl × plato × rate_per_plato_hl (pouze pro release)
- **Resolve stupňovitost:** batch.ogActual → recipe.og → manuální (dle settings)
- Ruční pohyby (adjustment): plně editovatelné v draft stavu, smazatelné
- Auto-generated pohyby: omezená editace (plato, notes), nelze smazat
- UI: `/stock/excise` (browser), `/stock/excise/[id]` (detail)

**Měsíční podání (excise_monthly_reports):**
- Bilance: opening_balance + production + transfer_in − release − transfer_out − loss − destruction ± adjustment = closing_balance
- Opening balance = closing balance předchozího měsíce (nebo 0 pro první měsíc)
- Rozpad daně dle stupňovitosti: [{plato, volume_hl, tax}]
- Status: draft → submitted → (draft zpět pro opravu)
- Generování: vybrat období → sumarizace confirmed pohybů → upsert report
- Přegenerování: draft report lze aktualizovat
- Submit: pohyby v období → status "reported", batche → excise_status "reported"
- UI: `/stock/monthly-report` (browser), `/stock/monthly-report/[id]` (detail s bilancí, rozpadem daně, seznamem pohybů)

**Batch integrace:**
- ExciseBatchCard na batch detailu (pokud excise_enabled): objem hl, °P, stav (none/recorded/reported)
- `batches.excise_relevant_hl`, `batches.excise_status` se plní automaticky z excise hooks

**Byznys pravidla:**
- Daň se počítá ze stupňovitosti (°P) a kategorie pivovaru (dle ročního výstavu)
- Pivovar do 10 000 hl/rok = kategorie A (50 % ze základní sazby = 16 Kč/°P/hl)
- Sazby se mění zákonem — uloženy v excise_rates, ne hardcoded
- Pivo pod 0.5 % ABV nepodléhá dani
- Technologické ztráty (do normy) = bez daně (v MVP neřešíme dodanění nad normu)
- Pohyby na ne-excise-relevant skladech NEvytvářejí excise movements
- Položky s is_excise_relevant=false se nezapočítávají do excise objemu

---

## 6. MODUL OBCHOD

### 6.1 Objednávky ✅

**Co to je:** Odběratelské objednávky.

**Status workflow:**
```
draft → confirmed → in_preparation → shipped → delivered → invoiced → cancelled
```

**Detail objednávky:**
- Hlavička: číslo (z řady), partner (zákazník), datum objednávky, datum dodání, stav
- Řádky: položka, množství, jednotková cena, DPH sazba, sleva %, celkem
- Zálohy: záloha za obaly (sudy, přepravky) — deposit per řádek
- Sumář: celkem bez DPH, DPH, celkem s DPH
- Vazba na cash flow (příjem)
- Vazba na skladový výdej (vytvoření výdejky z objednávky)
- Poznámky (interní + pro zákazníka)

**Byznys pravidla:**
- Objednávka v draft stavu — editovatelná
- Confirmed → nelze editovat řádky, jen status forward
- Vytvoření výdejky z objednávky: nabídne předvyplněnou výdejku s položkami z objednávky
- Záloha se účtuje zvlášť (deposit_amount per obalový typ)

**Stornování objednávky:**
- Stornovat lze z libovolného ne-terminálního stavu (draft, confirmed, in_preparation, shipped, delivered)
- Terminální stavy (invoiced, cancelled) — tlačítko storno se nezobrazuje
- Před stornováním se volá `getCancelOrderPrecheck()` — pre-flight kontrola dopadů:
  - Pokud existuje potvrzená výdejka → bude stornována (`cancelStockIssue()` — counter-movements, obnova zůstatků)
  - Pokud existuje draftová výdejka → bude zrušena (status → cancelled)
  - Pokud existuje navázaný CF (planned/pending) → bude stornován
  - Pokud je CF ve stavu `paid` → **storno blokováno** — uživatel musí nejdříve stornovat pohledávku
- Cancel dialog zobrazuje seznam dopadů jako bullet points, při blokaci je tlačítko "Stornovat" neaktivní

---

## 7. MODUL FINANCE

### 7.1 Cash Flow ✅

**Co to je:** Evidence příjmů a výdajů pivovaru.

**Jak to funguje:**
- DataBrowser: seznam příjmů/výdajů (datum, popis, kategorie, částka, stav, partner)
- Quick filters: Vše | Příjmy | Výdaje | Plánované | Zaplacené
- Ruční zadání nebo automatické generování ze šablon

**Status:** planned → pending → paid → cancelled

**Kategorizace:** Hierarchické kategorie (např. Provozní náklady > Energie > Elektřina). Kategorie konfigurovatelné per tenant.

**Vazby:**
- Partner (dodavatel/zákazník)
- Objednávka (příjem z prodeje)
- Skladový doklad / příjemka (výdaj za nákup) — automaticky nebo manuálně z potvrzené příjemky

**Generování z příjemky:** ✅
- Potvrzená příjemka (účel = nákup) → tlačítko "Vytvořit CF" → CF výdaj (částka = totalCost, partner, kategorie)
- Auto-generování při potvrzení příjemky dle nastavení provozovny (`autoCreateCfOnReceipt`)
- Stornování příjemky nabídne stornování navázaného CF záznamu

### 7.2 Šablony a recurring ✅

**Co to je:** Šablony pro opakované příjmy/výdaje s manuálním i automatickým generováním.

**Jak to funguje:**
- Definice šablony: název, typ (příjem/výdaj), kategorie, částka, frekvence, partner, popis
- Frekvence: týdně | měsíčně | čtvrtletně | ročně
- Pole `nextDate` řídí, kdy se další záznam vygeneruje; po generování se automaticky posune (`advanceDate()`)
- Šablona má start_date a volitelně end_date
- Dva režimy generování: **manuální** (bulk dialog) a **automatický** (cron)

**UI — TemplateManager:**
- Browse: tabulka šablon s badge "Auto" u automatických
- Detail šablony: Sheet (pravý panel) s taby:
  - **Nastavení** — read-only přehled parametrů šablony
  - **Vygenerované** — seznam již vytvořených CF záznamů
  - **K vygenerování** — preview budoucích generování
- Edit/Create: dialog (ne přímo v Sheet) — formulář se všemi poli vč. auto-generate toggle
- Bulk generování: tlačítko "Generovat platby" → preview dialog se seznamem pending items (pouze manuální šablony). Auto šablony zobrazeny s opacity + badge jako info.

**Automatické generování (auto-generate):**
- Na šabloně toggle `autoGenerate` + helptext "Doklady se automaticky vytvoří každý den ráno"
- API endpoint `/api/cron/generate-cf` (POST/GET, autorizace CRON_SECRET)
- `autoGenerateForAllTenants()`: iteruje všechny tenanty s aktivními auto_generate šablonami, generuje CF, loguje do `cf_auto_generation_log` (upsert per tenant+den)
- Dashboard: `AutoCfNotification` — Alert s ikonou Banknote, zobrazí počet a detail auto-vygenerovaných dokladů dnes
- Manuální bulk generování (`generateFromTemplates()`) filtruje pouze šablony s `autoGenerate=false`

**CF ↔ šablona vazba:**
- Tabulka cashflows: `template_id` (UUID FK → cashflow_templates), `is_recurring` (BOOLEAN)
- Generované CF záznamy mají vazbu na šablonu pro zpětnou dohledatelnost

**Příklady:**
- Nájem provozovny: 25 000 Kč/měsíc, výdaj, auto-generate ✓
- Pojistka: 48 000 Kč/rok, výdaj, auto-generate ✓
- Paušální odběr restaurace: 15 000 Kč/měsíc, příjem, manuální generování

### 7.3 Pokladna ✅

**Co to je:** Evidence hotovostních příjmů a výdajů (taproom, výčep).

**Jak to funguje:**
- Pokladna je entita navázaná na provozovnu (shop)
- Příjmy a výdaje se evidují jako cashflow s `is_cash = true`
- Zůstatek pokladny se aktualizuje atomicky v DB transakci
- POS view: velké zobrazení zůstatku, rychlé tlačítka Příjem/Výdej
- Denní přehled: seznam operací za den, sumář příjmů/výdajů/bilance
- Quick presets: předvolby popisu (Prodej piva, Drobný výdaj...)
- Kategorizace: výběr z CF kategorií filtrovaných dle typu

**Nastavení:** Settings → Pokladny
- CRUD: název + provozovna
- Aktivní/neaktivní toggle

---

## 8. NASTAVENÍ

### 8.1 Obecné nastavení 📋
- Název pivovaru, logo
- Typ pivovaru (výrobní, brewpub, contract)
- Výchozí měna (CZK)
- Časové pásmo
- Roční výstav (odhad — pro excise kategorii)

### 8.2 Provozovny ✅
- CRUD provozoven (pivovar, taproom, sklad, kancelář)
- Adresa, výchozí provozovna
- Zařízení a sklady patří pod provozovnu
- **Tab "Parametry" (Sprint 3):** konfigurace režimu naskladnění (none/bulk/packaged), defaultní sklady (suroviny/pivo), cenotvorba surovin (calc_price/avg_stock/last_purchase), cenotvorba piva (fixed/recipe_calc/actual_costs), kalkulační vstupy (režie %, režie CZK, náklady var CZK).
- **Parametry CF (Sprint 4 Patch):** `autoCreateCfOnReceipt` (automaticky generovat CF výdaj při potvrzení příjemky), `defaultReceiptCfCategoryId` (výchozí kategorie CF pro nákupy).

### 8.6 Sklady ✅
- CRUD skladů s vazbou na provozovnu
- Kategorie (suroviny, pivo, obaly, služby, ostatní)
- Daňová relevance (is_excise_relevant)
- Výchozí sklad (is_default)
- Auto-vytvoření číslovacích řad (PRI{kód}, VYD{kód}) při vytvoření skladu

### 8.3 Uživatelé 📋
- Seznam uživatelů tenantu
- Pozvání nového uživatele (email + role)
- Změna role, deaktivace uživatele
- Granulární práva per modul a agenda

### 8.4 Číslovací řady ✅
- Konfigurace per entita: prefix, separátor, počet cifer, include year, reset yearly
- Preview formátu (V-2026-001)
- Defaulty nastaveny při registraci

### 8.5 Billing 📋
- Aktuální plán a subscription status
- Upgrade/downgrade
- Add-on moduly
- Fakturační údaje
- Historie plateb

### 8.7 Zálohy ✅
- CRUD záloh za obaly (sudy, přepravky)
- Název, částka, aktivní/neaktivní
- Používáno v objednávkách jako deposit per řádek

### 8.8 Kategorie Cash Flow ✅
- Hierarchické kategorie příjmů/výdajů
- Systémové kategorie (is_system=true) — needitovatelné
- Idempotentní seed při registraci tenantu

### 8.9 Pokladny ✅
- CRUD pokladen (název + provozovna)
- Správa v Settings → Pokladny
- Zůstatek se aktualizuje automaticky z operací

---

## 9. MODULE ACCESS CONTROL (SUBSCRIPTION GATING)

### 9.1 Princip 📋

Přístup k modulům závisí na subscription tenantu. Free tier = jen Pivovar. Vyšší tiery = více modulů. Add-ony = dokoupení jednotlivých modulů.

**Route → Module mapping:**

| URL path | Required module | Free | Starter | Pro | Business |
|----------|----------------|------|---------|-----|----------|
| /brewery/* | brewery | ✅ | ✅ | ✅ | ✅ |
| /stock/* | stock | ❌ | ✅ | ✅ | ✅ |
| /sales/* | sales | ❌ | ❌ | ✅ | ✅ |
| /finance/* | finance | ❌ | ❌ | ✅ | ✅ |
| /plan/* | plan | ❌ | ❌ | ❌ | ✅ |
| /settings/* | _always | ✅ | ✅ | ✅ | ✅ |
| /dashboard | _always | ✅ | ✅ | ✅ | ✅ |

### 9.2 Kontrolní vrstvy 📋

1. **Middleware** — redirect na /upgrade?module=X
2. **ModuleGuard** (layout) — server component pojistka
3. **TopBar** — zamčené moduly šedé + 🔒
4. **Server actions** — withModuleAccess() → 403

### 9.3 Upgrade page 📋

- URL: /upgrade?module=stock (parametr pro zvýraznění)
- Zobrazí aktuální plán
- Porovnávací tabulka plánů
- CTA na upgrade (v MVP: odkaz na billing v settings)

---

## 10. ADMIN PANEL (SaaS Management) 🚧

> Přístup: pouze superadmin (user_profiles.is_superadmin = true). Route group (admin), vlastní layout, BEZ tenant kontextu.

### 10.0 Admin infrastruktura ✅

**Autentizace a autorizace:**
- Middleware: admin routes (`/admin/*`) vyžadují autentizaci (Supabase session)
- Superadmin check v admin layoutu — ne-superadmini jsou tiše přesměrováni na `/dashboard`
- `checkSuperadmin()` — vrací boolean, kontroluje `user_profiles.is_superadmin`
- `getCurrentSuperadmin()` — vrací user data pokud je superadmin, jinak `null`
- `withSuperadmin()` — wrapper pro admin server actions, vrací 403 pokud volající není superadmin
- `isSuperadmin` flag přidán do `TenantContextData` a tenant-loaderu — dostupný v celé dashboard vrstvě

**Admin layout:**
- Vlastní layout s admin sidebar (BEZ tenant kontextu)
- Sidebar sekce: SaaS Monitor (dashboard), Systémové browsery (rmutovací profily)
- Superadmin gate: server-side kontrola v layoutu, tichý redirect

**Integrace s dashboard:**
- "Admin panel" odkaz v TopBar user menu — viditelný pouze superadminům
- Ikona ShieldCheck, navigace na `/admin`

### 10.1 Admin Dashboard 💡
- KPI: MRR, počet aktivních tenantů, nové registrace (tento měsíc), churn rate
- Grafy: trend registrací, MRR vývoj
- Quick links na problémové oblasti (expiring trials, chybové logy)

### 10.2 Tenant Management 💡
- DataBrowser: seznam tenantů (název, plán, status, registrace, poslední aktivita, users)
- Detail tenantu: subscription info, seznam uživatelů, usage stats, aktivita
- Akce: deaktivace tenantu, změna plánu, prodloužení trialu

### 10.3 Plan Management 💡
- CRUD plánů s verzováním (valid_from/to)
- Správa included_modules a limitů per plán
- Správa add-on modulů a jejich cen
- Preview: kolik tenantů je na kterém plánu

### 10.4 Subscription Overview 💡
- Přehled všech subscriptions
- Filtry: expiring trials, active, cancelled, past_due
- Bulk akce: prodloužení trialu, notifikace

### 10.5 Monitoring 💡
- System health: DB connections, response times, error rate
- Error logs: posledních N chyb s detailem
- Usage stats: API calls, storage, bandwidth per tenant

### 10.6 Systémové rmutovací profily (Admin CRUD) ✅

**Co to je:** Správa systémových rmutovacích profilů (`tenant_id = NULL`) — BJCP doporučené postupy sdílené všemi tenanty. Přístupné pouze superadminům v admin panelu.

**Jak to funguje:**
- AdminMashProfileBrowser: tabulkový přehled systémových profilů (název, typ rmutování, počet kroků, celkový čas)
- AdminMashProfileDetail: formulář s názvem, typem rmutování, popisem + MashStepEditor (znovupoužitý z tenant modulu)
- Route: `/admin/mashing-profiles` (list), `/admin/mashing-profiles/new` (nový), `/admin/mashing-profiles/[id]` (detail/edit)

**Server actions** (vše zabaleno ve `withSuperadmin`):
- `getSystemMashingProfiles()` — seznam systémových profilů
- `getSystemMashingProfile(id)` — detail jednoho profilu
- `createSystemMashingProfile()` — vytvoření nového systémového profilu
- `updateSystemMashingProfile()` — úprava existujícího systémového profilu
- `deleteSystemMashingProfile()` — smazání systémového profilu

**Modul:** `src/admin/mashing-profiles/` (actions, hooks, components, index)

---

## 11. MARKETING WEBSITE 💡

> Přístup: public, žádný auth. Route group (marketing), vlastní layout (header + footer).

### 11.1 Homepage 💡
- Hero section: headline + subheadline + CTA (Registrace zdarma)
- Key features (3-4 bloky s ikonami)
- Social proof: "520+ pivovarů v ČR, žádný oborový software"
- Testimonials (v MVP placeholder)
- CTA section na konci

### 11.2 Pricing Page 💡
- Tabulka plánů (Free / Starter / Pro / Business)
- Feature comparison matrix
- FAQ sekce
- CTA: "Začněte zdarma"

### 11.3 Features Page 💡
- Detailní popis každého modulu s screenshots (v MVP mockupy)
- Orientováno na pain points pivovarů

### 11.4 Blog 💡
- V MVP: statické MDX stránky
- Ve Fázi 2: CMS (headless)
- Obsah: pivovarské know-how, novinky o produktu, case studies

### 11.5 Contact Page 💡
- Kontaktní formulář
- Email, adresa

---

## 12. TECHNICKÉ CHOVÁNÍ

### 12.1 Měrné jednotky ✅
- Systémový číselník `units` (kg, g, l, ml, hl, ks, bal) — globální, tenant_id=NULL
- Položky (items): `unit_id` FK → skladová MJ, `recipe_unit_id` FK → recepturová MJ (jen pro chmel)
- Recepturové řádky (recipe_items): `unit_id` FK → MJ konkrétního řádku
- Povolené MJ dle typu suroviny: slad=kg (readonly), chmel=kg/g, kvasnice=g/kg/ml/l/ks, přísady=kg/g/l/ml
- Systémové číselníky forem: `hop_forms` (pellet/leaf/plug/cryo s utilization_factor), `yeast_forms` (dry/liquid s default_unit)
- Konverze v kalkulacích přes `toBaseFactor` (g→kg = 0.001, ml→l = 0.001)
- DB ukládá hodnoty v uživatelsky zvolené MJ (ne vždy v base units)
- Kalkulace vždy přepočítají na base unit (kg) před výpočtem

### 12.2 Soft delete
- Záznamy se nemažou fyzicky (kromě skutečně dočasných dat)
- Smazání = `is_active = false` nebo `status = 'archived'`
- Smazané záznamy nejsou vidět v DataBrowseru (pokud není speciální filtr)

### 12.3 Číslovací řady
- Automaticky generované při vytvoření záznamu
- Thread-safe (DB sequence nebo row lock)
- Formát: `{prefix}{separator}{year}{separator}{padded_number}`
- Příklad: V-2026-001, OBJ-2026-0001, it00001

### 12.4 Audit trail
- `created_at`, `updated_at` na všech tabulkách
- `created_by` kde relevantní (kdo vytvořil)
- Subscription events: kompletní log změn plánu

---

## APPENDIX A: ENTITY QUICK REFERENCE

| Entita | Modul | Agenda | Status |
|--------|-------|--------|--------|
| partners | Pivovar | Partneři | ✅ |
| contacts | Pivovar | Kontakty | ✅ |
| items (brew materials) | Pivovar | Suroviny | ✅ |
| items (all) | Sklad | Položky | ✅ |
| recipes | Pivovar | Receptury | ✅ |
| batches | Pivovar | Vary | ✅ |
| brewing_systems | Pivovar | Varní soustavy | ✅ |
| equipment | Pivovar | Tanky | ✅ |
| warehouses | Sklad | (Nastavení) | ✅ |
| stock_issues | Sklad | Skladové pohyby | ✅ |
| stock_movements | Sklad | (interní) | ✅ |
| material_lots | Sklad | Tracking | ✅ |
| excise_movements | Sklad | Daňové pohyby | 📋 |
| excise_monthly_reports | Sklad | Měsíční podání | 📋 |
| orders | Obchod | Objednávky | ✅ |
| cashflows | Finance | Cash Flow | ✅ |
| cashflow_templates | Finance | (šablony) | ✅ |
| cash_desks | Finance | Pokladna | ✅ |
| shops | Nastavení | Provozovny | ✅ |
| tenants | Nastavení | Obecné | 📋 |
| tenant_users | Nastavení | Uživatelé | 📋 |
| counters | Nastavení | Číslovací řady | ✅ |
| subscriptions | Nastavení | Billing | 📋 |
| — | Module Access | Upgrade page | 📋 |
| — | Admin | Infrastruktura (auth, layout) | ✅ |
| mashing_profiles (system) | Admin | Rmutovací profily | ✅ |
| tenants (cross) | Admin | Tenants | 💡 |
| plans | Admin | Plans | 💡 |
| subscriptions (cross) | Admin | Subscriptions | 💡 |
| — | Admin | Monitoring | 💡 |
| — | Marketing | Homepage | 💡 |
| — | Marketing | Pricing | 💡 |
| — | Marketing | Blog | 💡 |
