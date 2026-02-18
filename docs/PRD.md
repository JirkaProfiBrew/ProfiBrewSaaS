# PRD — Product Requirements Document
## ProfiBrew.com | Informační systém pro minipivovary
### Verze: 1.1 | Datum: 18.02.2026

---

## 1. PRODUCT OVERVIEW

### Co stavíme
ProfiBrew je **kompletní informační systém (ERP) pro české minipivovary** — SaaS aplikace pokrývající výrobu piva, skladové hospodářství, prodej, ekonomiku a výrobní plánování. Systém NENAHRAZUJE účetnictví, ale integruje se s účetními systémy.

### Proč to stavíme
České minipivovary (520+ aktivních) nemají oborový software. Řeší provoz v Excelu, na papíře, nebo se pokoušejí adaptovat generické ERP systémy, které nerozumí pivovarskému procesu. Zahraniční řešení (Breww, Ekos, Ollie) nepodporují české legislativní požadavky — zejména spotřební daň z piva.

### Pro koho
**Primární cílová skupina:** České minipivovary s ročním výstavem 200–5 000 hl
- ~250–300 pivovarů v ČR
- Typický zákazník: 1–10 zaměstnanců, obrat 5–30M Kč/rok
- Rozhodovatel: majitel nebo sládek
- Pain points: ruční evidence, chyby ve spotřební dani, nepřehledný sklad, neznalost skutečných nákladů

**Sekundární:** Nano pivovary (<200 hl) jako vstupní segment, střední pivovary (5K–10K hl) jako upsell.

### Diferenciátory
1. **Česká legislativa native** — spotřební daň, ARES integrace, české formáty
2. **Pivovarský proces native** — receptury → šarže → kroky → měření → stáčení, ne generické "manufacturing"
3. **Modulární pricing** — pivovar platí jen za to co používá
4. **AI-first operations** — systém je vyvíjen a provozován s AI agenty jako primární workforce

---

## 2. BUSINESS MODEL

### Pricing: Tier-based + usage overage

| Tier | Base fee | Included hl/měs | Overage/hl | Moduly | Users |
|------|----------|-----------------|------------|--------|-------|
| **Free** | 0 Kč | TBD | — | Pivovar | 2 |
| **Starter** | TBD | TBD | TBD Kč | Pivovar + Sklad | Unlimited |
| **Pro** | TBD | TBD | TBD Kč | Všechny | Unlimited |
| **Business** | TBD | TBD | TBD Kč | Všechny + API + integrace | Unlimited |

- Add-on moduly dokupitelné za flat fee na nižších tierech
- Konkrétní ceny a limity: viz samostatná pricing analýza
- Launch promo: prvních X měsíců bez omezení hektolitrů
- Plány a ceny konfigurovatelné v DB s časovou platností (valid_from/to)

### Revenue targets (konzervativní)
- Rok 1: 5 zákazníků
- Rok 2: 20 zákazníků
- Rok 3: 50 zákazníků

---

## 3. MODULY A FUNKCE

### 3.1 Modul PIVOVAR (brewery) — core

**Partneři (partners)**
- Unified: zákazník + dodavatel v jedné entitě (flagy is_customer, is_supplier)
- Právnická/fyzická osoba, IČO, DIČ s validací přes ARES
- Více kontaktních osob per partner
- Více adres (fakturační, dodací, provozovna)
- Bankovní účty
- Obchodní podmínky (splatnost, ceník, kredit)
- Přílohy (smlouvy, certifikáty)

**Kontakty (contacts)**
- Vazba na partnera
- Samostatná agenda pro přehled všech kontaktních osob

**Suroviny (materials) — pohled na Items**
- Filtrovaný pohled: items kde is_brew_material = true
- Typy: slad (malt), chmel (hop), kvasnice (yeast), přísady (adjunct), ostatní
- Specifické atributy dle typu: alpha (chmel), EBC (slad), výtěžnost (slad)
- Nákupní cena, průměrná skladová cena
- Import z veřejné knihovny (suroviny)
- Lot tracking (šarže surovin od dodavatele)

**Receptury (recipes)**
- Definice složení piva: suroviny s množstvím a fází použití
- Rmutovací profily (znovupoužitelné šablony)
- Kroky vaření: rmutování, chmelovar, whirlpool, chlazení
- Parametry: cílový objem, OG, FG, ABV, IBU, EBC, doba kvašení/dokvašování
- Kalkulace nákladů (snapshot)
- Duplikace receptur, import z knihovny

