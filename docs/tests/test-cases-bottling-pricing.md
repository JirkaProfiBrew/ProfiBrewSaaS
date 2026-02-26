# TEST CASES: Stáčení, naskladnění a cenotvorba piva

## ProfiBrew.com | 4 pokyns — kompletní testovací sada
### Datum: 25.02.2026

---

## TESTOVACÍ DATA (setup)

### Provozovna (Shop)
```
Pivovar Testovací — default, active
Settings:
  stock_mode: "bulk" (přepnout na "packaged" pro packaged testy)
  default_warehouse_beer_id: "Sklad piva" (is_excise_relevant=true)
  ingredient_pricing_mode: "calc_price"
  beer_pricing_mode: "recipe_calc"
  overhead_pct: 20
  overhead_czk: 2000
  brew_cost_czk: 1800
```

### Položky (Items)
```
BASE ITEM:
  Ležák 12° — is_production_item=true, unit=L, cost_price=30.00

CHILD ITEMS (base_item_id → Ležák 12°):
  Ležák 12° lahev 0,5L — base_item_quantity=0.5, packaging_cost=3.50, filling_cost=2.00
  Ležák 12° KEG 30L    — base_item_quantity=30, packaging_cost=0, filling_cost=50.00
  Ležák 12° PET 1,5L   — base_item_quantity=1.5, packaging_cost=5.00, filling_cost=3.00

SUROVINY:
  Plzeňský slad  — cost_price=15 Kč/kg, avg_price=14.50 Kč/kg
  Žatecký chmel  — cost_price=350 Kč/kg, avg_price=340 Kč/kg
  Safale US-05   — cost_price=90 Kč/ks, avg_price=85 Kč/ks
```

### Recept
```
Ležák 12° — batchSizeL=150, shelf_life_days=180
Suroviny:
  Plzeňský slad  — 40 kg × 15 Kč = 600 Kč
  Žatecký chmel  — 0.5 kg × 350 Kč = 175 Kč
  Safale US-05   — 1 ks × 90 Kč = 90 Kč
Celkem suroviny = 865 Kč
```

### Várka
```
V-2026-010 — recipeId → kopie receptu Ležák 12°, itemId → Ležák 12°
actual_volume_l: 150
Status: conditioning
```

---

## POKYN 1: EXPLICITNÍ NASKLADNĚNÍ

### TC-1.1: Shop settings resolution

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.1.1 | getShopSettingsForBatch() — default shop existuje | tenant má 1 shop (isDefault=true) | Vrátí settings tohoto shopu |
| 1.1.2 | getShopSettingsForBatch() — žádný default | tenant má 2 shopy, žádný isDefault | Vrátí settings prvního aktivního |
| 1.1.3 | getShopSettingsForBatch() — žádný shop | tenant nemá žádnou provozovnu | Vrátí stock_mode='none' |
| 1.1.4 | getShopSettingsForBatch() — neaktivní shop | tenant má 1 shop (isActive=false) | Vrátí stock_mode='none' |

### TC-1.2: Tab Stáčení — BULK mód auto-generování

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.2.1 | Otevření tabu Stáčení | stock_mode='bulk', batch.itemId='Ležák 12°' | 1 řádek: Ležák 12°, množství předvyplněno z actual_volume_l=150 |
| 1.2.2 | Editace množství bulk | User změní 150 → 148 | Množství se uloží, base_units=148 |
| 1.2.3 | Otevření tabu Stáčení | stock_mode='none' | Hlášku "Naskladnění vypnuto" + link na Settings |
| 1.2.4 | Otevření tabu Stáčení | stock_mode='packaged' | N řádků dle child items (lahev, KEG, PET) |

### TC-1.3: Tab Stáčení — PACKAGED mód auto-generování

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.3.1 | Otevření tabu | stock_mode='packaged', base_item má 3 child items | 3 řádky: lahev 0,5L, KEG 30L, PET 1,5L — kusy=0 |
| 1.3.2 | Vyplnění kusů | lahev=200, KEG=2, PET=0 | Objem: 200×0.5 + 2×30 + 0 = 160 L |
| 1.3.3 | Žádné child items | base item nemá child items | Prázdná tabulka, info "Žádné prodejní položky" |

