# PRODUCT-SPEC — Funkční specifikace
## ProfiBrew.com | Jak systém funguje
### Aktualizováno: 18.02.2026 | Poslední sprint: Sprint 2

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
Přehled, Partneři, Kontakty, Suroviny, Receptury, Vary, Zařízení

**Sklad:**
Položky (katalog), Skladové pohyby, Tracking, Daňové pohyby, Měsíční podání

**Obchod:**
Objednávky

**Finance:**
Cash Flow, Pokladna

**Plán:** 💡 (Fáze 2)

**Nastavení** (vždy dostupné):
Obecné, Provozovny, Uživatelé, Číslovací řady, Billing

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
- Quick filters: Vše | Slady a přísady | Chmel | Kvasnice
- Card view: obrázek suroviny, typ (Slad/Chmel/...), název, cena, alpha (u chmele)
- List view: kód, název, cena, surovina (checkbox), prodejní (checkbox), alpha, výrobce, z knihovny

**Detail suroviny:**
- Základní info: kód, název, značka/výrobce
- Flagy: Surovina na výrobu piva ✓, Položka pro evidenci výroby ☐, Prodávat položku ✓
- Kategorie skladu, spotřební daň (toggle), mód výdeje (FIFO/LIFO)
- Material-specific: typ suroviny (dropdown), alpha (chmel), EBC (slad)
- Měrná jednotka (MJ sklad): select z povolených MJ dle typu suroviny (slad=kg readonly, chmel=kg/g, kvasnice=g/ks, přísady=kg/g/l/ml)
- Měrná jednotka receptury (MJ receptury): viditelné pouze pro chmel — odlišná MJ pro skladovou evidenci (kg) vs recepturu (g)
- Auto-fill MJ při změně typu suroviny (malt→kg, hop→kg+g, yeast→g, adjunct→kg)
- Cenotvorba: kalkulační cena, průměrná skladová, prodejní cena, režie
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

**Detail receptury:**
- Základní info: název, kód, pivní styl (z BJCP číselníku), cílový objem, doba kvašení/dokvašování
- Suroviny: tabulka — položka (lookup), kategorie (slad/chmel/kvasnice/přísada), množství (g), fáze použití (rmut/var/whirlpool/kvašení/dry hop), čas přidání
- Kroky: tabulka — typ kroku, název, teplota, čas, teplotní gradient, poznámka. Možnost použít rmutovací profil (šablona).
- Kalkulace: vypočtené parametry (OG, FG, ABV, IBU, EBC) + nákladová kalkulace (součet cen surovin + režie)
- Poznámky

**Byznys pravidla:**
- Receptura se dá duplikovat (nová kopie, status=draft)
- Při vytvoření várky se suroviny a kroky zkopírují do šarže (snapshot — změna receptury neovlivní existující várky)
- Kalkulace se ukládá jako snapshot (recipe_calculations) — historie kalkulací

### 4.5 Vary / Šarže ✅

**Co to je:** Evidence výrobních šarží piva od vaření po stáčení.

**Jak to funguje:**
- DataBrowser: seznam várek (číslo, název piva, datum, stav, tank, OG, objem)
- Vytvoření: vybrat recepturu → systém zkopíruje suroviny a kroky do nové šarže

**Status workflow:**
```
planned → brewing → fermenting → conditioning → carbonating → packaging → completed
                                                                          → dumped
```

**Detail šarže (taby):**
- Přehled: číslo várky, recept, pivo (item), stav, datum vaření, tank, sládek
- Kroky vaření: tabulka kroků z receptury, u každého plánovaný vs skutečný start/konec, teploty. Krok se "odškrtává" v průběhu vaření.
- Měření: seznam měření (typ, hodnota, °P, SG, teplota, timestamp). Graf vývoje.
- Suroviny: spotřebované suroviny s lot tracking vazbou
- Stáčení: kolik sudů/lahví/plechovek se nastáčelo (bottling_items)
- Spotřební daň: evidované hl, status nahlášení
- Poznámky: ke krokům i celé šarži

**Byznys pravidla:**
- Číslo várky z číslovací řady (V-2026-001)
- Šarže vždy patří k jednomu tanku/zařízení (equipment)
- Při stáčení se vytvoří skladový příjem hotového piva
- Při spotřebě surovin se vytvoří skladový výdej
- Excise: objem se eviduje v hl, systém sleduje status nahlášení

### 4.6 Zařízení ✅

**Co to je:** Evidence výrobního zařízení pivovaru.

**Jak to funguje:**
- DataBrowser: seznam zařízení (název, typ, kapacita, stav, aktuální šarže, provozovna)
- Quick filters: Vše | Varny | Fermentory | Ležácké | CKT | Stáčecí

**Typy zařízení:**
- brewhouse (varna)
- fermenter (fermentor)
- brite_tank (ležácký tank)
- conditioning (CKT — cylindrokónický)
- bottling_line (stáčecí linka)
- keg_washer (myčka sudů)

**Detail:**
- Název, typ, kapacita (litry), provozovna
- Stav: available | in_use | maintenance | retired
- Aktuální šarže (pokud obsazený) — link na šarži
- Vlastnosti dle typu (JSONB): materiál, chlazení, přetlakový...
- Poznámky

**Byznys pravidla:**
- Stav se mění automaticky: přiřazení šarže → in_use, dokončení šarže → available
- Kapacita slouží pro plánování (Fáze 2) — kontrola že šarže nepřesahuje objem tanku

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

### 5.2 Skladové doklady 📋

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
- Řádky: položka, požadované množství, skutečné množství, chybějící, cena, celkem
- Potvrzení dokladu vytvoří atomické stock_movements

