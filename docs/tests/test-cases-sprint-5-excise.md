# TEST CASES — SPRINT 5: DAŇOVÝ SKLAD (SPOTŘEBNÍ DAŇ)

## ProfiBrew.com | Datum: 26.02.2026

---

## TESTOVACÍ DATA

### Tenant: Pivovar Testovací
- Kategorie: **A** (do 10 000 hl) → sazba **16,00 Kč/°P/hl**
- Excise enabled: **true**
- Plato source: **batch_measurement** (default)
- Loss norm: **1,5 %**

### Sklady
| Sklad | Kód | is_excise_relevant | Kategorie |
|-------|-----|--------------------|-----------|
| Hlavní sklad piva | S-PIVO | ✅ true | Pivo |
| Sklad surovin | S-SUR | ❌ false | Suroviny |
| Expedice | S-EXP | ❌ false | Pivo |

### Várky
| Batch | Recept | OG (°P) | Objem (L) | Objem (hl) |
|-------|--------|---------|-----------|------------|
| V-2026-001 | Ležák 12° | 12,0 | 1 200 | 12,00 |
| V-2026-002 | IPA 14° | 14,5 | 800 | 8,00 |
| V-2026-003 | Wheat 10° | 10,0 | 500 | 5,00 |

### Položky
| Položka | is_excise_relevant | Typ |
|---------|-------------------|-----|
| Světlý ležák 12° | ✅ true | Výrobní |
| IPA 14° | ✅ true | Výrobní |
| Plzeňský slad | ❌ false | Surovina |

---

## A. NASTAVENÍ (Settings)

### TC-A01: Zobrazení excise settings
**Prereq:** Přihlášený uživatel
**Kroky:** Settings → Spotřební daň
**Očekáváno:** Formulář s poli: Evidence (toggle), Kategorie (A-E), Daňový bod, Zdroj °P, Norma ztrát

### TC-A02: Změna kategorie pivovaru
**Kroky:** Změnit kategorii z A na B → Uložit
**Očekáváno:** Uloženo, readonly tabulka sazeb ukazuje sazbu 19,20 Kč pro kat. B

### TC-A03: Vypnutí evidence
**Kroky:** Toggle "Evidence spotřební daně" → OFF → Uložit
**Očekáváno:** Sidebar položky "Daňové pohyby" a "Měsíční podání" jsou viditelné ale modul nefunguje (hooky nevytvářejí excise movements)

### TC-A04: Readonly tabulka sazeb
**Kroky:** Settings → Spotřební daň → sekce Aktuální sazby
**Očekáváno:** Tabulka kategorií A-E se sazbami. Needitovatelná. Kategorie pivovaru zvýrazněná.

### TC-A05: Změna zdroje stupňovitosti
**Kroky:** Přepnout "Zdroj °P" z Měření na Recepturu → Uložit
**Očekáváno:** Nové excise pohyby budou brát °P z recipe.og místo batch.ogActual

---

## B. AUTOMATICKÉ GENEROVÁNÍ — PŘÍJEMKY (production_in)

### TC-B01: Příjemka na excise sklad z výroby → excise movement
**Prereq:** V-2026-001 (12°P, 1200L), sklad S-PIVO (excise=true)
**Kroky:** Vytvořit příjemku: typ=receipt, purpose=production_in, sklad=S-PIVO, položka=Světlý ležák 12°, qty=1200L → Potvrdit
**Očekáváno:**
- Excise movement vytvořen automaticky
- movement_type = **production**
- direction = **in**
- volume_hl = **12,00**
- plato = **12,0** (z batch measurement)
- tax_amount = **0** (výroba = bez daně)
- status = **confirmed**
- batch_id = V-2026-001
- stock_issue_id = kód příjemky
- period = aktuální měsíc (YYYY-MM)

### TC-B02: Příjemka na NE-excise sklad → žádný excise movement
**Prereq:** Sklad S-EXP (excise=false)
**Kroky:** Příjemka production_in na S-EXP, qty=500L → Potvrdit
**Očekáváno:** Žádný excise movement nevznikne

