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

<!--
## [0.2.0] — Sprint 2: Výroba
**Období:** T5-T7
**Status:** ⏳ Planned

### Přidáno
- [ ] Recipes — CRUD, suroviny, kroky, rmutovací profily, kalkulace
- [ ] Batches — CRUD, status workflow, kroky vaření, měření
- [ ] Bottling — stáčení šarží do prodejních položek
- [ ] Batch notes
- [ ] Beer styles (BJCP seed data)

---

## [0.3.0] — Sprint 3: Sklad
**Období:** T8-T9
**Status:** ⏳ Planned

### Přidáno
- [ ] Warehouses — CRUD, daňový/nedaňový
- [ ] Stock issues — příjemky, výdejky, řádky, potvrzení
- [ ] Stock movements — atomické pohyby, FIFO alokace
- [ ] Stock status — materializovaný stav skladu
- [ ] Material lots — lot tracking surovin
- [ ] Batch ↔ lot vazba

---

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
