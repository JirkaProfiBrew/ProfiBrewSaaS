# CHANGELOG — ProfiBrew.com
## Co je hotové, co se změnilo

> Aktualizováno po každém sprintu. Nejnovější nahoře.

---

## [Unreleased] — Sprint 0: Infrastruktura
**Období:** T1-T2 (zahájení 17.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] Project scaffold (Next.js 14, TypeScript strict, Tailwind, shadcn/ui)
- [x] Supabase setup + Drizzle ORM konfigurace
- [x] DB schema: tenants, user_profiles, tenant_users, plans, subscriptions, saved_views
- [x] RLS policies pro tenant izolaci
- [x] Auth: login, registrace, middleware (session refresh, route protection)
- [x] Multi-tenant context (TenantProvider, withTenant helper)
- [x] i18n setup (next-intl, cs + en)
- [x] Layout: TopBar s module tabs, collapsible Sidebar
- [x] DataBrowser framework: ListView, CardView, FilterBar, QuickFilters, ParametricFilterPanel, Pagination, BulkActions
- [x] FormSection framework (types, form field rendering by type, responsive grid, conditional visibility)
- [x] DetailView wrapper (header, tabs, footer, loading state)
- [x] Demo agenda: Partners (mock data) pro ověření frameworku — 25 mock partnerů, client-side filtrování/řazení/stránkování
- [x] Environment & deployment strategy documented in SYSTEM-DESIGN.md

### Architektonická rozhodnutí
- Drizzle ORM (ne Prisma) — lightweight, SQL-blízký
- next-intl od začátku — plánovaná expanze CZ → SK → PL
- Hybrid items model — jedna tabulka s flagy, filtrované pohledy
- Unified partners — zákazník + dodavatel v jedné entitě
- Tier-based pricing s add-on moduly a overage per hl
- Temporální pricing data v DB (valid_from/to)
- Card view v DataBrowseru od začátku (ne Fáze 2)

---