### TC-1.4: Sumář stáčení

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.4.1 | Sumář — bulk | Stočeno 148L, actual_volume=150, recipe batchSize=150 | Stočeno: 148L, Z receptury: 150L, Z tanku: 150L, Rozdíl: -2L (ztráta) |
| 1.4.2 | Sumář — ztráta | Stočeno 148L, actual_volume=150 | packaging_loss_l = 150 - 148 = 2 (kladné = ztráta) |
| 1.4.3 | Sumář — přebytek | Stočeno 152L, actual_volume=150 | packaging_loss_l = 150 - 152 = -2 (záporné = přebytek) |
| 1.4.4 | Sumář — packaged | lahev=200 (100L), KEG=2 (60L) | Stočeno: 160L, Z tanku: 150L, Rozdíl: +10L |

### TC-1.5: Tlačítko "Naskladnit" — stavy

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.5.1 | Stáčení nevyplněno | Žádné bottling_items uloženy | Disabled, tooltip "Nejdříve vyplňte a uložte stáčení" |
| 1.5.2 | Stáčení uloženo, příjemka neexistuje | bottling_items uloženy, žádná receipt | **AKTIVNÍ** tlačítko "Naskladnit" |
| 1.5.3 | Příjemka existuje | receipt confirmed pro tuto batch | Tlačítko skryté, info box s linkem na příjemku |
| 1.5.4 | Příjemka stornovaná | receipt cancelled | **AKTIVNÍ** tlačítko (cancelled se nepočítá) |

### TC-1.6: createProductionReceipt() — bulk

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.6.1 | Úspěšné naskladnění | bulk, 148L, warehouse="Sklad piva" | Příjemka (receipt, production_in), 1 řádek, qty=148, status=confirmed |
| 1.6.2 | Warehouse z settings | shop.default_warehouse_beer_id="Sklad piva" | Příjemka ve skladu "Sklad piva" |
| 1.6.3 | Warehouse fallback | shop nemá default_warehouse_beer_id | Příjemka v prvním aktivním skladu |
| 1.6.4 | Duplicitní kontrola | Klik "Naskladnit" 2× rychle za sebou | Druhé volání → chyba "Příjemka již existuje" |
| 1.6.5 | Stock status | Po naskladnění | stock_status aktualizován (+148L na skladě) |

### TC-1.7: onBatchCompleted() — žádná automatika

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.7.1 | Přechod na completed bez příjemky | batch bez naskladnění → "Ukončit" | Warning dialog: "Várka nemá naskladněné pivo. Ukončit přesto?" |
| 1.7.2 | Potvrzení warning | User klikne "Ukončit přesto" | Batch status → completed, žádná příjemka nevznikne |
| 1.7.3 | Přechod na completed s příjemkou | batch s receipt → "Ukončit" | Bez warning, rovnou completed |
| 1.7.4 | Zrušení warning | User klikne "Zrušit" | Batch zůstává v předchozím stavu |

### TC-1.8: Oprava stáčení po naskladnění

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 1.8.1 | Uložit stáčení — locked | Existuje potvrzená příjemka | "Uložit" disabled, tooltip "Stornujte příjemku pro úpravu" |
| 1.8.2 | Storno příjemky → unlock | User stornuje příjemku | Tab Stáčení: "Uložit" aktivní, tlačítko "Naskladnit" aktivní |
| 1.8.3 | Oprava + znovu naskladnění | Storno → editace 148→145 → Uložit → Naskladnit | Nová příjemka s qty=145 |

---

## POKYN 2: ŠARŽE, EXPIRACE, VÝROBNÍ CENA

### TC-2.1: Šarže (lot_number)

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.1.1 | Nová várka — auto lot_number | batchNumber = "V-2026-010" | lot_number = "V2026010" |
| 2.1.2 | Editace lot_number | User změní "V2026010" → "LOT2026A" | Uloženo "LOT2026A" |
| 2.1.3 | Lot_number na příjemce | Naskladnění batch s lot_number="V2026010" | stock_issue_lines.lot_number = "V2026010" na všech řádcích |
| 2.1.4 | Backfill migrace | Existující batch "V-2025-005" bez lot_number | Po migraci: lot_number = "V2025005" |
| 2.1.5 | Lot_number editovatelný po naskladnění | Batch s receipt | Pole lot_number na hlavičce zůstává editovatelné |