### TC-B03: Příjemka s ne-excise položkou → nezapočítá se
**Prereq:** Sklad S-PIVO (excise=true), položka "Plzeňský slad" (is_excise_relevant=false)
**Kroky:** Příjemka purchase na S-PIVO s Plzeňským sladem → Potvrdit
**Očekáváno:** Žádný excise movement (purchase purpose + ne-excise položka)

### TC-B04: Příjemka purchase na excise sklad → žádný excise movement
**Prereq:** Sklad S-PIVO (excise=true), položka excise-relevant
**Kroky:** Příjemka s purpose=purchase → Potvrdit
**Očekáváno:** Žádný excise movement (nákup není daňově relevantní typ příjmu)

### TC-B05: Příjemka transfer na excise sklad → transfer_in
**Kroky:** Příjemka purpose=transfer na S-PIVO, Světlý ležák 12°, 500L → Potvrdit
**Očekáváno:** Excise movement type=transfer_in, direction=in, volume_hl=5,00, tax_amount=0

---

## C. AUTOMATICKÉ GENEROVÁNÍ — VÝDEJKY (release, destruction)

### TC-C01: Výdejka prodej z excise skladu → release s daní
**Prereq:** S-PIVO (excise=true), Světlý ležák 12° na skladě
**Kroky:** Výdejka purpose=sale z S-PIVO, qty=300L → Potvrdit
**Očekáváno:**
- Excise movement vytvořen
- movement_type = **release**
- direction = **out**
- volume_hl = **3,00**
- plato = **12,0**
- tax_rate = **16,00** (snapshot)
- **tax_amount = 3,00 × 12,0 × 16,00 = 576,00 Kč**
- status = confirmed

### TC-C02: Výdejka odpis z excise skladu → destruction
**Kroky:** Výdejka purpose=waste z S-PIVO, qty=50L → Potvrdit
**Očekáváno:** Excise movement type=destruction, direction=out, volume_hl=0,50, tax_amount=0

### TC-C03: Výdejka transfer z excise skladu → transfer_out
**Kroky:** Výdejka purpose=transfer z S-PIVO, qty=200L → Potvrdit
**Očekáváno:** Excise movement type=transfer_out, direction=out, volume_hl=2,00, tax_amount=0

### TC-C04: Výdejka prodej z NE-excise skladu → žádný excise movement
**Kroky:** Výdejka purpose=sale z S-EXP (excise=false) → Potvrdit
**Očekáváno:** Žádný excise movement

### TC-C05: Výdejka s mixem excise a ne-excise položek
**Prereq:** S-PIVO, výdejka se dvěma řádky: Světlý ležák (excise=true, 300L) + Plzeňský slad (excise=false, 50kg)
**Kroky:** Potvrdit výdejku
**Očekáváno:** Excise movement pouze z excise-relevant položek. volume_hl = 3,00 (jen pivo)

### TC-C06: Daň se počítá jen pro release
**Kroky:** Vytvořit 3 pohyby: production (in), release (out), loss (out)
**Ověřit:** tax_amount > 0 POUZE na release. Production a loss mají tax_amount = 0.

---

## D. STORNO → EXCISE ADJUSTMENT

### TC-D01: Storno potvrzené příjemky → excise protipohyb
**Prereq:** Příjemka na S-PIVO potvrzena → excise movement type=production, direction=in, 12 hl
**Kroky:** Stornovat příjemku (cancelStockIssue)
**Očekáváno:**
- Nový excise movement vytvořen
- movement_type = **adjustment**
- direction = **out** (opačný k originálu)
- volume_hl = **12,00** (stejný objem)
- description obsahuje "Storno"
- Původní excise movement NEZMAZÁN

### TC-D02: Storno potvrzené výdejky (release) → excise protipohyb
**Prereq:** Výdejka sale z S-PIVO potvrzena → excise movement type=release, direction=out, 3 hl, tax=576 Kč
**Kroky:** Stornovat výdejku
**Očekáváno:**
- Nový excise movement: type=adjustment, direction=in, volume=3,00 hl
- tax_amount = **-576,00 Kč** (záporná daň = vrácení)

### TC-D03: Storno dokladu na ne-excise skladu → žádný excise efekt
**Kroky:** Stornovat doklad na S-EXP
**Očekáváno:** Žádný nový excise movement

---

## E. PACKAGING LOSS → EXCISE LOSS