## [0.1.0] — Sprint 1: Základy
**Období:** T3-T4 (18.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: items, partners, contacts, addresses, bank_accounts, attachments, equipment, shops, counters, countries, units + RLS policies
- [x] Items (hybrid model) — MaterialsBrowser (brewery), CatalogBrowser (stock), ItemDetail, server actions
- [x] Partners — upgraded from demo: real DB data, PartnerDetail with 5 tabs (info, contacts, addresses, bank accounts, attachments), ARES IČO lookup
- [x] Contacts — standalone agenda with partner join, click navigates to partner detail
- [x] Equipment — EquipmentBrowser, EquipmentDetail, JSONB properties
- [x] Shops — ShopBrowser, ShopDetail, JSONB address decomposition
- [x] Číslovací řady (counters) — settings page with live preview, getNextNumber with row locking
- [x] RBAC middleware — permission matrix (13 entities × 4 actions), withPermission(), usePermission() hooks
- [x] Navigation updates — settings sub-agendas (General, Shops, Users, Counters)
- [x] DataBrowser enhancement — onRowClick prop for custom row navigation
- [x] i18n for all new modules (cs + en): items, partners, contacts, equipment, shops, counters
- [x] Seed helpers: seedDefaultCounters(), seedSystemData() (countries + units)

### Architektonická rozhodnutí
- Server Actions pattern: "use server" + withTenant() for all DB access
- Non-async utility functions must be in separate files (not in "use server" modules)
- Zod v4: z.record() requires key schema z.record(z.string(), z.unknown())
- RBAC permission matrix defined in code, not DB (simpler for MVP)

---

## [0.2.0] — Sprint 2: Výroba
**Období:** T5-T7 (18.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: beer_style_groups, beer_styles, mashing_profiles, recipes, recipe_items, recipe_steps, recipe_calculations, batches, batch_steps, batch_measurements, batch_notes, bottling_items, batch_material_lots
- [x] Beer styles — BJCP 2021 seed data (8 groups, 40+ styles), system mashing profiles (4 profiles)
- [x] Recipes — RecipeBrowser (list + card view), RecipeDetail with 5 tabs (basic info, ingredients, steps, calculation, notes)
- [x] Recipe ingredients — add/remove/reorder, item lookup, category grouping, summary
- [x] Recipe steps — add/remove/reorder, mash profile loading
- [x] Recipe calculation — OG (Plato), IBU (Tinseth), EBC (Morey), ABV (Balling), cost breakdown
- [x] Recipe actions — duplicate (atomic copy with items+steps), archive (soft delete)
- [x] Batches — BatchBrowser (list + card view), BatchDetail with 6 tabs (overview, steps, measurements, ingredients, bottling, notes)
- [x] Batch status workflow — planned → brewing → fermenting → conditioning → carbonating → packaging → completed | dumped
- [x] Batch status transitions — equipment sync (in_use ↔ available), brew_date/end_brew_date auto-set
- [x] Batch creation from recipe — auto batch number (V-2026-001), recipe steps → batch steps copy
- [x] Batch measurements — add/delete, gravity chart (recharts LineChart)
- [x] Bottling — add/update/delete bottling items, volume summary
- [x] Batch notes — timeline with add/delete
- [x] RBAC update — brewer role: recipes upgraded to create/read/update
- [x] i18n for recipes + batches (cs + en)
- [x] recharts dependency added for measurement charts

### Architektonická rozhodnutí
- Brewing calculations as pure client-side functions (utils.ts, no "use server")
- Batch status transitions with equipment sync in single transaction
- Batch number generation via existing counter system (getNextNumber)
- Up/down arrows for reordering instead of drag-and-drop (simpler, accessible)
- Recipe duplicate uses db.transaction() for atomic copy
- batch_material_lots table created but no UI (Sprint 3)

---

## [0.2.1] — Sprint 2 Patch: Měrné jednotky
**Období:** T8 (19.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] Units module (`src/modules/units/`) — types, conversion utilities, server actions, SWR hook
- [x] DB: units table upgraded (code, nameCs, nameEn, symbol, category, baseUnitCode, toBaseFactor, isSystem, sortOrder)
- [x] DB: items table — přidán `recipe_unit_id` FK pro oddělenou recepturovou MJ (chmel: sklad kg, receptura g)
- [x] DB: recipe_items table — přidán `unit_id` FK pro MJ na řádku receptury
- [x] Seed: 7 systémových jednotek (kg, g, l, ml, hl, ks, bal) — idempotentní
- [x] ItemDetail — unitId text field nahrazen selectem filtrovaným dle materialType (ALLOWED_UNITS)
- [x] ItemDetail — auto-fill MJ při změně materialType (malt→kg, hop→kg+g, yeast→g)
- [x] ItemDetail — recipeUnitId select viditelný pouze pro chmel (HAS_RECIPE_UNIT)
- [x] RecipeIngredientsTab — nový sloupec MJ v tabulce surovin (zobrazuje unitSymbol)
- [x] RecipeIngredientsTab — auto-fill unitId při výběru suroviny (item.recipeUnitId → item.unitId)
- [x] BatchIngredientsTab — nový sloupec MJ (read-only, JOIN units)
- [x] Recipe calculations (utils.ts) — unit-aware: toKg() konverze přes unitToBaseFactor
- [x] calculateAndSaveRecipe — JOIN units, předávání unitToBaseFactor do kalkulací
- [x] Migration script `scripts/migrate-patch-units.mjs` — idempotentní, backfill + validace
- [x] i18n: unit-related keys pro items (cs+en), recipes (cs+en), batches (cs+en)

### Architektonická rozhodnutí
- Units jako systémový číselník (tenant_id=NULL), budoucí rozšíření o tenant custom units
- ALLOWED_UNITS mapa definuje povolené MJ per material_type (grain=kg only, hop=kg/g, etc.)
- HAS_RECIPE_UNIT = ['hop'] — pouze chmel má oddělenou skladovou a recepturovou MJ
- Kalkulace zpětně kompatibilní — pokud unitToBaseFactor chybí, fallback na starý gram→kg přepočet

---

## [0.3.0] — Sprint 3: Sklad
**Období:** T8-T9 (19.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: warehouses, stock_issues, stock_issue_lines, stock_movements, stock_issue_allocations, stock_status, material_lots + RLS policies
- [x] DB schema: batch_material_lots (lot ↔ batch traceability)
- [x] Warehouses — WarehouseBrowser, WarehouseDetail, CRUD with soft delete, auto per-warehouse counters (receipt/dispatch)
- [x] Stock Issues — StockIssueBrowser with dropdown create (receipt/issue), StockIssueDetail with 4 tabs (header, lines, movements, allocations)
- [x] Stock Issue Lines — inline editable table, add line dialog with item search, quantity/price management
- [x] Stock Issue Confirm/Cancel — AlertDialog workflows with atomic DB transactions
- [x] FIFO/LIFO allocation engine — allocates issue quantities against open receipts
- [x] Stock status materialization — UPSERT per item+warehouse on confirm/cancel
- [x] Stock Status on Items — CatalogBrowser extended with totalQty/reservedQty/availableQty columns, zeroStock filter
- [x] ItemDetail — "Stock Status" tab with per-warehouse breakdown and recent movements
- [x] Material Lots — LotBrowser with computed status badges (active/exhausted/expiring/expired), LotDetail with 3 tabs (basic info, key-value properties editor, traceability)
- [x] Lot Traceability — LotTraceabilityView showing batch usage with navigation to batch detail
- [x] Shop Parameters — "Parameters" tab on ShopDetail with stock mode, ingredient/beer pricing modes, calculation inputs (overhead %, CZK, brew cost)
- [x] Items base_item — baseItemId + baseItemQuantity fields for sale item → production item relationship, "Base Item" section on ItemDetail
- [x] Placeholder pages: /stock/excise, /stock/monthly-report (Sprint 5)
- [x] Navigation: stock module sidebar (items, movements, tracking), nav translations (cs+en)
- [x] i18n for all new modules: warehouses, stockIssues, materialLots (cs + en)

### Architektonická rozhodnutí
- Per-warehouse counters auto-created when warehouse is created (PRI{code}, VYD{code})
- FIFO allocation: open receipt movements sorted by date ASC, allocated sequentially
- Stock status is materialized (not computed on-the-fly) via UPSERT in confirm/cancel transactions
- Lot status is computed in app layer (not stored) — based on quantity_remaining and expiry_date
- Shop settings stored as JSONB — only configured in Sprint 3, actual logic (auto-receipts, pricing) in Sprint 4/5
- base_item_id on items: enables future sale→production item quantity mapping for automated stock deduction

---

## [0.3.1] — Sprint 3 Patch: Lots = Receipt Lines
**Období:** T9 (19.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB migrace: lot_number, expiry_date, lot_attributes (JSONB), remaining_qty na stock_issue_lines
- [x] IssueMode zjednodušen: FIFO + Ruční výběr šarže (odstraněny LIFO a Průměrná cena)
- [x] Příjemky: číslo šarže, expirace, atributy šarže (per materialType) přímo na řádku příjemky
- [x] LotAttributesSection — Popover s material-specific polemi (výtěžnost, vlhkost, ročník, alpha, generace, viabilita)
- [x] remaining_qty materializace — sleduje zbývající dostupné množství na příjemkových řádcích
- [x] Confirm flow: příjemka nastaví remaining_qty = issuedQty, výdejka dekrementuje remaining_qty
- [x] Cancel flow: příjemka vynuluje remaining_qty, výdejka obnoví remaining_qty
- [x] Manual lot selection — LotSelectionDialog pro výběr konkrétních příjmových šarží při výdeji
- [x] Pre-alokace v draft stavu — alokace se ukládají před potvrzením, při potvrzení se validují
- [x] FIFO engine: odstraněn LIFO branch, vždy FIFO
- [x] Nové server actions: getAvailableReceiptLines, createManualAllocations, deleteLineAllocations
- [x] getItemOptions rozšířen o isBrewMaterial, materialType, issueMode
- [x] Tracking agenda přepsána — readonly browser nad příjemkovými řádky (LotBrowser, LotDetail)
- [x] removeStockIssueLine — maže pre-alokace před smazáním řádku (bez FK cascade)
- [x] i18n: lot keys (stockIssues cs+en), tracking namespace (cs+en), items issueMode aktualizace
- [x] Recipe Snapshot: při vytvoření várky se receptura zkopíruje (recipe + items + steps), snapshot se neobjeví v prohlížeči receptur, batch detail zobrazuje odkaz na originální recept

### Architektonická rozhodnutí
- Lot = příjemkový řádek — žádná duplicitní entita, data se zadávají jednou při příjmu
- remaining_qty je materializovaný — výkon + atomické aktualizace v transakcích
- Pre-alokace pro manual_lot — uživatel vybírá šarže před potvrzením
- Tracking je readonly — browsing nad stock_issue_lines (receipt + confirmed)
- LotTraceabilityView odstraněn — nahrazen alokační historií v LotDetail

---

## [0.5.0] — Sprint 5: Daňový sklad (Spotřební daň)
**Období:** T12 (26.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: `excise_rates`, `excise_movements`, `excise_monthly_reports` + RLS policies
- [x] Excise rates — sazby dle kategorie pivovaru A–E (seed CZ 2024: 16/19.2/22.4/25.6/32 Kč/°P/hl)
- [x] Excise settings — konfigurace per tenant v settings JSONB (enabled, kategorie, daňový bod, zdroj °P, norma ztrát)
- [x] Automatické generování excise pohybů z confirmStockIssue() — příjemka na excise sklad = production, výdejka = release/destruction/transfer
- [x] Automatické storno excise pohybu při cancelStockIssue() — protipohyb (adjustment)
- [x] Packaging loss → excise loss (technologická ztráta při stáčení)
- [x] Resolve stupňovitost: priorita batch ogActual → recipe OG → manuální
- [x] Výpočet daně: volume_hl × plato × rate (pouze pro release)
- [x] ExciseMovementBrowser — DataBrowser s quick filtry (vše/příjmy/výdeje/tento měsíc/minulý měsíc)
- [x] ExciseMovementDetail — formulář s auto-computed direction, readonly poli pro auto-generated pohyby
- [x] Ruční pohyb (adjustment) — plně editovatelný formulář + smazání draft pohybů
- [x] MonthlyReportBrowser — přehled měsíčních podání s generováním
- [x] MonthlyReportDetail — bilance (opening → closing), rozpad daně dle °P, seznam pohybů
- [x] Status workflow reportu: draft → submitted (→ draft zpět)
- [x] Přegenerování draft reportu (aktualizace z potvrzených pohybů)
- [x] ExciseSettingsForm — konfigurace v Settings, readonly tabulka aktuálních sazeb
- [x] ExciseBatchCard — karta na batch detailu (objem hl, °P, stav evidence)
- [x] Navigace: /stock/excise, /stock/monthly-report (přesunuto z /finance/), /settings/excise
- [x] i18n: kompletní cs + en (movements, reports, settings, batch)

---

## [0.4.0] — Sprint 4: Obchod + Finance
**Období:** T10-T11 (20.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: orders, order_items, deposits, cashflows, cashflow_categories, cashflow_templates, cash_desks + RLS policies
- [x] DB schema: `is_reserved` na stock_issues, `recipe_item_id` na stock_issue_lines
- [x] Deposits — Settings CRUD (zálohy za obaly: sudy, přepravky)
- [x] CashFlow Categories — hierarchické kategorie příjmů/výdajů, seed systémových kategorií
- [x] Orders — OrderBrowser, OrderDetail s taby (hlavička, řádky, sumář, sklad, CF, poznámky)
- [x] Order items — cenotvorba (jednotková cena, DPH, sleva, zálohy), přepočet sumáře
- [x] Order status workflow: draft → confirmed → in_preparation → shipped → delivered → invoiced → cancelled
- [x] Order ↔ Stock integration — createStockIssueFromOrder, reserved_qty na confirm/cancel
- [x] Bulk mode — allocation engine rozšířen o targetItemId/targetQty pro baseItem konverzi
- [x] CashFlow — CashFlowBrowser, CashFlowDetail, kategorizace, status workflow (planned→pending→paid→cancelled)
- [x] CashFlow šablony — CRUD, recurring generování (weekly/monthly/quarterly/yearly)
- [x] CashFlow summary panel — měsíční přehled příjmů/výdajů
- [x] CashFlow z objednávky — createCashFlowFromOrder s vazbou na order
- [x] Auto-receipty na dokončení várky — onBatchCompleted vytvoří skladový příjem pro production item
- [x] Production issues — createProductionIssue z receptury, škálování dle batch size
- [x] BatchIngredientsTab přepsán — receptura/vydáno/chybí se stock integrací
- [x] Cash Desk — Settings CRUD (pokladna + provozovna), POS view se zůstatkem
- [x] Cash Desk transakce — příjmy/výdaje s atomickou aktualizací zůstatku
- [x] Navigation: settings sub-agendas (Zálohy, Kategorie CF, Pokladny), finance sidebar (Cash Flow, Pokladna)
- [x] i18n pro všechny nové moduly: orders, deposits, cashflows, cashflowCategories, cashDesks (cs + en)

### Architektonická rozhodnutí
- Error handling: `{ error: "CODE" }` return pattern (Next.js 16 nepropaguje throw z server actions)
- Reserved qty: materializováno v stock_status, inkrementováno/dekrementováno atomicky v transakcích
- Order sumář: server-side recalculation při každé mutaci řádku
- Cash desk balance: atomická aktualizace v DB transakci společně s vytvořením cashflow
- CashFlow kategorie: systémové (is_system=true) needitovatelné, seed idempotentní
- Auto-receipt na batch completion: inline v transakci transitionBatchStatus, ne externím voláním
- Production issues: recipeItemId na stock_issue_lines pro vazbu ingredience ↔ řádek výdejky

---

## [0.4.1] — Sprint 4 Patch
**Období:** 23.02.2026
**Status:** 🚧 In Progress

### Změněno
- [x] Oprava kalkulace receptu: `toKg()` a `RecipeCalculation` — null `toBaseFactor` = již v kg (ne gram)
- [x] Zrušení scaleFactor: recepturní kopie se používá přímo, bez škálování dle objemu
- [x] Přidán sloupec "Originál" na tab Suroviny (porovnání kopie vs. originální recept)
- [x] Klikatelná dlaždice receptu na detail várky (žlutý rámeček, parametry: ABV, IBU, OG, EBC, FG, objem)
- [x] Snapshot mód RecipeDetail — banner "Kopie receptu pro várku {batchNumber}", Zpět → detail várky
- [x] Sloučení tlačítek výdeje surovin: smazán `directProductionIssue()`, jedno tlačítko "Vydat suroviny" → draft výdejka → navigace na detail výdejky
- [x] Vyčištění i18n klíčů (`prepareIssue`, `directIssue`, `confirmDirectIssue`, warning keys)

### Přidáno — Vedlejší pořizovací náklady (VPN)
- [x] DB schema: tabulka `receipt_costs` (id, tenant_id, stock_issue_id, description, amount, allocation, sort_order)
- [x] DB schema: nové sloupce na `stock_issue_lines` — `overhead_per_unit`, `full_unit_price`
- [x] Alokační engine `recalculateOverheadForReceipt()` — rozpuštění VPN na řádky hodnotově (by_value) nebo množstevně (by_quantity)
- [x] CRUD server actions: `addReceiptCost`, `updateReceiptCost`, `removeReceiptCost` (draft-only)
- [x] Automatický přepočet VPN při změně nákladů i řádků příjemky
- [x] Confirm flow: `fullUnitPrice` (NC + VPN) → `stockMovements.unitPrice` → FIFO alokace čerpá pořizovací cenu
- [x] Nový tab "Náklady" na detailu příjemky — inline-editable tabulka (popis, částka, režim rozpuštění)
- [x] Sumář nákladů: Mezisoučet zboží (NC) | VPN | Celkem s VPN
- [x] Finanční sloupce na řádcích příjemky: VPN/MJ (readonly), PC (readonly)
- [x] Grand total na řádcích = SUM(qty × fullUnitPrice)
- [x] "Zadat celkem" toggle — zadání celkové ceny řádku, NC = celkem / množství (dopočítáno)
- [x] Přepočet NC při změně množství v režimu "Zadat celkem"
- [x] Odebrán jednoduchý `additionalCost` z hlavičky příjemky (nahrazen receipt_costs)
- [x] i18n: `tabs.costs`, `costs.*`, `lines.overheadPerUnit`, `lines.fullUnitPrice`, `lines.totalEntryMode` (cs + en)

### Přidáno — Generování CF z příjemky
- [x] Tlačítko "Vytvořit CF" na potvrzené příjemce (účel = nákup) → vytvoří CF výdaj s vazbou na příjemku
- [x] Tlačítko "Otevřít CF" pokud CF vazba existuje → navigace na detail CF záznamu
- [x] Auto-generování CF při potvrzení příjemky — dle nastavení provozovny (`autoCreateCfOnReceipt`)
- [x] Nastavení provozovny: `autoCreateCfOnReceipt` toggle + `defaultReceiptCfCategoryId` výchozí kategorie
- [x] CF záznam: typ=expense, částka=totalCost příjemky, partner, kategorie, vazba `stockIssueId`
- [x] Storno dialog příjemky: detekce navázaného CF, nabídka "Stornovat také navázaný výdaj"
- [x] Cross-link sekce na detailu příjemky (Cash flow → Otevřít)
- [x] i18n: `detail.actions.createCashflow`, `detail.actions.openCashflow`, `detail.messages.*`, `detail.crossLinks.*` (cs + en)
- [x] i18n: `cancelDialog.hasCashflow`, `cancelDialog.alsoCancelCf` (cs + en)

### Přidáno — Redesign stáčení + vazba Recept→Výrobní položka
- [x] DB schema: nový sloupec `recipes.item_id` (UUID → items) — vazba receptury na výrobní položku
- [x] DB schema: nový sloupec `batches.packaging_loss_l` (DECIMAL) — ztráta při stáčení
- [x] Recept: nové pole "Výrobní položka" (select) na detailu receptury, kopíruje se při duplikaci
- [x] `getRecipesByItemId()` — nová server action pro vyhledávání receptů dle výrobní položky
- [x] Vytvoření várky: `recipe.item_id` se automaticky kopíruje na `batch.item_id` (pokud batch nemá vlastní)
- [x] Recipe snapshot: kopíruje `item_id` z originálu
- [x] Stáčení tab — kompletní přepis: auto-generované řádky z prodejních položek (base_item_id = batch.item_id)
- [x] `getProductsByBaseItem()` — nová server action vrací produkty navázané na výrobní položku
- [x] `saveBottlingData()` — atomický save stáčení (delete + insert) + výpočet `packaging_loss_l`
- [x] Sumář stáčení: stočeno celkem, objem z receptury, objem z tanku, rozdíl (barevně: zelená/červená)
- [x] Validace při dokončení várky: pokud batch má item_id ale žádné bottling_items → BOTTLING_REQUIRED
- [x] Item detail: nový tab "Recepty" — seznam receptů s `recipe.item_id = thisItem.id` (pouze pro výrobní položky)
- [x] Item detail: nový tab "Produkty" — seznam položek s `base_item_id = thisItem.id` + tlačítko "+ Produkt"
- [x] i18n: `recipes.form.itemId`, `batches.bottling.*` (přepis), `items.tabs.*`, `items.productionTabs.*` (cs + en)

### Přidáno — Sjednocení naskladnění piva (bulk + packaged)
- [x] DB: `bottling_items.quantity` změněn z `integer` na `decimal` (podpora objemu v L pro bulk mód)
- [x] `resolveShopSettings()` → `getShopSettingsForBatch()` — resolve funkce: najde default/první aktivní shop, vrací `stock_mode` + `default_warehouse_beer_id`
- [x] `getBottlingLines()` — auto-generování řádků dle stock_mode: bulk = 1 řádek (výrobní položka, MJ=L), packaged = N řádků (child items), none = prázdné
- [x] Tab Stáčení: podpora tří módů (bulk/packaged/none) — popisek módu, adaptive input (decimal pro bulk, integer pro packaged)
- [x] i18n: `bottling.modeNone`, `bottling.modeBulk`, `bottling.modePackaged`, `bottling.unit`, `bottling.amount` (cs + en)

### Přidáno — Explicitní naskladnění piva (tlačítko "Naskladnit")
- [x] `createProductionReceipt()` — nový server action: explicitní tvorba příjemky z bottling dat
- [x] `getProductionReceiptForBatch()` — helper: kontrola existující příjemky pro batch
- [x] `onBatchCompleted()` vyprázdněn — naskladnění již není automatické při dokončení várky
- [x] `transitionBatchStatus()` — odstraněna BOTTLING_REQUIRED validace, batch completion neblokuje
- [x] Tab Stáčení: tlačítko "Naskladnit" s confirm dialogem → createProductionReceipt()
- [x] Tab Stáčení: info box s odkazem na příjemku (kód, status, link)
- [x] Tab Stáčení: "Uložit" disabled pokud příjemka potvrzena (tooltip s odkazem na storno)
- [x] `saveBottlingData()` — receipt lock: nelze upravit stáčení pokud existuje potvrzená příjemka
- [x] Batch completion: non-blocking warning pokud příjemka neexistuje (confirm dialog)
- [x] i18n: `bottling.stock.*`, `bottling.receipt.*`, `statusTransition.noReceipt*`, `statusTransition.completeAnyway` (cs + en)

### Přidáno — Číslo šarže, expirace a výrobní cena
- [x] DB schema: `batches.lot_number` (text), `batches.bottled_date` (date), `recipes.shelf_life_days` (integer)
- [x] Migrace: backfill `lot_number` = `batch_number` bez pomlček pro existující várky
- [x] `createBatch()` — automatické generování `lotNumber = batchNumber.replace(/-/g, '')`
- [x] `updateBatch()` — podpora editace `lotNumber` a `bottledDate`
- [x] Batch detail: nové pole "Číslo šarže" (editovatelné) na overview tabu
- [x] Recept: nové pole "Trvanlivost" (shelf_life_days) — kopíruje se při duplikaci i do batch snapshotu
- [x] `getProductionUnitPrice()` — výpočet výrobní ceny dle pricing mode: fixed (items.costPrice), recipe_calc (recipe.costPrice/batchSizeL)
- [x] `ResolvedShopSettings` — nové pole `beer_pricing_mode` (fixed/recipe_calc/actual_costs)
- [x] `getBottlingLines()` — vrací metadata: bottledDate, shelfLifeDays, productionPrice, pricingMode
- [x] `saveBottlingData()` — ukládá `bottledDate` na batch záznam
- [x] `createProductionReceipt()` — nastavuje na řádcích: lotNumber, expiryDate (bottledDate + shelfLifeDays), unitPrice z getProductionUnitPrice(); date příjemky = bottledDate
- [x] Tab Stáčení: date picker pro datum stáčení, readonly zobrazení výrobní ceny + pricing mode, computed datum expirace
- [x] Přejmenování "Kalkulační cena" → "Výrobní cena" / "Cost Price" → "Production Cost" v items agendě
- [x] i18n: `form.lotNumber`, `bottling.bottledDate`, `bottling.productionPrice`, `bottling.expiryDate`, `bottling.priceSource.*`, `form.shelfLifeDays` (cs + en)

### Přidáno — Režie v kalkulaci receptury + cenové režimy surovin
- [x] `RecipeCalculationResult` — rozšířen o overhead: `ingredientsCost`, `ingredientOverheadPct`, `ingredientOverheadCost`, `brewCost`, `overheadCost`, `totalProductionCost`, `costPerLiter`, `pricingMode`, `priceSource` per ingredient
- [x] `OverheadInputs` — nový interface v utils.ts (overheadPct, overheadCzk, brewCostCzk)
- [x] `calculateAll()` — rozšířen o volitelný 4. parametr `overhead?: OverheadInputs`, bez parametru = nulová režie (backward compat)
- [x] `getDefaultShopSettings()` — nový server action ve shops/actions.ts, vrací ShopSettings z výchozí/první aktivní provozovny
- [x] `resolveIngredientPrices()` — nový modul `price-resolver.ts`: resolves per-item prices dle `ingredient_pricing_mode` (calc_price / avg_stock / last_purchase)
- [x] `calculateAndSaveRecipe()` — rozšířen: načte shop settings, resolve ceny dle pricing mode, předá overhead do calculateAll(), `recipes.costPrice = totalProductionCost`
- [x] `getLatestRecipeCalculation()` — nový server action: vrací poslední snapshot kalkulace
- [x] RecipeCalculation UI — rozšíření: načítá calcSnapshot, zobrazuje overhead breakdown (suroviny, režie %, náklady var, režie, výrobní cena, cena/L, zdroj cen)
- [x] Graceful fallback pro staré snapshoty bez overhead dat
- [x] i18n: `calculation.ingredientsCost`, `calculation.ingredientOverhead`, `calculation.brewCost`, `calculation.overheadCost`, `calculation.totalProductionCost`, `calculation.productionCostPerLiter`, `calculation.pricingSource`, `calculation.pricingModes.*` (cs + en)

### Přidáno — Cenotvorba balených položek (packaging_cost + filling_cost)
- [x] DB schema: nové sloupce `packaging_cost` a `filling_cost` na tabulce `items`
- [x] Item detail: nová pole "Náklady na obal" a "Náklady na stočení" (viditelná pouze pro prodejní položky s base_item)
- [x] Item detail: kalkulovaná cena balené položky = `(výrobní_cena_za_litr × objem) + obal + stočení`
- [x] `getProductionItemOptions()` — rozšířen o `costPrice` pro výpočet v UI
- [x] `BottlingLineData` — rozšířen o `packagingCost`, `fillingCost` (z items tabulky)
- [x] `getBottlingLines()` — packaged mód předává packaging/filling náklady na řádky
- [x] Tab Stáčení (packaged): rozšířené sloupce — Pivo, Obal, Stočení, Cena/ks, Celkem
- [x] Tab Stáčení (packaged): "Celková hodnota" v sumáři a patičce tabulky
- [x] `createProductionReceipt()` — packaged mód: `unitPrice = beer×baseQty + pkg + fill` (per-item pricing)
- [x] i18n: `bottling.beerCost`, `bottling.packagingCost`, `bottling.fillingCost`, `bottling.unitCost`, `bottling.totalCost`, `bottling.totalValue`, `detail.fields.packagingCost`, `detail.fields.fillingCost`, `detail.fields.calculatedCost*` (cs + en)

### Přidáno — Šablony CF: UX overhaul + automatické generování
- [x] DB schema: `template_id` (UUID FK) a `is_recurring` (BOOLEAN) na tabulce `cashflows` — vazba CF ↔ šablona
- [x] DB schema: `auto_generate` (BOOLEAN) na tabulce `cashflow_templates` — flag pro automatické generování
- [x] DB schema: nová tabulka `cf_auto_generation_log` (tenant_id, run_date, generated_count, details JSONB) — log automatických generování
- [x] TemplateManager UX přepis: detail šablony v Sheet (read-only) s taby Nastavení / Vygenerované / K vygenerování
- [x] TemplateManager: edit/create dialog oddělen od prohlížení
- [x] TemplateManager: bulk generování s preview dialogem (pendingItems), auto šablony zobrazeny s opacity + badge
- [x] Odstraněno pole "Den v měsíci" — nepoužívalo se, generování řízeno polem `nextDate` + `advanceDate()`
- [x] Auto-generate toggle na šabloně: Switch + helptext "Doklady se automaticky vytvoří každý den ráno"
- [x] Auto badge u šablon s `autoGenerate=true` v browseru i sheet detailu
- [x] `autoGenerateForAllTenants()` — server action: iteruje tenanty s aktivními auto šablonami, generuje CF, upsert do logu
- [x] `getTodayAutoGenerationInfo()` — server action: čte dnešní log pro dashboard notifikaci
- [x] `generateFromTemplates()` filtruje `autoGenerate=false` — bulk generování pouze manuálních šablon
- [x] API route `/api/cron/generate-cf` — POST/GET endpoint pro cron, autorizace přes CRON_SECRET
- [x] Dashboard: `AutoCfNotification` komponenta — Alert s počtem automaticky vygenerovaných dokladů dnes
- [x] i18n: `templates.autoGenerate`, `templates.autoGenerateHelp`, `templates.autoBadge`, `templates.autoNote`, `autoGenerate.todayTitle`, `autoGenerate.badge` (cs + en)
- ⏳ pg_cron job (generate-cf-daily) — deferred until first production/preview deploy. Extensions pg_cron + pg_net enabled in Supabase. CRON_SECRET set in .env.local. Manual testing via curl: `POST http://localhost:3000/api/cron/generate-cf`

### Opraveno — Fix cancelOrder (výdejka + cashflow)
- [x] `cancelOrder()` přepsán: ruší potvrzené výdejky (volá `cancelStockIssue()`), nejen draftové
- [x] `cancelOrder()` ruší navázaný cash flow (planned/pending) — dříve se ignoroval
- [x] `cancelOrder()` blokuje storno pokud je CF ve stavu `paid` → vrací `CASHFLOW_ALREADY_PAID`
- [x] Odstraněny všechny volání `adjustReservedQtyForOrder()` z `confirmOrder()`, `shipOrder()`, `cancelOrder()` — reserved_qty logika v objednávkách se nepoužívá
- [x] Nový server action `getCancelOrderPrecheck()` — pre-flight kontrola před stornováním: vrací seznam dopadů (stock_issue, cashflow) a flag zda lze stornovat
- [x] Cancel dialog s dynamickými dopady: načítá precheck při otevření, zobrazuje seznam dopadů (storno výdejky, storno CF, blokace kvůli zaplacenému CF)
- [x] Tlačítko "Stornovat" přidáno ke VŠEM ne-terminálním stavům (in_preparation, shipped, delivered — dříve jen draft a confirmed)
- [x] i18n: `cancelDialog.willReverseStockIssue`, `willCancelDraftIssue`, `willCancelCashflow`, `blockedByCashflow`, `messages.cashflowPaid` (cs + en)

### Architektonická rozhodnutí
- Unit system: `toBaseFactor = null` → IS the base unit (kg), not "assume grams"
- No scaleFactor: snapshot recipe items are the source of truth, amounts used directly
- Material issue flow: always draft → review → confirm (no direct confirm)
- VPN: `additionalCost` na hlavičce se stává computed cache = SUM(receipt_costs.amount), již se needituje ručně
- VPN: recalculate engine běží MIMO transakci (PostgreSQL aborted transaction pattern)
- VPN: `fullUnitPrice` jde do movements → FIFO alokační engine nepotřebuje žádné změny
- CF z příjemky: automatické generování řízeno nastavením provozovny (shop parameters JSONB)
- Stáčení: auto-generované řádky z prodejních položek — sládek zadává pouze ks, systém dopočítá objem
- Recipe overhead: `recipes.costPrice` = totalProductionCost (ingredients + overhead), not just ingredients — bottling pricing via `beer_pricing_mode=recipe_calc` automatically includes overhead
- Price resolver: 3 modes (calc_price, avg_stock, last_purchase) — resolved before calculation, fallback to items.costPrice if resolved price is null
- Sjednocení naskladnění: bulk i packaged čtou z bottling_items; createProductionReceipt tvoří příjemku z N řádků
- Naskladnění je explicitní akce (tlačítko "Naskladnit"), NE automatický side-effect batch completion
- Batch completion: warning (non-blocking) pokud příjemka neexistuje; user může dokončit i bez naskladnění
- `packaging_loss_l` = actual_volume_l − SUM(bottling ks × base_item_quantity); kladné = ztráta, záporné = přebytek
- Shop settings resolution: default/first active shop → stock_mode + default_warehouse_beer_id

---

## [0.7.3] — Sprint 7 Patch: Recipe Designer UX Improvements
**Období:** T15 (01.03.2026)
**Status:** ✅ Done

### Přidáno
- [x] **UX-01:** Nová receptura automaticky předvyplní primární varní soustavu
- [x] **UX-02:** Potvrzovací dialog při změně varní soustavy na existující receptuře (aktualizovat konstanty vs. jen změnit odkaz)
- [x] **UX-04:** Auto-sort chmelů dle fáze (rmut→FWH→chmelovar→whirlpool→dry hop) a času, vizuální separátory mezi fázemi, odstraněn DnD
- [x] **UX-05:** Collapsed Design sekce zobrazuje vizuální metriky (OG/FG/IBU/EBC/ABV) s barevným kódováním dle rozsahu stylu
- [x] **UX-06:** Water/malt slider v Design sekci (1.5–6.0 L/kg, synchronizovaný s konstantami receptury)
- [x] **UX-07:** Dual BeerGlass na tabu Slady — cíl EBC vs. kalkulované EBC
- [x] **UX-08:** Header BeerGlass priorita: kalkulované EBC → target → midpoint stylu; placeholder pro prázdné
- [x] **UX-09:** Recept karty v DataBrowser — levý border s dynamickou EBC barvou
- [x] **UX-10:** Beer style tiles — dual BeerGlass (min→max EBC) + group foto
- [x] **UX-11:** Slady — procentuální mód s posuvníky, toggle kg/%, proporcionální přerozdělení, auto výchozí % při vkládání

### BeerGlass SVG Redesign
- [x] `ebc-to-color.ts` — kompletní přepis: EBC-native 16-bodová barevná mapa (nahrazuje SRM konverzi), nové exporty `ebcToColorRgb()`, `ebcToColorLight()`
- [x] `BeerGlass.tsx` — kompletní přepis: "tuplák" design (viewBox 64×80), trapézové tělo, vlnitá pěna, ucho, skleněný efekt, placeholder mód (tečkovaný vzor), `useId()` pro unikátní SVG IDs

### Schema
- [x] `recipe_items.percent` (NUMERIC, nullable) — procento sladu v receptuře
- [x] `recipes.malt_input_mode` (TEXT, default 'percent') — preference módu zadávání sladů
- [x] Migrace `0020_malt_percentage_mode.sql`

### Architektonická rozhodnutí
- Auto-sort chmelů nahrazuje DnD — přehlednější UX, eliminuje nekonzistentní ruční řazení
- Malt percentage: state řízený lokálně v MaltTab, synchronizace s DB přes onPercentChange callback
- MetricBox varianta (ok/warn/danger/neutral) dle vzdálenosti od rozsahu stylu (in-range / ±15% / far outside)
- Water/malt slider synchronizovaný s constantsOverride.waterPerKgMalt

---

## [0.7.1] — Sprint 7 Fáze C patch: Design Sliders
**Období:** T14 (27.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: `recipes.target_ibu`, `recipes.target_ebc` — cílové hodnoty z designových sliderů
- [x] SQL migrace `0016_recipe_design_targets.sql`
- [x] `DesignSlider` — custom slider s vizualizací rozsahu pivního stylu, barevným thumbem (zelená/oranžová/červená), number inputem, marker pro kalkulovanou hodnotu
- [x] `RecipeDesignSection` — nová sekce "Návrh piva" (beer style select, batch size, 4 slidery: OG, FG, IBU, EBC, ABV readonly, SG konverze)
- [x] `RecipeExecutionSection` — přejmenováno z RecipeTargetSection, odstraněny pole styl/objem (přesunuty do Design)
- [x] `RecipeFeedbackSidebar` — přepsán na "Design vs Reality" dvousloupcovou srovnávací tabulku se stavovými ikonami (✅ ≤5%, ⚠️ ≤15%, ❌ >15%)
- [x] `RecipeDesigner` — restrukturalizace na 3-sekční layout: Design → Execution → Editor
- [x] shadcn/ui `Slider` komponenta (Radix)
- [x] Sémantická změna: `og`, `fg` jsou nyní cílové hodnoty (design), ne kalkulované — `calculateAndSaveRecipe` je nepřepisuje
- [x] Výběr pivního stylu → auto midpoint: při výběru stylu se slidery nastaví na střed rozsahu (pokud jsou na 0)
- [x] i18n: `designer.design`, `designer.execution`, `designer.sidebar` (cs + en)

### Architektonická rozhodnutí
- 3-sekční workflow: Brewer NEJPRVE navrhne parametry (Design), pak nastaví výrobu (Execution), pak skládá suroviny (Editor)
- `og`, `fg` v DB jsou nyní TARGET hodnoty ze sliderů — kalkulační engine je nepřepisuje
- Nové sloupce `target_ibu`, `target_ebc` pro IBU/EBC targets — kalkulované IBU/EBC zůstávají v `ibu`/`ebc`
- DesignSlider: rozsah stylu zobrazen jako zelená zóna, thumb barva dle vzdálenosti od rozsahu, marker ▲ pod trackem pro kalkulovanou hodnotu

---

## [0.7.0] — Sprint 7 Fáze C: Recipe Designer UI
**Období:** T14 (27.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — drag & drop pro přeřazování surovin v receptuře
- [x] DB schema: `recipes.constants_override` (JSONB) — per-recipe override parametrů varní soustavy
- [x] SQL migrace `0015_recipe_constants_override.sql`
- [x] `RecipeConstantsOverride` interface (8 optional numeric polí: efficiency, ztráty, extrakt, voda, čas varu)
- [x] Zod schema + server actions: createRecipe, duplicateRecipe, calculateAndSaveRecipe — podpora constants override
- [x] `RecipeDesigner` — hlavní orchestrátor: form state, lokální items, real-time kalkulace, CRUD operace
- [x] `RecipeTargetSection` — kolabovatelná sekce Step 1 (12 polí v 3-sloupcovém gridu, collapsed summary)
- [x] `RecipeEditor` — Step 2 wrapper s 7 sub-taby (shadcn Tabs + badge počty)
- [x] `RecipeFeedbackBar` — sticky horizontální lišta s 5 progress bary (OG, IBU, EBC, ABV, Malt) + barevné kódování (zelená/oranžová/červená)
- [x] `RecipeFeedbackSidebar` — detailní postranní panel (xl+ obrazovky, 288px) se 6 sekcemi (Target, Parametry, Slad, Pipeline, Voda, Náklady)
- [x] `IngredientCard` — base sortable wrapper s drag handle (GripVertical) + remove
- [x] `MaltCard` — množství, podíl%, EBC, extrakt%
- [x] `HopCard` — množství, alpha, fáze (select), čas varu, IBU příspěvek
- [x] `YeastCard` — množství, odhadované FG/ABV
- [x] `AdjunctCard` — množství, fáze, čas, poznámka
- [x] `MaltTab` — DnD kontext + MaltCards + souhrn (celkem vs plán, surplus/deficit)
- [x] `HopTab` — DnD kontext + HopCards + IBU breakdown (var/whirlpool/dry hop)
- [x] `YeastTab` — DnD kontext + YeastCards + odhad FG/ABV
- [x] `AdjunctTab` — DnD kontext + AdjunctCards
- [x] `MashTab` — wrapper kolem existujícího RecipeStepsTab
- [x] `ConstantsTab` — 3-sloupcová tabulka (parametr / soustava / receptura), override warning, reset button
- [x] `CalculationTab` — wrapper kolem existujícího RecipeCalculation
- [x] Stránky: `/brewery/recipes/[id]` + `/brewery/recipes/new` → RecipeDesigner (místo RecipeDetail)
- [x] i18n: designer sekce v recipes.json (cs + en) — target, feedback, volumeChange, tabs, cards, constants, calculation

### Architektonická rozhodnutí
- RecipeDesigner je "use client" orchestrátor — form state + lokální items pro real-time editaci bez server roundtrip
- Constants override: merge pattern — recipe overrides přepisují system defaults, ukládají se jako JSONB
- Ingredient editace: optimistické lokální updates (okamžitá zpětná vazba) + background persist na server
- FeedbackBar: barevné kódování: ±0% zelená, ±10% oranžová, >10% červená; malt: <2% zelená, 2-5% oranžová, >5% červená
- RecipeDetail zachován (ne smazán) pro zpětnou kompatibilitu — stránky přepnuty na RecipeDesigner
- @dnd-kit/sortable v10 (latest) — moderní DnD knihovna, SSR-friendly

---

## [0.6.4] — Sprint 6 Fáze B: Kalkulační engine
**Období:** T13 (27.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] `BrewingSystemInput` interface + `DEFAULT_BREWING_SYSTEM` fallback hodnoty
- [x] `calculateVolumePipeline()` — zpětný výpočet objemů (pre-boil → post-boil → fermenter → hotové pivo) se ztrátami
- [x] `calculateMaltRequired()` — výpočet potřebného sladu z target °Plato, pre-boil objemu a efektivity
- [x] `calculateWaterRequired()` — výpočet potřeby vody z kg sladu × water_per_kg_malt + reserve
- [x] `calculateAll()` rozšířen o volitelný `BrewingSystemInput` parametr — efektivita, ztráty z varní soustavy
- [x] `RecipeCalculationResult` rozšířen: `pipeline`, `maltRequiredKg`, `waterRequiredL`, `brewingSystemUsed`
- [x] `calculateAndSaveRecipe()` — načte brewing system z `recipe.brewing_system_id`, parsuje decimal → number
- [x] `getBrewingSystemOptions()` — nová server action pro select dropdown na receptuře
- [x] Recipe detail: select "Varní soustava" na tabu Základní údaje (za pivní styl, před výrobní položku)
- [x] Recipe kalkulace: sekce "Objemová pipeline" s objemy a ztrátami v každém kroku
- [x] Recipe kalkulace: sekce "Potřeba surovin" s kg sladu a L vody
- [x] Recipe kalkulace: poznámka o použité varní soustavě / výchozích parametrech
- [x] Duplikace receptury kopíruje `brewingSystemId`
- [x] Zod schema: `brewingSystemId` (UUID, nullable, optional)
- [x] i18n: pipeline, requirements, brewingSystem klíče (cs + en)

### Architektonická rozhodnutí
- Pipeline výpočet je zpětný: od finishedBeer (cíl) zpět k preBoil — pivovarský standard
- Efficiency fallback: 75% default zachován (reálné pivovary mají 65-85%)
- Nové `calculateAll()` pole jsou optional v RecipeCalculationResult — zpětná kompatibilita se starými snapshoty
- JSONB snapshot automaticky pojme nová pole — žádná migrace potřeba
- `extractEstimate` default 80% (průměr pro plnohodnotný slad), `waterPerKgMalt` default 4 L/kg (infuzní rmutování)

---

## [0.6.3] — Sprint 6 Fáze A4: Mashing Profiles (Rmutovací profily)
**Období:** T13 (27.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: rozšíření `mashing_profiles` — nové sloupce `mashing_type`, `description`, `is_active`, `updated_at`
- [x] SQL migrace `0014_mashing_profiles_expansion.sql` — ALTER TABLE + UPDATE systémových profilů (mashing_type, description)
- [x] Mashing Profiles modul: types, schema (Zod), actions (CRUD + duplicate + saveFromRecipe), hooks (SWR), config (DataBrowser)
- [x] MashProfileBrowser — DataBrowser s client-side filtrováním/řazením, quick filtry (Vše/Systémové/Vlastní), badge systémový/vlastní
- [x] MashProfileDetail — detail/edit s rozlišením systémových (readonly + banner) a vlastních profilů
- [x] MashStepEditor — inline tabulkový editor kroků (přidání/odebrání/řazení, typ/název/teplota/čas/poznámka)
- [x] Duplikace profilů — systémové i vlastní → nová kopie s "(kopie)" sufixem, vždy tenant-owned
- [x] Soft delete — `is_active = false`, systémové profily nelze smazat
- [x] Recipe integration: tlačítko "Uložit jako profil" na tabu Kroky — extrahuje rmutovací kroky receptury do nového profilu
- [x] Navigace: /brewery/mashing-profiles (list), /brewery/mashing-profiles/[id] (detail), /brewery/mashing-profiles/new
- [x] Sidebar: "Rmutovací profily" s ikonou Thermometer (za Varní soustavy, před Tanky)
- [x] i18n: mashing-profiles namespace (cs + en), recipes.steps.saveAsProfile keys (cs + en)

### Architektonická rozhodnutí
- Systémové profily: `tenant_id = NULL` → `isSystem` computed v app vrstvě (ne DB sloupec)
- Systémové profily readonly — nelze editovat/smazat, ale lze duplikovat do vlastních
- `saveRecipeStepsAsProfile()` filtruje kroky dle typu (mash_in, rest, decoction, mash_out) — boil/whirlpool/cooling se nepřenáší
- MashStepEditor je reusable — stejný komponent pro profil detail i (budoucí) recipe steps refaktor

---

## [0.6.0] — Sprint 6 Fáze A1: Brewing Systems (Varní soustavy)
**Období:** T13 (26.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: `brewing_systems` — nová tabulka (varní soustava s objemy, ztrátami, konstantami, časy kroků)
- [x] DB schema: `recipes.brewing_system_id` FK — vazba receptury na varní soustavu
- [x] DB schema: `batches.brewing_system_id` FK — vazba várky na varní soustavu
- [x] RLS policies + partial unique index pro is_primary per tenant
- [x] Equipment refaktor — zjednodušení na tanky (fermenter/brite_tank/conditioning), přejmenování "Zařízení" → "Tanky"
- [x] Smazány equipment typy: brewhouse, bottling_line, keg_washer (včetně FK cleanup v batches)
- [x] Brewing Systems CRUD: getBrewingSystems, getBrewingSystem, createBrewingSystem, updateBrewingSystem, deleteBrewingSystem (soft delete)
- [x] getPrimaryBrewingSystem, setPrimaryBrewingSystem (transakce: max 1 primární per tenant)
- [x] calculateVolumes — pure function: preboil → postBoil → postWhirlpool → intoFermenter → finishedBeer
- [x] BrewingSystemBrowser — DataBrowser (list + card view), quick filtry (Vše/Aktivní), computed finishedBeerL
- [x] BrewingSystemDetail — 5 sekcí: hlavička, vizuální bloky (teplá zóna), konstanty, časy kroků, poznámky
- [x] VesselBlock + WhirlpoolBlock — vizualizace nádob s dynamickým CSS vybarvením dle poměru objem/nádoba
- [x] Reaktivní přepočet — změna batch size / ztrát okamžitě přepočítá vizualizaci a objemy
- [x] Barvy kapalin: sladina (amber-500), mladina (yellow-400), hotové pivo (yellow-200)
- [x] Časy kroků: editovatelné + readonly řádky (rmutování, chmelovar = "Čas vychází z receptu")
- [x] Navigace: /brewery/brewing-systems (list), /brewery/brewing-systems/[id] (detail), /brewery/brewing-systems/new
- [x] Sidebar: "Varní soustavy" za "Vary", "Tanky" místo "Zařízení"
- [x] i18n: brewing-systems (cs + en), aktualizace equipment i18n (cs + en), nav agendas (cs + en)

### Architektonická rozhodnutí
- Brewing System = šablona pro výpočty (objemy, ztráty, konstanty); Equipment = konkrétní fyzická nádoba (tank)
- calculateVolumes je pure function v types.ts (ne v "use server" actions.ts) — použitelná client-side i server-side
- VesselBlock: čistý CSS/Tailwind (div s border + vnitřní div s %-height), žádné SVG/canvas
- fermenter_volume_l na brewing_system je schématická hodnota pro vizualizaci — skutečné tanky jsou v equipment
- is_primary: partial unique index v SQL migraci (Drizzle nativně nepodporuje partial unique)
- Ztráty v %: after = before × (1 - loss/100), batch_size_l = objem PO chmelovaru

---

## [0.6.2] — Sprint 6 Fáze A3: Beer Styles (BJCP 2021 Expansion)
**Období:** T13 (27.02.2026)
**Status:** ✅ Done

### Přidáno
- [x] DB schema: beer_style_groups — nové sloupce: `name_cz`, `image_url`
- [x] DB schema: beer_styles — nové sloupce: `srm_min`, `srm_max`, `impression`, `mouthfeel`, `history`, `ingredients`, `style_comparison`, `commercial_examples`, `origin`, `style_family`
- [x] SQL migrace `0013_beer_styles_expansion.sql` — ALTER TABLE pro všechny nové sloupce
- [x] Import script `scripts/import-beer-styles.mjs` — import 118 BJCP 2021 stylů ze 13 skupin (Bubble CSV export)
- [x] Konverze: SRM → EBC (`×1.97`), SG → Plato (`259 - 259/SG`), CSV decimal comma → dot
- [x] BeerGlass SVG component (`src/components/ui/beer-glass/`) — pivní půllitr s barvou dle EBC
- [x] `ebcToColor` utility — 16-bodová SRM color mapa s lineární RGB interpolací
- [x] BeerGlass v RecipeBrowser card view — renderImage callback zobrazí pivot dle EBC receptury
- [x] BeerGlass v RecipeDetail header — zobrazení vedle názvu receptury (dle EBC nebo midpoint stylu)
- [x] DetailView — nový `headerExtra` prop pro custom obsah v hlavičce
- [x] i18n: beer-styles namespace (cs + en) — popisky pro budoucí Beer Styles browser
- [x] Aktualizované typy: BeerStyle (11 nových polí), BeerStyleGroup (nameCz, imageUrl)
- [x] getBeerStyles action — vrací všechna nová pole včetně groupNameCz

### Architektonická rozhodnutí
- BeerGlass je pure SVG (ne canvas) — glass outline `currentColor` (funguje v light/dark mode)
- ebcToColor: EBC clamped 0-160, konverze `EBC/1.97` → SRM → RGB interpolace z 16-bodové mapy
- Import script vyžaduje `csv-parse` + `dotenv`, čte přímo z `docs/BeerStyles/` CSV souborů
- CardView `renderImage` callback — generic rozšíření frameworku, renderImage > imageField > fallback
- Beer styles jsou globální codebook (bez tenant_id) — systémová data sdílená všemi tenanty

---

## [0.6.1] — Sprint 6 Fáze A2: Equipment Refaktor
**Období:** T13 (27.02.2026)
**Status:** ✅ Done

### Změněno
- [x] Equipment = pouze nádoby studené zóny (fermenter, brite_tank, conditioning)
- [x] Smazány equipment typy: brewhouse, bottling_line, keg_washer (kód, i18n, seed, migrace)
- [x] Drizzle schema equipment.ts — aktualizován komentář (3 typy místo 6)
- [x] `recipes.brewing_system_id` FK sloupec — Drizzle schema + SQL migrace (0012)
- [x] `batches.brewing_system_id` FK sloupec — Drizzle schema + SQL migrace (0012)
- [x] SYSTEM-DESIGN.md — aktualizace equipment_type komentáře, přidán brewing_systems CREATE TABLE, přidán brewing_system_id na recipes + batches

### Poznámky
- UI pro výběr brewing_system na receptuře/šarži se řeší v Sprint 7 (Recipe Designer)
- Equipment config, browser, detail, i18n — byly vyčištěny již v Phase A1

---

<!--

## [0.5.0] — Sprint 5: Excise + Dashboard
**Období:** T12-T13
**Status:** ⏳ Planned

### Přidáno
- [ ] Excise movements — daňové pohyby
- [ ] Monthly reports — měsíční podání
- [ ] Dashboard — KPI panel (aktivní šarže, stav skladu, cash flow)
- [ ] Onboarding wizard

---

## [0.6.0] — Sprint 6: Polish + Beta Launch
**Období:** T14
**Status:** ⏳ Planned

### Přidáno
- [ ] Bug fixes, UX polish
- [ ] RBAC finalizace
- [ ] Zapomenuté heslo
- [ ] Dokumentace
- [ ] Monitoring
- [ ] BETA LAUNCH 🚀
-->