### TC-2.2: Expirace — recipe shelf_life_days

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.2.1 | Recept — nové pole | Otevřít detail receptu | Pole "Trvanlivost (dny)" v sekci Základní informace |
| 2.2.2 | Uložení shelf_life_days | Zadat 180, uložit | recipe.shelf_life_days = 180 |
| 2.2.3 | Kopírování do batch snapshotu | Vytvořit várku z receptu s shelf_life=180 | Kopie receptu má shelf_life_days=180 |
| 2.2.4 | Editace na kopii | Změnit shelf_life na kopii 180→90 | recipe.shelf_life_days=90 na kopii, originál nezměněn |
| 2.2.5 | Shelf life nevyplněn | recipe.shelf_life_days=NULL | Expirace na stáčení zobrazí "—" |

### TC-2.3: Datum stočení (bottled_date)

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.3.1 | Default hodnota | Otevřít tab Stáčení poprvé | bottled_date = today |
| 2.3.2 | Editace data | Změnit na 2026-03-10 | Uloženo batches.bottled_date = 2026-03-10 |
| 2.3.3 | Datum v budoucnosti | Zadat 2026-12-31 | Warning "Datum stočení je v budoucnosti" (neblokuje) |
| 2.3.4 | Uložení s bottling items | Klik "Uložit" s bottled_date + řádky | Obojí uloženo v jednom save |

### TC-2.4: Expirace na řádcích stáčení

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.4.1 | Výpočet expirace | bottled_date=2026-03-15, shelf_life=180 | Expirace = 2026-09-11 |
| 2.4.2 | Změna bottled_date → přepočet | Změnit bottled_date 2026-03-15 → 2026-03-20 | Expirace se změní na 2026-09-16 |
| 2.4.3 | Shelf life NULL | recipe.shelf_life_days=NULL | Expirace sloupec = "—" |
| 2.4.4 | Expirace readonly | Pokus kliknout na expirace buňku | Needitovatelné |

### TC-2.5: Expirace na příjemce

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.5.1 | Přenos do příjemky | bottled_date=2026-03-15, shelf_life=180 | stock_issue_lines.expiry_date = 2026-09-11 |
| 2.5.2 | Shelf life NULL → příjemka | recipe.shelf_life_days=NULL | stock_issue_lines.expiry_date = NULL |
| 2.5.3 | Natvrdo uložené | Po naskladnění změnit shelf_life na receptu 180→90 | Existující příjemka stále má 2026-09-11 (nezmění se) |

### TC-2.6: Výrobní cena — režim fixed

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.6.1 | Fixed price | beer_pricing_mode='fixed', item.cost_price=30 | unit_price=30 Kč/L |
| 2.6.2 | Fixed — item bez ceny | item.cost_price=NULL | unit_price=NULL → příjemka bez ceny |
| 2.6.3 | Zobrazení na stáčení | Fixed mód | "Výrobní cena: 30,00 Kč/L (dle skladové karty)" |

### TC-2.7: Výrobní cena — režim recipe_calc

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.7.1 | Recipe calc — basic | recipe.costPrice=4838, recipe.batchSizeL=150 | unit_price = 4838/150 = 32,25 Kč/L |
| 2.7.2 | Recipe calc — recept bez kalkulace | recipe.costPrice=NULL | unit_price=NULL |
| 2.7.3 | Recipe calc — batchSizeL=0 | recipe.batchSizeL=0 | unit_price=NULL (dělení nulou ošetřeno) |
| 2.7.4 | Zobrazení na stáčení | recipe_calc mód | "Výrobní cena: 32,25 Kč/L (dle kalkulace receptu)" |

### TC-2.8: Cena na příjemce — bulk

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 2.8.1 | Unit price přenos | unit_price=32.25, qty=148 | lines.unit_price=32.25, lines.total_cost=4773.00 |
| 2.8.2 | Datum příjemky | bottled_date=2026-03-15 | stock_issues.date = 2026-03-15 (ne datum kliknutí) |