### TC-E01: Stáčení se ztrátou → excise loss
**Prereq:** V-2026-001, actual_volume=1200L, stočeno celkem 1170L → packaging_loss_l = 30L
**Kroky:** Uložit stáčení s 30L ztrátou (batch na excise-relevant skladu)
**Očekáváno:**
- Excise movement vytvořen
- type = **loss**
- direction = **out**
- volume_hl = **0,30**
- plato = 12,0
- tax_amount = **0** (ztráta v normě = bez daně)

### TC-E02: Stáčení bez ztráty → žádný excise loss
**Prereq:** packaging_loss_l = 0 (nebo záporné = přebytek)
**Očekáváno:** Žádný excise movement type=loss

### TC-E03: Stáčení na ne-excise skladu → žádný excise loss
**Prereq:** Batch na skladu S-EXP (excise=false)
**Očekáváno:** Žádný excise movement

---

## F. STUPŇOVITOST (PLATO RESOLUTION)

### TC-F01: Plato z batch measurement (default)
**Prereq:** Settings: plato_source=batch_measurement, Batch ogActual=12,3
**Očekáváno:** Excise movement plato = 12,3, plato_source = "batch_measurement"

### TC-F02: Plato z receptury
**Prereq:** Settings: plato_source=recipe, Batch recipe.og=12,0, ogActual=12,3
**Očekáváno:** Excise movement plato = 12,0 (z receptury, ne z měření)

### TC-F03: Fallback — batch measurement chybí → recipe
**Prereq:** Settings: plato_source=batch_measurement, Batch ogActual=NULL, recipe.og=12,0
**Očekáváno:** plato = 12,0 (fallback na recepturu)

### TC-F04: Plato manual mode → NULL
**Prereq:** Settings: plato_source=manual
**Očekáváno:** plato = NULL, uživatel doplní ručně na excise pohybu

### TC-F05: Doklad bez batch → plato z item
**Prereq:** Výdejka bez batchId, ale item.plato=11,5
**Očekáváno:** plato = 11,5

---

## G. SAZBA (RATE LOOKUP)

### TC-G01: Sazba pro kategorii A
**Prereq:** Tenant kategorie=A
**Očekáváno:** rate = 16,00 Kč/°P/hl

### TC-G02: Snapshot sazby na pohybu
**Kroky:**
1. Vytvořit excise movement (sazba 16,00)
2. Změnit kategorii tenanta na B (sazba 19,20)
3. Zkontrolovat existující pohyb
**Očekáváno:** Existující pohyb stále ukazuje 16,00 (snapshot, neměnit zpětně)

### TC-G03: Seed sazby existují
**Kroky:** SELECT * FROM excise_rates WHERE tenant_id IS NULL
**Očekáváno:** 5 řádků (kategorie A-E), is_active=true, valid_from='2024-01-01', valid_to=NULL

---

## H. BROWSER DAŇOVÝCH POHYBŮ

### TC-H01: Zobrazení browseru
**Kroky:** Navigace → Sklad → Daňové pohyby
**Očekáváno:** DataBrowser se sloupci: Datum, Typ, Směr, Objem (hl), °P, Daň, Várka, Doklad, Sklad, Stav

### TC-H02: Quick filtr — Příjmy
**Kroky:** Klik na "Příjmy"
**Očekáváno:** Jen pohyby s direction=in (production, transfer_in, adjustment in)

### TC-H03: Quick filtr — Výdeje
**Kroky:** Klik na "Výdeje"
**Očekáváno:** Jen pohyby s direction=out

### TC-H04: Quick filtr — Tento měsíc
**Očekáváno:** Jen pohyby s period = aktuální YYYY-MM

### TC-H05: Quick filtr — Minulý měsíc
**Očekáváno:** Jen pohyby s period = předchozí YYYY-MM

### TC-H06: Link na várku
**Kroky:** Klik na batch_number v řádku
**Očekáváno:** Navigace na /brewery/batches/[batchId]

### TC-H07: Link na skladový doklad
**Kroky:** Klik na stock_issue code v řádku
**Očekáváno:** Navigace na /stock/movements/[stockIssueId]

---

## I. DETAIL DAŇOVÉHO POHYBU