**Šarže / Vary (batches)**
- Vytvoření z receptury (kopie parametrů a surovin)
- Status workflow: plánovaná → vaří se → kvašení → dokvašování → karbonace → stáčení → hotovo / vylito
- Kroky vaření (batch_steps): instance kroků z receptury, s plánovaným a skutečným časem
- Měření (batch_measurements): gravita, teplota, pH, objem, tlak — s timestampem
- Poznámky ke krokům i celé šarži
- Přiřazení k tanku/zařízení
- Stáčení (bottling): vazba šarže → prodejní položky (sudy, lahve) s množstvím
- Spotřební daň: evidované hl, status nahlášení
- Split/blend šarží (odkaz na primární šarži)

**Zařízení (equipment)**
- Varny, fermentory, ležácké tanky, CKT, stáčecí linky
- Kapacita (litry), stav (volný, obsazený, údržba, vyřazený)
- Vazba na provozovnu
- Aktuální obsazení šarží

### 3.2 Modul SKLAD (stock)

**Katalog položek (items) — pohled na Items**
- Kompletní katalog: suroviny + produkty + obaly + ostatní
- Filtrované pohledy: Na pokladně, Výrobní, Vše
- Card view s obrázky, badgy (Surovina, Prodejní, Výrobní)

**Položky (items) — hybrid model**
- Jedna tabulka `items` s flagy: is_brew_material, is_production_item, is_sale_item, is_excise_relevant
- Stejná položka může být surovina i prodejní (např. chmel prodávaný hobbyistům)
- Specifické atributy dle typu (material_type, packaging_type, ABV, plato...)
- Cenotvorba: kalkulační cena, průměrná skladová, prodejní, režijní
- POS atributy: dostupnost na pokladně, na webu
- Barva položky, obrázek, EAN kód

**Sklady (warehouses)**
- Více skladů per provozovna
- Daňový / nedaňový sklad (pro spotřební daň)
- Povolené kategorie per sklad

**Skladové doklady (stock_issues)**
- Příjemky (receipt): nákup, výroba, inventura, převod
- Výdejky (issue): prodej, výroba (spotřeba), odpis, převod
- Status workflow: draft → confirmed → cancelled
- Řádky dokladu (stock_issue_lines): položka, množství, cena
- FIFO/LIFO alokace (stock_issue_allocations): vazba výdeje na konkrétní příjem
- Atomické pohyby (stock_movements): každý příjem/výdej = movement záznam
- Stav skladu (stock_status): materializovaný stav per item × warehouse

**Lot tracking**
- Šarže surovin od dodavatele (číslo šarže, datum příjmu, expirace)
- Vazba: lot → batch (jaké suroviny šly do které várky)
- Traceability: od hotového piva zpět k šarži surovin

**Spotřební daň (excise)**
- Povinná evidence pro české pivovary (pivo nad 0.5% ABV)
- Daňové pohyby: výroba, propuštění, export, zničení, úprava
- Měsíční podání celní správě
- Sazba závisí na kategorii pivovaru (roční výstav) a stupňovitosti
- Konfigurace: excise_enabled, tax_point_mode (výroba vs propuštění), zdroj stupňovitosti (recept vs měření)

### 3.3 Modul OBCHOD (sales)

**Objednávky (orders)**
- Odběratelské objednávky
- Status workflow: draft → confirmed → in_preparation → shipped → delivered → invoiced → cancelled
- Řádky: položka, množství, cena, DPH, sleva
- Zálohy za obaly (sudy, přepravky)
- Vazba na skladový výdej a cash flow
- Tisk/export dokladu

### 3.4 Modul FINANCE (finance)

**Cash Flow**
- Evidence příjmů a výdajů
- Kategorizace (hierarchické kategorie)
- Status: plánovaný → čekající → zaplacený → stornovaný
- Vazba na partnera, objednávku, skladový doklad
- Filtrování dle období, kategorie, stavu

**Šablony a recurring**
- Šablony pro opakované příjmy/výdaje (nájem, pojistka, energie...)
- Frekvence: týdně, měsíčně, čtvrtletně, ročně
- Automatické generování z šablon (next_date tracking)