---

## POKYN 3: KALKULACE RECEPTU — OVERHEAD

### TC-3.1: Zdroj ceny surovin (ingredient_pricing_mode)

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 3.1.1 | calc_price | mode='calc_price', slad.cost_price=15 | Cena sladu = 15 Kč/kg |
| 3.1.2 | avg_stock | mode='avg_stock', slad.avg_price=14.50 | Cena sladu = 14,50 Kč/kg |
| 3.1.3 | last_purchase | mode='last_purchase', poslední příjemka sladu unit_price=14.80 | Cena sladu = 14,80 Kč/kg |
| 3.1.4 | last_purchase — žádná příjemka | mode='last_purchase', item nemá příjemku | Fallback na items.cost_price |
| 3.1.5 | avg_stock — NULL | mode='avg_stock', items.avg_price=NULL | Fallback na items.cost_price |
| 3.1.6 | calc_price — NULL | mode='calc_price', items.cost_price=NULL | price=NULL, ingredient cost=0 |

### TC-3.2: Overhead výpočet

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 3.2.1 | Plná kalkulace | ingredientsCost=865, overhead_pct=20, brew_cost=1800, overhead_czk=2000 | ingredientOverhead=173, total=865+173+1800+2000 = **4838 Kč** |
| 3.2.2 | Cost per liter | totalProductionCost=4838, batchSizeL=150 | costPerLiter = 32,25 Kč/L |
| 3.2.3 | Nulové overhead | overhead_pct=0, brew_cost=0, overhead_czk=0 | totalProductionCost = ingredientsCost = 865 |
| 3.2.4 | Jen overhead_pct | overhead_pct=20, brew_cost=0, overhead_czk=0 | total = 865 + 173 = 1038 |
| 3.2.5 | Jen fix náklady | overhead_pct=0, brew_cost=1800, overhead_czk=2000 | total = 865 + 0 + 1800 + 2000 = 4665 |
| 3.2.6 | Beze surovin | ingredientsCost=0, overhead_pct=20, brew_cost=1800 | ingredientOverhead=0, total=1800+2000 = 3800 |

### TC-3.3: calculateAll() — zpětná kompatibilita

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 3.3.1 | Bez overhead parametru | calculateAll(ingredients, 150) | Funguje beze změny, total = ingredientsCost |
| 3.3.2 | S overhead parametrem | calculateAll(ingredients, 150, undefined, {overheadPct:20, ...}) | total = ingredientsCost + overhead |
| 3.3.3 | result.costPrice alias | Po kalkulaci s overhead | result.costPrice === result.totalProductionCost |

### TC-3.4: calculateAndSaveRecipe() — server action

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 3.4.1 | Save recipe costPrice | Přepočítat recept s overhead=20%, var=1800, režie=2000 | recipes.costPrice = "4838" (plná výrobní cena) |
| 3.4.2 | Save calculation snapshot | Přepočítat | recipe_calculations.data obsahuje ingredientsCost, ingredientOverheadCost, brewCost, overheadCost, totalProductionCost |
| 3.4.3 | Shop settings loading | Přepočítat | Načte overhead_pct, overhead_czk, brew_cost_czk z default shopu |
| 3.4.4 | Žádný shop | Tenant bez shopu | overhead = 0, jen ingredientsCost |
| 3.4.5 | Pricing mode propagace | ingredient_pricing_mode='avg_stock' | result.pricingMode = 'avg_stock', ceny z avg_price |

### TC-3.5: UI — RecipeCalculation zobrazení

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 3.5.1 | Tabulka surovin | 3 suroviny s cenami | Slad 600, Chmel 175, Kvasnice 90 — beze změny (client-side) |
| 3.5.2 | Overhead řádky — po přepočtu | recipe_calculations.data má overhead pole | Zobrazí: Režie suroviny (20%) 173, Náklady var 1800, Režie 2000 |
| 3.5.3 | Overhead řádky — starší data | recipe_calculations.data bez overhead polí | Overhead řádky se nezobrazí, jen Suroviny celkem |
| 3.5.4 | Sumář | Po přepočtu | "Výrobní cena várky: 4 838 Kč" + "Výrobní cena za litr: 32,25 Kč/L" |
| 3.5.5 | Zdroj cen | pricingMode='avg_stock' | Zobrazí "Zdroj cen surovin: Průměrná skladová cena" |
| 3.5.6 | Přepočet button | Klik "Přepočítat" | Zavolá calculateAndSaveRecipe(), refreshne data |