### TC-I01: Detail auto-generated pohybu — omezená editace
**Prereq:** Excise movement vytvořený automaticky z confirmStockIssue
**Kroky:** Otevřít detail
**Očekáváno:**
- Info "Automaticky vygenerováno ze skladového dokladu"
- **Editovatelné:** plato, notes
- **Readonly:** datum, typ, objem, sazba, daň, várka, doklad, sklad

### TC-I02: Ruční pohyb (adjustment) — plná editace
**Kroky:** Browser → "+ Ruční pohyb" → vyplnit formulář
**Očekáváno:**
- Všechna pole editovatelná
- Typ = adjustment (default)
- Povinná pole: datum, objem, sklad
- Status = draft

### TC-I03: Výpočet daně na detailu
**Kroky:** Vyplnit/změnit: objem=5 hl, plato=12, typ=release
**Očekáváno:** Daň se přepočítá: 5 × 12 × 16,00 = 960,00 Kč (readonly computed)

### TC-I04: Daň = 0 pro ne-release typ
**Kroky:** Typ = production, objem = 10 hl, plato = 12
**Očekáváno:** Daň = 0 Kč (výroba = bez daně)

---

## J. MĚSÍČNÍ PODÁNÍ — GENEROVÁNÍ

### TC-J01: Vygenerovat report za měsíc
**Prereq:** Excise pohyby za březen 2026:
- production in: 12,00 + 8,00 + 5,00 = 25,00 hl
- release out: 3,00 + 2,00 = 5,00 hl (12°P: 3hl, 14°P: 2hl)
- loss out: 0,30 hl
- Opening balance: 0 (první měsíc)

**Kroky:** Měsíční podání → Vygenerovat → vybrat 03/2026
**Očekáváno:**
- opening_balance_hl = 0,00
- production_hl = 25,00
- release_hl = 5,00
- loss_hl = 0,30
- closing_balance_hl = 0 + 25,00 - 5,00 - 0,30 = **19,70**
- status = draft

### TC-J02: Výpočet daně s rozpadem dle °P
**Prereq:** Release pohyby: 3 hl × 12°P + 2 hl × 14°P
**Očekáváno:**
- tax_details JSON:
  - { plato: 12, volume_hl: 3.00, tax: 3×12×16 = 576,00 }
  - { plato: 14, volume_hl: 2.00, tax: 2×14×16 = 448,00 }  
- total_tax = 576 + 448 = **1 024,00 Kč**

### TC-J03: Opening balance = closing balance předchozího měsíce
**Prereq:** Report za 03/2026 s closing=19,70
**Kroky:** Vygenerovat report za 04/2026
**Očekáváno:** opening_balance_hl = 19,70

### TC-J04: Opening balance prvního měsíce = 0
**Prereq:** Žádný předchozí report
**Očekáváno:** opening_balance_hl = 0

### TC-J05: Přegenerování draft reportu
**Prereq:** Draft report za 03/2026 existuje
**Kroky:** Přidat nový excise pohyb za březen → Přegenerovat report
**Očekáváno:** Report aktualizován s novými čísly. Existující report přepsán (upsert).

### TC-J06: Nelze přegenerovat submitted report
**Prereq:** Report za 03/2026 status=submitted
**Kroky:** Pokus o přegenerování
**Očekáváno:** Chyba / tlačítko neaktivní. Nutno nejdřív vrátit do draftu.

### TC-J07: UNIQUE constraint na period
**Kroky:** Pokusit se ručně vytvořit druhý report za 03/2026
**Očekáváno:** DB constraint UNIQUE(tenant_id, period) zabrání

---

## K. MĚSÍČNÍ PODÁNÍ — WORKFLOW A UI

### TC-K01: Status workflow: draft → submitted
**Kroky:** Otevřít draft report → Klik "Odeslat"
**Očekáváno:** Status = submitted, submitted_at nastaveno, submitted_by = current user

### TC-K02: Status workflow: submitted → draft (zpět)
**Kroky:** Otevřít submitted report → Klik "Vrátit do rozpracování"
**Očekáváno:** Status = draft, lze přegenerovat

### TC-K03: Excise movements → status 'reported' po submit
**Prereq:** 5 confirmed excise pohybů za 03/2026
**Kroky:** Submit monthly report za 03/2026
**Očekáváno:** Všech 5 pohybů má status = **reported** (hromadný update)

