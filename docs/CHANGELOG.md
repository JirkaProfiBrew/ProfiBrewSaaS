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

### Architektonická rozhodnutí
- Unit system: `toBaseFactor = null` → IS the base unit (kg), not "assume grams"
- No scaleFactor: snapshot recipe items are the source of truth, amounts used directly
- Material issue flow: always draft → review → confirm (no direct confirm)
- VPN: `additionalCost` na hlavičce se stává computed cache = SUM(receipt_costs.amount), již se needituje ručně
- VPN: recalculate engine běží MIMO transakci (PostgreSQL aborted transaction pattern)
- VPN: `fullUnitPrice` jde do movements → FIFO alokační engine nepotřebuje žádné změny
- CF z příjemky: automatické generování řízeno nastavením provozovny (shop parameters JSONB)
- Stáčení: auto-generované řádky z prodejních položek — sládek zadává pouze ks, systém dopočítá objem
- Sjednocení naskladnění: bulk i packaged čtou z bottling_items; createProductionReceipt tvoří příjemku z N řádků
- Naskladnění je explicitní akce (tlačítko "Naskladnit"), NE automatický side-effect batch completion
- Batch completion: warning (non-blocking) pokud příjemka neexistuje; user může dokončit i bez naskladnění
- `packaging_loss_l` = actual_volume_l − SUM(bottling ks × base_item_quantity); kladné = ztráta, záporné = přebytek
- Shop settings resolution: default/first active shop → stock_mode + default_warehouse_beer_id

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