### TC-3.6: Dopad na naskladnění (integrace s pokynem 2)

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 3.6.1 | recipe_calc po přepočtu | beer_pricing_mode='recipe_calc', recipe.costPrice=4838, batchSizeL=150 | Naskladnění: unit_price=32,25 Kč/L (včetně režií) |
| 3.6.2 | recipe_calc bez přepočtu | recipe.costPrice=865 (jen suroviny, nepřepočteno) | Naskladnění: unit_price=5,77 Kč/L (jen suroviny!) |

---

## POKYN 4: PACKAGED ITEM PRICING

### TC-4.1: DB & Item Detail — nová pole

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 4.1.1 | Viditelnost polí | isSaleItem=true, baseItemId=Ležák 12° | Pole "Cena obalu" a "Cena stočení" viditelné |
| 4.1.2 | Skrytí polí — není child | isSaleItem=true, baseItemId=NULL | Pole skrytá |
| 4.1.3 | Skrytí polí — není sale | isSaleItem=false | Pole skrytá |
| 4.1.4 | Uložení | packaging_cost=3.50, filling_cost=2.00 | Uloženo do items tabulky |
| 4.1.5 | Load | Otevřít existující item s packaging_cost=3.50 | Pole předvyplněná |
| 4.1.6 | NULL hodnoty | packaging_cost=NULL, filling_cost=NULL | Pole prázdná, výpočet = 0+0 |

### TC-4.2: Computed výrobní cena na Item detailu

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 4.2.1 | Lahev 0,5L | base cost=30 Kč/L, qty=0.5, pkg=3.50, fill=2.00 | 30×0.5 + 3.50 + 2.00 = **20,50 Kč** |
| 4.2.2 | KEG 30L | base cost=30 Kč/L, qty=30, pkg=0, fill=50.00 | 30×30 + 0 + 50 = **950,00 Kč** |
| 4.2.3 | PET 1,5L | base cost=30 Kč/L, qty=1.5, pkg=5.00, fill=3.00 | 30×1.5 + 5 + 3 = **53,00 Kč** |
| 4.2.4 | Base item bez cost_price | baseItem.cost_price=NULL | Pivo=0, celkem = 0+3.50+2.00 = 5,50 Kč |
| 4.2.5 | Vše NULL | pkg=NULL, fill=NULL, base cost=30, qty=0.5 | 30×0.5 + 0 + 0 = 15,00 Kč |
| 4.2.6 | Dynamický přepočet | Změnit packaging_cost 3.50→4.00 | Info box se okamžitě přepočte na 20×0.5+4+2 = 21,00 |
| 4.2.7 | Vzorec v info boxu | Lahev 0,5L kompletní | "30,00 × 0,5 L + 3,50 + 2,00 = 20,50 Kč" |

### TC-4.3: Tab Stáčení — packaged mód, sloupce

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 4.3.1 | Sloupce řádku | Packaged mód | Položka, Kusy, Objem, Pivo, Obal, Stočení, Cena/ks, Celkem, Expirace |
| 4.3.2 | Lahev 200 ks | beer=32.25/L, qty=0.5, pkg=3.50, fill=2.00, kusy=200 | Pivo=16.13, Obal=3.50, Stočení=2.00, Cena/ks=21.63, Celkem=4326.00 |
| 4.3.3 | KEG 2 ks | beer=32.25/L, qty=30, pkg=0, fill=50, kusy=2 | Pivo=967.50, Obal=0, Stočení=50, Cena/ks=1017.50, Celkem=2035.00 |
| 4.3.4 | PET 0 ks | kusy=0 | Cena/ks computed, Celkem=0 |
| 4.3.5 | Beer price — recipe_calc | beer_pricing_mode='recipe_calc' | beerCostPerLiter z recipe.costPrice/batchSizeL = 32.25 |
| 4.3.6 | Beer price — fixed | beer_pricing_mode='fixed' | beerCostPerLiter z baseItem.cost_price = 30.00 |