### TC-K04: Detail reportu — bilance
**Kroky:** Otevřít report detail
**Očekáváno:** Bilance sekce:
```
Počáteční stav:     0,00 hl
+ Výroba:         +25,00 hl
- Propuštění:      -5,00 hl
- Ztráty:          -0,30 hl
Konečný stav:      19,70 hl

DAŇ K ÚHRADĚ:   1 024,00 Kč
```

### TC-K05: Detail reportu — rozpad daně
**Očekáváno:** Tabulka s řádky per °P:
| °P | Objem (hl) | Sazba | Daň (Kč) |
|----|-----------|-------|----------|
| 12 | 3,00 | 16,00 | 576,00 |
| 14 | 2,00 | 16,00 | 448,00 |
| **Celkem** | **5,00** | | **1 024,00** |

### TC-K06: Detail reportu — seznam pohybů
**Očekáváno:** Readonly tabulka všech excise pohybů za období s linky na detail

### TC-K07: Browser podání — sloupce
**Kroky:** Navigace → Měsíční podání
**Očekáváno:** Tabulka: Období, Poč. stav, Výroba, Propuštění, Ztráty, Kon. stav, Daň, Stav

---

## L. BATCH INTEGRACE

### TC-L01: Batch detail — excise info card
**Prereq:** Batch V-2026-001 s excise movement type=production
**Kroky:** Otevřít batch detail
**Očekáváno:** Card "Spotřební daň" s: Objem: 12,00 hl, °P: 12,0, Stav: Evidováno ✅

### TC-L02: Batch excise_status = 'recorded' po production
**Prereq:** Batch completion → auto-příjemka → excise movement
**Očekáváno:** batches.excise_relevant_hl = 12,00, excise_status = 'recorded'

### TC-L03: Batch excise_status = 'reported' po submit reportu
**Prereq:** Monthly report submitted za období s tímto batchem
**Očekáváno:** batches.excise_status = 'reported'

### TC-L04: Excise info card neviditelná pokud excise disabled
**Prereq:** Settings → excise_enabled = false
**Očekáváno:** Card "Spotřební daň" se na batch detailu nezobrazuje

### TC-L05: Link na excise movement z batch detail
**Kroky:** Na excise info card klik na stav
**Očekáváno:** Navigace na excise movement detail

---

## M. NAVIGACE A I18N

### TC-M01: Sidebar — Daňové pohyby
**Kroky:** Sklad → Daňové pohyby
**Očekáváno:** Funkční stránka (ne placeholder)

### TC-M02: Sidebar — Měsíční podání
**Kroky:** Sklad → Měsíční podání
**Očekáváno:** Funkční stránka (ne placeholder)

### TC-M03: i18n CZ — typy pohybů
**Očekáváno:** production=Výroba, release=Propuštění, loss=Ztráta, destruction=Zničení, adjustment=Korekce

### TC-M04: i18n EN — přepnutí jazyka
**Kroky:** Přepnout na EN
**Očekáváno:** Všechny texty v excise modulu anglicky

---

## N. DB & SCHEMA

### TC-N01: RLS na excise_movements
**Kroky:** Query excise_movements bez tenant context
**Očekáváno:** 0 řádků (RLS blokuje)

### TC-N02: RLS na excise_monthly_reports
**Analogicky k TC-N01**

### TC-N03: excise_rates — systémové sazby viditelné
**Kroky:** Query excise_rates (tenant_id IS NULL) s tenant context
**Očekáváno:** Systémové sazby viditelné (RLS policy: tenant_id IS NULL OR = current tenant)

### TC-N04: Index na (tenant_id, period) funguje
**Kroky:** SELECT * FROM excise_movements WHERE tenant_id=X AND period='2026-03'
**Očekáváno:** EXPLAIN ukazuje idx_excise_movements_tenant_period

---

## O. EDGE CASES

### TC-O01: Excise disabled → žádné pohyby
**Prereq:** excise_enabled = false
**Kroky:** Potvrdit příjemku na excise sklad
**Očekáváno:** Žádný excise movement (hook zkontroluje settings a skippne)