**Pokladna (cash desk)**
- Pro taproom / výčep
- Vazba na provozovnu
- Evidence příjmů a výdajů v hotovosti
- Aktuální zůstatek

### 3.5 Modul PLÁN (plan) — Fáze 2

- Plánování výroby (kalendářový pohled)
- Kapacitní plánování (obsazenost tanků)
- Plánování nákupu surovin dle receptur a plánu výroby
- Tabulka prodeji vs. výroba
- Dashboard predikce

---

## 4. CROSS-CUTTING FEATURES

### 4.1 Multi-tenancy
- Shared database, tenant_id izolace
- RLS na DB úrovni, middleware na API, context na frontend
- Tenant = pivovar, ne uživatel

### 4.2 Auth & RBAC
- 5 tenant rolí: owner, admin, brewer, sales, viewer
- Permission matice: modul × operace (CRUD)
- Granulární: user_module_rights + user_agenda_rights
- Owner = plný přístup + billing
- Viewer = read-only (pro účetní, konzultanty)
- **Superadmin** = systémový flag (`is_superadmin`), není tenant role. Přístup k admin panelu, vidí data napříč tenanty.

### 4.3 Module Access Control (Subscription Gating)
- Přístup k modulům (Sklad, Obchod, Finance, Plán) je řízen subscription tenantu
- Modul Pivovar je dostupný vždy (i Free tier) — je to core value proposition
- Ostatní moduly jsou dostupné dle plánu (included_modules) nebo jako zakoupený add-on (subscription_addons)
- Kontrola přístupu na 4 úrovních:
  1. **Middleware** — redirect na /upgrade pokud URL path vede na nepřístupný modul
  2. **Layout guard** — server component pojistka, zobrazí upgrade prompt
  3. **TopBar UI** — zamčené moduly šedé s 🔒, klik → upgrade page
  4. **Server actions / API** — wrapper `withModuleAccess()`, vrací 403
- **/upgrade page** — upsell stránka s aktuálním plánem, porovnáním tierů a CTA na upgrade

### 4.4 DataBrowser (univerzální browsovací komponenta)
- Každá agenda používá stejný DataBrowser, konfigurovaný per entita
- Dva režimy: List View (tabulka) a Card View (dlaždice)
- Quick filters (tab-style), parametrický filtr panel (vysuvný)
- Řazení, vyhledávání, stránkování
- Saved views (uložené pohledy — per user nebo sdílené)
- Bulk akce (export, smazání, změna stavu)
- URL-based state pro shareable links

### 4.5 Provozovny (shops)
- Více provozoven per tenant: pivovar, taproom, sklad, kancelář
- Zařízení a sklady patří pod provozovnu
- Default provozovna

### 4.6 Číslovací řady (counters)
- Konfigurovatelné per tenant a per entita
- Format: prefix-rok-číslo (V-2026-001)
- Automatický reset na začátku roku (volitelné)
- Defaultní řady při vytvoření tenantu

### 4.7 i18n
- Čeština (default), angličtina
- next-intl, překlady v JSON souborech per modul
- Budoucí rozšíření: slovenština, polština

### 4.8 Přílohy (attachments)
- Generický systém: entity_type + entity_id
- Supabase Storage
- Obrázky, PDF, dokumenty

### 4.9 Veřejné knihovny (read-only)
- BJCP pivní styly
- Veřejná knihovna surovin (import do vlastních items)
- Veřejná knihovna receptur (Fáze 3 — marketplace)

### 4.10 Marketing Website (public)
- Veřejně přístupné stránky — vlastní route group `(marketing)` s odlišným layoutem
- **Homepage** — value proposition, hero, key features, testimonials, CTA na registraci
- **Pricing** — tabulka plánů s porovnáním, FAQ, CTA
- **Features** — detailní popis modulů a funkcí
- **Blog** — SEO obsah, novinky, pivovarské know-how (v MVP statické stránky, CMS ve Fázi 2)
- **Contact** — kontaktní formulář
- Optimalizováno pro SEO (metadata, OG tags, structured data)
- Česká verze primární, anglická sekundární