### TC-4.4: Tab Stáčení — packaged sumář

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 4.4.1 | Celkový objem | lahev=200 (100L), KEG=2 (60L), PET=0 | Stočeno celkem: 160,0 L |
| 4.4.2 | Celková hodnota | lahev=4326, KEG=2035, PET=0 | Celková hodnota: 6 361,00 Kč |
| 4.4.3 | Rozdíl objemu | Stočeno 160L, actual_volume=150 | Rozdíl: +10L 🔴 (přebytek/chyba) |

### TC-4.5: Naskladnění — packaged mód

| # | Akce | Vstup | Očekávaný výsledek |
|---|------|-------|--------------------|
| 4.5.1 | Počet řádků příjemky | lahev=200, KEG=2, PET=0 | 2 řádky (PET s qty=0 se vynechá) |
| 4.5.2 | Řádek lahev | itemId=Lahev 0,5L, qty=200, unitPrice=21.63 | total_cost=4326.00 |
| 4.5.3 | Řádek KEG | itemId=KEG 30L, qty=2, unitPrice=1017.50 | total_cost=2035.00 |
| 4.5.4 | Lot number | batch.lot_number="V2026010" | Oba řádky: lot_number="V2026010" |
| 4.5.5 | Expiry date | bottled_date=2026-03-15, shelf_life=180 | Oba řádky: expiry_date=2026-09-11 |
| 4.5.6 | Datum příjemky | bottled_date=2026-03-15 | stock_issues.date = 2026-03-15 |
| 4.5.7 | Stock status | Po naskladnění | stock_status: lahev +200 ks, KEG +2 ks |
| 4.5.8 | Pkg/fill NULL | item.packaging_cost=NULL, filling_cost=NULL | unitPrice = beerCost×qty + 0 + 0 = jen pivo |

---

## INTEGRAČNÍ TESTY (E2E flow)

### TC-E2E-1: Kompletní bulk flow

```
1. Vytvořit recept "Test Lager" — batchSize=150L, shelf_life=180 dnů
   → Suroviny: slad 40kg, chmel 0.5kg, kvasnice 1ks
2. Přepočítat recept (Přepočítat button)
   → OVĚŘIT: ingredientsCost=865, overhead=173, var=1800, režie=2000
   → OVĚŘIT: totalProductionCost=4838, costPerLiter=32.25
   → OVĚŘIT: recipes.costPrice="4838"
3. Vytvořit várku z receptu
   → OVĚŘIT: lot_number="V2026010" (auto-generated)
   → OVĚŘIT: kopie receptu má shelf_life_days=180
4. Provést výrobu (status → conditioning), actual_volume=150L
5. Tab Stáčení:
   → OVĚŘIT: 1 řádek (bulk), qty=150, bottled_date=today
   → OVĚŘIT: Výrobní cena: 32,25 Kč/L (dle kalkulace receptu)
   → OVĚŘIT: Expirace = today + 180 dnů
6. Změnit qty na 148, uložit
   → OVĚŘIT: packaging_loss_l = 2
7. Klik "Naskladnit"
   → OVĚŘIT: Confirm dialog: 148L, Sklad piva
8. Potvrdit
   → OVĚŘIT: Příjemka vytvořena, confirmed
   → OVĚŘIT: Řádek: qty=148, unit_price=32.25, total_cost=4773.00
   → OVĚŘIT: lot_number="V2026010", expiry_date=today+180
   → OVĚŘIT: stock_issues.date = bottled_date
   → OVĚŘIT: Info box s linkem na příjemku
   → OVĚŘIT: "Naskladnit" tlačítko skryté
9. Ukončit várku
   → OVĚŘIT: Bez warning (příjemka existuje)
   → OVĚŘIT: batch.status=completed
```

### TC-E2E-2: Kompletní packaged flow

