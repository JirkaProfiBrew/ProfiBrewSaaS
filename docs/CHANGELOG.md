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

### Architektonická rozhodnutí
- Lot = příjemkový řádek — žádná duplicitní entita, data se zadávají jednou při příjmu
- remaining_qty je materializovaný — výkon + atomické aktualizace v transakcích
- Pre-alokace pro manual_lot — uživatel vybírá šarže před potvrzením
- Tracking je readonly — browsing nad stock_issue_lines (receipt + confirmed)
- LotTraceabilityView odstraněn — nahrazen alokační historií v LotDetail

---

<!--

## [0.4.0] — Sprint 4: Prodej + Finance
**Období:** T10-T11
**Status:** ⏳ Planned

### Přidáno
- [ ] Orders — CRUD, řádky, zálohy, status workflow
- [ ] Cashflows — příjmy, výdaje, kategorie
- [ ] Cashflow templates — recurring generování
- [ ] Cash desk — pokladna pro taproom

---

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