### 4.11 Admin Panel (SaaS Management)
- Přístupný pouze superadminům — vlastní route group `(admin)` s odlišným layoutem, BEZ tenant kontextu
- **Admin Dashboard** — KPI: MRR, aktivní tenanty, nové registrace, churn, usage
- **Tenant Management** — seznam tenantů, detail (subscription, uživatelé, usage, aktivita), možnost deaktivace
- **Plan Management** — CRUD plánů s verzováním (plans tabulka s valid_from/to), správa add-on modulů
- **Subscription Overview** — přehled subscriptions napříč tenanty, expiring trials, payment status
- **User Management** — přehled všech uživatelů napříč tenanty
- **Monitoring** — system health, error logs, usage statistics, DB metriky
- V MVP: základní přehledy. Pokročilé analytics ve Fázi 2.

---

## 5. USER STORIES — MVP (Fáze 1)

### Registrace a onboarding
- US-001: Jako sládek chci vytvořit účet pro svůj pivovar, abych mohl začít systém používat
- US-002: Jako owner chci po registraci projít průvodcem (název, provozovna, první tank), abych měl základní nastavení
- US-003: Jako owner chci pozvat kolegy do systému a přiřadit jim role

### Položky a suroviny
- US-010: Jako sládek chci evidovat suroviny (slady, chmely, kvasnice) s jejich parametry
- US-011: Jako sládek chci importovat surovinu z veřejné knihovny, abych nemusel vše zadávat ručně
- US-012: Jako skladník chci vidět katalog všech položek (suroviny + produkty) v card i list view
- US-013: Jako sládek chci přepínat mezi pohledy Suroviny / Katalog položek / Na pokladně

### Receptury
- US-020: Jako sládek chci vytvořit recepturu s definicí surovin, množství a výrobních kroků
- US-021: Jako sládek chci duplikovat existující recepturu a upravit ji
- US-022: Jako sládek chci vidět kalkulaci nákladů receptury

### Šarže / Výroba
- US-030: Jako sládek chci vytvořit novou várku z receptury
- US-031: Jako sládek chci zaznamenávat průběh vaření (start/konec kroků, teploty, časy)
- US-032: Jako sládek chci zadávat měření během výroby (gravita, pH, teplota)
- US-033: Jako sládek chci přiřadit šarži k tanku a vidět obsazenost
- US-034: Jako sládek chci zaznamenat stáčení (kolik sudů/lahví z šarže)
- US-035: Jako sládek chci vidět přehled všech várek a jejich stav

### Partneři
- US-040: Jako obchodník chci evidovat zákazníky a dodavatele
- US-041: Jako obchodník chci ke každému partnerovi přidat kontakty, adresy a bankovní účty
- US-042: Jako obchodník chci vyhledat partnera přes ARES a stáhnout údaje automaticky

### Sklad
- US-050: Jako skladník chci vytvořit příjemku při nákupu surovin
- US-051: Jako skladník chci vytvořit výdejku při odeslání zboží zákazníkovi
- US-052: Jako skladník chci vidět aktuální stav skladu per položka
- US-053: Jako sládek chci trasovat šarži surovin — z jakého lotu šla surovina do které várky

### Objednávky
- US-060: Jako obchodník chci vytvořit objednávku pro zákazníka
- US-061: Jako obchodník chci k objednávce přidat zálohy za obaly
- US-062: Jako obchodník chci vidět stav objednávek a filtrovat je

### Ekonomika
- US-070: Jako majitel chci evidovat příjmy a výdaje pivovaru
- US-071: Jako majitel chci vytvořit šablonu pro opakovaný výdaj (nájem) a nechat systém generovat záznamy
- US-072: Jako majitel chci vidět cash flow přehled za období

### Spotřební daň
- US-080: Jako sládek chci, aby systém automaticky evidoval daňové pohyby při výrobě piva
- US-081: Jako majitel chci vidět měsíční přehled pro podání celní správě
- US-082: Jako majitel chci konfigurovat režim daňového bodu (výroba vs propuštění)

### Zařízení
- US-090: Jako sládek chci evidovat tanky a varny s jejich kapacitou
- US-091: Jako sládek chci vidět, který tank je volný a který obsazený

### Nastavení
- US-100: Jako owner chci nastavit provozovny pivovaru
- US-101: Jako owner chci konfigurovat číslovací řady
- US-102: Jako owner chci spravovat uživatele a jejich role