```
1. Setup: base item "Ležák 12°" (cost_price=30)
   → Child items: lahev 0.5L (pkg=3.50, fill=2.00), KEG 30L (pkg=0, fill=50)
2. Recept "Ležák 12°" — batchSize=150L, shelf_life=180
   → Přepočítat: costPrice=4838 → 32.25 Kč/L
3. Nastavit shop: stock_mode='packaged', beer_pricing_mode='recipe_calc'
4. Vytvořit várku, provést výrobu
5. Tab Stáčení:
   → OVĚŘIT: 2 řádky (lahev, KEG)
   → Zadat: lahev=200 ks, KEG=2 ks
   → OVĚŘIT: Objem lahev=100L, KEG=60L, celkem=160L
   → OVĚŘIT: Cena/ks lahev = 32.25×0.5 + 3.50 + 2.00 = 21.63 Kč
   → OVĚŘIT: Cena/ks KEG = 32.25×30 + 0 + 50 = 1017.50 Kč
   → OVĚŘIT: Celkem lahev=4326, KEG=2035, Total=6361 Kč
   → OVĚŘIT: Expirace na obou řádcích = today+180
6. Uložit → Naskladnit
   → OVĚŘIT: Příjemka s 2 řádky
   → Řádek 1: Lahev 0,5L, qty=200, unit_price=21.63, total=4326
   → Řádek 2: KEG 30L, qty=2, unit_price=1017.50, total=2035
   → Oba řádky: lot="V2026010", expiry=today+180
```

### TC-E2E-3: Změna pricing mode

```
1. Nastavit beer_pricing_mode='fixed', item.cost_price=30
2. Tab Stáčení bulk:
   → OVĚŘIT: "30,00 Kč/L (dle skladové karty)"
3. Naskladnit → příjemka unit_price=30
4. Storno příjemky
5. Změnit beer_pricing_mode='recipe_calc' (recipe costPerLiter=32.25)
6. Tab Stáčení:
   → OVĚŘIT: "32,25 Kč/L (dle kalkulace receptu)"
7. Naskladnit znovu → příjemka unit_price=32.25
```

### TC-E2E-4: Změna overhead → přepočet receptu

```
1. Recept: suroviny=865, overhead_pct=20, var=1800, režie=2000
   → Přepočítat: totalCost=4838
2. Změnit shop settings: overhead_pct=10, brew_cost=1000
3. Otevřít recept → kalkulace stále ukazuje 4838 (starý snapshot)
4. Klik "Přepočítat"
   → OVĚŘIT: ingredientOverhead = 865×10% = 86.50
   → OVĚŘIT: total = 865 + 86.50 + 1000 + 2000 = 3951.50
   → OVĚŘIT: costPerLiter = 3951.50/150 = 26.34
5. Naskladnit várku s recipe_calc
   → OVĚŘIT: unit_price = 26.34 (ne 32.25)
```

---

## EDGE CASES

### TC-EDGE-1: Hranové případy

| # | Scénář | Očekávaný výsledek |
|---|--------|--------------------|
| E1 | Batch bez receptu (recipeId=NULL) | shelf_life=NULL, expirace="—", recipe_calc → NULL → fixed fallback |
| E2 | Batch bez itemId | Bulk mód: chyba "Chybí výrobní položka" |
| E3 | base_item_quantity=0 na child itemu | Objem=0, beerCost=0, cena/ks = jen obal+stočení |
| E4 | Negativní packaging_cost | Validace: odmítnout (nebo zobrazit warning) |
| E5 | Velmi velký objem (10000L) | Kalkulace proběhne, zaokrouhlení na 2 des. místa |
| E6 | Přepočet receptu bez surovin | ingredientsCost=0, overhead=0, total = var+režie = 3800 |
| E7 | Tenant bez shop settings | Všechny overhead=0, pricing_mode=calc_price (defaults) |
| E8 | Duplicitní naskladnění race condition | Databázová constraint → chyba, user informován |
| E9 | Storno + znovu naskladnění (3×) | Každé storno + naskladnění vytvoří novou příjemku |
| E10 | Mixed child items — některé s pkg/fill, jiné bez | Items bez pkg/fill → počítá s 0, funguje |