### TC-O02: Objem 0 → žádný pohyb
**Prereq:** Příjemka s qty=0 nebo jen ne-excise položky
**Očekáváno:** volumeHl = 0 → early return, žádný excise movement

### TC-O03: Chybějící sazba
**Prereq:** Smazat/deaktivovat excise_rates pro kat. A
**Kroky:** Potvrdit výdejku
**Očekáváno:** rate = null → tax_rate = 0, tax_amount = 0 (graceful degradation, ne error)

### TC-O04: L → hl konverze a zaokrouhlení
**Kroky:** Příjemka 1 234,567 L
**Očekáváno:** volume_hl = 12,35 (2 des. místa)

### TC-O05: Více excise-relevant položek na jednom dokladu
**Prereq:** Výdejka s 2 excise položkami: 300L (12°P) + 200L (14°P)
**Očekáváno:** Jeden excise movement s celkovým objemem 5,00 hl. Plato z prvního batche nebo dle priority.

### TC-O06: Period odvozený správně z date
**Kroky:** Excise movement date = '2026-03-15'
**Očekáváno:** period = '2026-03' (substring 0-7)

### TC-O07: Duplicitní storno
**Kroky:** Stornovat doklad, který byl už stornován
**Očekáváno:** cancelStockIssue blokuje (status !== confirmed). Žádný duplicitní excise adjustment.

### TC-O08: Report pro měsíc bez pohybů
**Kroky:** Vygenerovat report za měsíc kde neproběhl žádný excise pohyb
**Očekáváno:** Report s nulovými hodnotami, closing = opening, total_tax = 0

---

## P. E2E INTEGRAČNÍ SCÉNÁŘE

### TC-P01: Kompletní lifecycle — výroba → prodej → report
1. Settings: excise enabled, kategorie A, plato z měření
2. Batch V-2026-001: OG=12°P, objem=1200L
3. Batch completion → auto-příjemka na S-PIVO (excise) → **excise production in 12,00 hl**
4. Stáčení: 1170L stočeno, loss=30L → **excise loss 0,30 hl**
5. Objednávka: 300L Ležáku → výdejka z S-PIVO → confirm → **excise release 3,00 hl, daň=576 Kč**
6. Vygenerovat monthly report:
   - Opening: 0
   - Production: 12,00
   - Release: 3,00
   - Loss: 0,30
   - Closing: **8,70**
   - Tax: **576,00 Kč**
7. Submit report → excise pohyby status = reported, batch excise_status = reported

### TC-P02: Storno výdejky po vygenerování reportu
1. Existuje submitted report za 03/2026
2. Vrátit report do draftu
3. Stornovat výdejku (release) → excise adjustment (direction=in, tax=-576)
4. Přegenerovat report → release_hl klesne, tax klesne, closing se zvýší
5. Re-submit

### TC-P03: Dva pivovary (multi-tenant izolace)
1. Tenant A: kategorie A (16 Kč), excise pohyby
2. Tenant B: kategorie B (19,20 Kč), excise pohyby
3. Ověřit: Tenant A nevidí pohyby Tenant B (RLS)
4. Ověřit: Sazby se aplikují správně per tenant

### TC-P04: Přepnutí pricing mode uprostřed měsíce
1. Plato source = batch_measurement → pohyb s °P z měření
2. Změnit na recipe → nový pohyb s °P z receptury
3. Report: oba pohyby jsou v jednom reportu, rozpad daně dle skutečných °P na pohybech (snapshot)

---

## SUMÁŘ

| Kategorie | Počet TC |
|-----------|---------|
| A. Nastavení | 5 |
| B. Auto-generování příjemky | 5 |
| C. Auto-generování výdejky | 6 |
| D. Storno | 3 |
| E. Packaging loss | 3 |
| F. Stupňovitost | 5 |
| G. Sazba | 3 |
| H. Browser pohybů | 7 |
| I. Detail pohybu | 4 |
| J. Měsíční podání generování | 7 |
| K. Měsíční podání workflow/UI | 7 |
| L. Batch integrace | 5 |
| M. Navigace & i18n | 4 |
| N. DB & Schema | 4 |
| O. Edge cases | 8 |
| P. E2E integrace | 4 |
| **CELKEM** | **85** |