**FIFO alokace (při výdeji):**
- Systém automaticky přiřadí výdej ke konkrétním příjmům (stock_issue_allocations)
- Dle nastaveného módu (FIFO/LIFO) na položce
- Řeší správné ocenění výdeje (průměrná vs konkrétní cena příjmu)

**Byznys pravidla:**
- Draft doklad nemění stav skladu — teprve potvrzení (confirmed) vytvoří movements
- Potvrzený doklad nelze editovat, jen stornovat (cancelled) — storno vytvoří protipohyby
- Příjemka musí mít alespoň 1 řádek
- Výdejka nemůže vydat víc než je na skladě (kontrola stock_status)

### 5.3 Stav skladu 📋

**Co to je:** Materializovaný pohled na aktuální stav — kolik čeho je na kterém skladě.

- `stock_status` tabulka: per item × warehouse
- quantity = aktuální stav
- reserved_qty = rezervováno (naplánované výdeje v draft stavu)
- available_qty = quantity - reserved_qty (computed)
- Aktualizuje se automaticky při potvrzení dokladu

### 5.4 Lot tracking 📋

**Co to je:** Sledování šarží surovin od dodavatele.

**Jak to funguje:**
- Při příjmu surovin: záznam material_lot (číslo šarže dodavatele, datum příjmu, expirace)
- Při spotřebě v šarži: vazba batch_material_lots (jaký lot → do jaké várky, kolik)
- Traceability: z hotového piva zpět k šarži surovin

### 5.5 Spotřební daň 📋

**Co to je:** Zákonná povinnost — evidence piva podléhajícího spotřební dani.

**Konfigurace (per tenant):**
- excise_enabled: zapnout/vypnout (default: zapnuto)
- excise_tax_point_mode: "production" (daňový bod = výroba) nebo "release" (daňový bod = propuštění ze skladu)
- excise_default_plato_source: "recipe" (stupňovitost z receptury) nebo "measurement" (z měření)

**Daňové pohyby (excise_movements):**
- Typy: výroba, propuštění, export, zničení, úprava
- Objem v hl, stupňovitost, vypočtená daň
- Období (rok-měsíc)
- Status: draft → confirmed → reported

**Měsíční podání:**
- Přehled za měsíc: celkový objem, celková daň
- Status: draft → submitted → accepted
- Export pro celní správu (formát TBD)

**Byznys pravidla:**
- Daň se počítá ze stupňovitosti (°P) a kategorie pivovaru (dle ročního výstavu)
- Pivovar do 10 000 hl/rok má sníženou sazbu
- Sazby se mění zákonem — uloženy v konfiguraci, ne hardcoded
- Pivo pod 0.5% ABV nepodléhá dani

---

## 6. MODUL OBCHOD

### 6.1 Objednávky 📋

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

---

## 7. MODUL FINANCE

### 7.1 Cash Flow 📋

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
- Skladový doklad (výdaj za nákup)

### 7.2 Šablony a recurring 📋

**Co to je:** Šablony pro opakované příjmy/výdaje.

**Jak to funguje:**
- Definice šablony: název, typ (příjem/výdaj), kategorie, částka, frekvence, den v měsíci, partner
- Frekvence: týdně | měsíčně | čtvrtletně | ročně
- Systém automaticky generuje záznamy (cron job): kontroluje next_date, vytvoří cashflow, posune next_date
- Šablona má start_date a volitelně end_date

**Příklady:**
- Nájem provozovny: 25 000 Kč/měsíc, výdaj, k 1. dni měsíce
- Pojistka: 48 000 Kč/rok, výdaj, k 1.1.
- Paušální odběr restaurace: 15 000 Kč/měsíc, příjem, k 15. dni

### 7.3 Pokladna 📋

**Co to je:** Evidence hotovostních příjmů a výdajů (taproom, výčep).

- Vazba na provozovnu (shop)
- Příjmy a výdaje v hotovosti
- Aktuální zůstatek
- Denní přehled

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

## 10. ADMIN PANEL (SaaS Management) 💡

> Přístup: pouze superadmin (user_profiles.is_superadmin = true). Route group (admin), vlastní layout, BEZ tenant kontextu.

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
- Povolené MJ dle typu suroviny: slad=kg (readonly), chmel=kg/g, kvasnice=g/ks, přísady=kg/g/l/ml
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
| equipment | Pivovar | Zařízení | ✅ |
| warehouses | Sklad | (Nastavení) | 📋 |
| stock_issues | Sklad | Skladové pohyby | 📋 |
| stock_movements | Sklad | (interní) | 📋 |
| material_lots | Sklad | Tracking | 📋 |
| excise_movements | Sklad | Daňové pohyby | 📋 |
| excise_monthly_reports | Sklad | Měsíční podání | 📋 |
| orders | Obchod | Objednávky | 📋 |
| cashflows | Finance | Cash Flow | 📋 |
| cashflow_templates | Finance | (šablony) | 📋 |
| cash_desks | Finance | Pokladna | 📋 |
| shops | Nastavení | Provozovny | ✅ |
| tenants | Nastavení | Obecné | 📋 |
| tenant_users | Nastavení | Uživatelé | 📋 |
| counters | Nastavení | Číslovací řady | ✅ |
| subscriptions | Nastavení | Billing | 📋 |
| — | Module Access | Upgrade page | 📋 |
| tenants (cross) | Admin | Tenants | 💡 |
| plans | Admin | Plans | 💡 |
| subscriptions (cross) | Admin | Subscriptions | 💡 |
| — | Admin | Monitoring | 💡 |
| — | Marketing | Homepage | 💡 |
| — | Marketing | Pricing | 💡 |
| — | Marketing | Blog | 💡 |