### Module Access & Billing
- US-110: Jako owner chci vidět jaký plán mám a jaké moduly jsou dostupné
- US-111: Jako owner chci upgradovat plán, abych získal přístup k dalším modulům
- US-112: Jako uživatel vidím zamčený modul s ikonou 🔒 a po kliknutí upgrade page s nabídkou
- US-113: Jako uživatel NEMŮŽU přistoupit k datům zamčeného modulu ani přes přímé URL nebo API

### Admin Panel (superadmin)
- US-120: Jako superadmin chci vidět dashboard s KPI (MRR, aktivní tenanty, nové registrace)
- US-121: Jako superadmin chci prohlížet seznam tenantů a jejich detail (subscription, users, usage)
- US-122: Jako superadmin chci spravovat plány (vytvářet nové verze, měnit ceny a moduly)
- US-123: Jako superadmin chci vidět přehled subscriptions (expiring trials, payment status)
- US-124: Jako superadmin chci vidět monitoring (errors, DB health, usage stats)

### Marketing Website
- US-130: Jako návštěvník chci vidět homepage s jasnou value proposition a CTA na registraci
- US-131: Jako návštěvník chci vidět pricing page s porovnáním plánů
- US-132: Jako návštěvník chci vidět features page s popisem modulů
- US-133: Jako návštěvník chci číst blog s pivovarským obsahem (SEO)

---

## 6. NON-FUNCTIONAL REQUIREMENTS

### Performance
- Stránka se načte do 2s na 3G
- DataBrowser s 1000 záznamy: rendering < 500ms
- API response time < 200ms (p95)

### Security
- Supabase RLS na všech tenant-scoped tabulkách
- RBAC kontrola na každém API route
- Module access control: subscription-gated moduly na 4 úrovních (middleware, layout, UI, API)
- Superadmin role: systémový flag, přístup k admin panelu, cross-tenant data
- HTTPS only
- Žádné citlivé údaje v URL params nebo localStorage
- Session expiry: 1 hodina inaktivity

### Scalability
- Cílový stav: 500 tenantů, 50 concurrent users
- DB: Supabase Pro plan (8GB, connection pooling)
- Sharding: nepotřeba v prvních 2 letech

### Accessibility
- Keyboard navigation pro DataBrowser
- Responzivní design (desktop-first, mobile usable)
- Minimum WCAG 2.1 AA pro kontrast a font sizes

### Data
- Backup: Supabase automatic daily
- Data export: CSV/Excel z DataBrowseru
- GDPR: smazání tenant dat na požádání

---

## 7. RELEASE PHASES

### Fáze 1 — MVP (14 týdnů)
Vše výše v sekci 5 (User Stories US-001 až US-102). Cíl: funkční ERP systém pro beta testery.
- Module access control (US-110 až US-113) — subscription gating od začátku
- Marketing website: skeleton homepage + pricing (placeholder obsah, finalizace v Sprint 6)
- Admin panel: základní tenant list + subscription overview (US-120, US-121, US-123)

### Fáze 2 — Growth (měsíce 5-7)
- Ceníky a slevy
- Plánování výroby (kalendář)
- Nákupní objednávky (dodavatelé)
- Pokročilé reporty
- Fakturační integrace
- Custom role
- Marketing: blog CMS, SEO optimalizace, landing pages per feature
- Admin: full monitoring, pokročilé analytics, plan A/B testing
- Billing: Stripe/payment integration, automatické fakturace

### Fáze 3 — Ecosystem (měsíce 8-12)
- Public API pro partnery
- B2B portál pro odběratele
- Integrace s účetními systémy (Pohoda, Money, ABRA)
- Quality Control modul
- Veřejná knihovna/marketplace
- Offline/PWA

---

## 8. ASSUMPTIONS & CONSTRAINTS

### Assumptions
- Pivovar má stabilní internet (bez offline režimu v MVP)
- Uživatel má alespoň základní IT gramotnost (umí Excel)
- Jeden pivovar = jeden tenant (ne konsolidace více pivovarů)
- České legislativní požadavky na spotřební daň se nezmění zásadně během vývoje
- Aplikace má 4 odlišné zóny: marketing (public), auth, tenant ERP (dashboard), SaaS admin — každá s vlastním layoutem a auth pravidly

### Constraints
- One-man operation + AI agents (limited human capacity)
- Supabase free/Pro tier (cost constraint)
- Next.js + Vercel stack (locked in)
- Existující Bubble prototyp jako reference, ne jako kód k migraci
