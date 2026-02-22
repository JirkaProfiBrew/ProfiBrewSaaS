# TEST CASES — Výdej surovin na várku (demand model, bez rezervací)

## Mapování na akceptační kritéria patche

| TC | Kritérium patche |
|----|-----------------|
| TC-01 | 9. createProductionIssue: draft výdejka z recipe snapshot |
| TC-02 | 10. recipe_item_id vyplněn na řádcích |
| TC-03 | 11. directProductionIssue: draft + confirm |
| TC-04 | 12. Žádná reserved_qty logika + 5. is_reserved neexistuje |
| TC-05 | 13. Tabulka Surovina/Kategorie/Recept/Vydáno/Chybí/Šarže |
| TC-06 | 14. Chybí červeně + 15. Šarže klikatelné |
| TC-07 | 16. Tlačítko "Připravit výdejku" + 17. "Vydat suroviny" |
| TC-08 | 18. Sekce Výdejky + 19. Vícenásobné výdeje |
| TC-09 | 20. Purpose select + 21. Batch select podmíněný |
| TC-10 | 22. Prefill řádků + 23. Editovatelné + 24. Změna batch dialog |
| TC-11 | 25. order_item_id na výdejkách z objednávek |
| TC-12 | 26. Tracking detail sloupec Várka |
| TC-13 | 6–8. Demand model (getDemandedQty, stock status view) |

---

## Prerekvizity pro testování

### Testovací data
- **Recept R1** "Světlý ležák" — batchSizeL = 100L, ingredience:
  - Plzeňský slad: 5000g (= 5 kg)
  - Apollo chmel: 50g
  - Safale S-189 kvasnice: 20g
- **Várka V-001** — recept = snapshot R1, plannedVolumeL = 200L (scaleFactor = 2.0)
- **Várka V-002** — recept = snapshot R1, plannedVolumeL = 100L (scaleFactor = 1.0)
- **Várka V-003** — BEZ receptu
- **Sklad "Suroviny"** — stav:
  - Plzeňský slad: 15 kg (příjemka P1 = 10 kg šarže L-001, P2 = 5 kg šarže L-002)
  - Apollo chmel: 0,15 kg (příjemka P3 = 0,15 kg)
  - Safale S-189: 0,05 kg (příjemka P4 = 0,05 kg)
- **Objednávka OBJ-001** — confirmed, 1 řádek: Plzeňský slad 5 kg

---

## TC-01: createProductionIssue — draft výdejka z receptu

### TC-01.1 Základní vytvoření (scaleFactor 2.0)
**Kroky:**
1. Otevři V-001 (plannedVolumeL = 200L, recept batchSizeL = 100L)
2. Tab "Suroviny" → klikni "Připravit výdejku"

**Ověř:**
- [ ] Otevře se detail nové výdejky ve stavu **draft**
- [ ] purpose = 'production', batch_id = V-001
- [ ] 3 řádky (= počet ingrediencí receptu)
- [ ] Množství škálovaná ×2: slad **10 kg**, chmel **0,1 kg**, kvasnice **0,04 kg**
- [ ] Sklad = default_warehouse_materials ze shop settings
- [ ] Řádky jsou editovatelné (můžu změnit množství)

### TC-01.2 Škálování 1:1 (scaleFactor 1.0)
**Kroky:**
1. Otevři V-002 (plannedVolumeL = 100L)
2. Tab "Suroviny" → "Připravit výdejku"

**Ověř:**
- [ ] Množství 1:1 s receptem: slad **5 kg**, chmel **0,05 kg**, kvasnice **0,02 kg**

### TC-01.3 Várka bez receptu
**Kroky:**
1. Otevři V-003 (bez receptu)
2. Tab "Suroviny"

**Ověř:**
- [ ] Tab zobrazuje hlášku "Várka nemá přiřazený recept"
- [ ] Tlačítka "Připravit výdejku" / "Vydat suroviny" nejsou dostupná

---

## TC-02: recipe_item_id vazba

### TC-02.1 Vazba řádku na ingredienci snapshotu
**Kroky:**
1. Vytvoř production issue pro V-001 (TC-01.1)
2. DB: `SELECT sil.recipe_item_id, ri.item_id FROM stock_issue_lines sil JOIN recipe_items ri ON ri.id = sil.recipe_item_id WHERE sil.stock_issue_id = '<issue_id>'`

**Ověř:**
- [ ] Každý řádek výdejky má vyplněný recipe_item_id (ne NULL)
- [ ] recipe_item_id odkazuje na recipe_items **snapshotu** (ne originálu)
- [ ] Tři různé recipe_item_id (jeden per ingredienci)
- [ ] item_id na řádku odpovídá item_id z recipe_item

---

## TC-03: directProductionIssue — přímý výdej

### TC-03.1 Přímý výdej — dostatek na skladě
**Kroky:**
1. Zapiš stock_status: slad quantity = 15 kg
2. V-002, tab "Suroviny" → "Vydat suroviny"
3. (Žádný warning dialog — vše dostupné)

**Ověř:**
- [ ] Vznikla výdejka ve stavu **confirmed** (ne draft)
- [ ] Quantity sladu kleslo o 5 kg (= 15 → 10)
- [ ] Movements existují s receipt_line_id (FIFO alokace proběhla)
- [ ] Batch tab "Suroviny" → sloupec Vydáno = 5 kg, Chybí = 0

### TC-03.2 Přímý výdej — nedostatek
**Kroky:**
1. Na skladě 3 kg sladu, 0,15 kg chmele, 0,05 kg kvasnic
2. V-001, tab "Suroviny" → "Vydat suroviny" (potřeba: 10 kg slad, 0,1 chmel, 0,04 kvasnice)

**Ověř:**
- [ ] Varování dialog: "Plzeňský slad: požadováno 10 kg, dostupné 3 kg, chybí 7 kg"
- [ ] Po potvrzení částečného výdeje:
  - Slad: actual_qty = 3 kg, missing_qty = 7 kg
  - Chmel: actual_qty = 0,1 kg, missing_qty = 0
  - Kvasnice: actual_qty = 0,04 kg, missing_qty = 0
- [ ] Batch tab: Chybí slad = **7 kg** (červeně)

### TC-03.3 Přímý výdej — FIFO přes více příjemek
**Kroky:**
1. Na skladě: P1 = 6 kg sladu (šarže L-001), P2 = 5 kg (šarže L-002)
2. V-001, "Vydat suroviny" (potřeba 10 kg)

**Ověř:**
- [ ] 2 movements: 6 kg z P1 (receipt_line_id = P1.line) + 4 kg z P2
- [ ] P1 remaining_qty = 0, P2 remaining_qty = 1 kg
- [ ] Batch tab Šarže: "L-001 (6 kg), L-002 (4 kg)"

---

## TC-04: Žádná rezervační logika

### TC-04.1 Draft výdejka NEOVLIVNÍ reserved_qty
**Kroky:**
1. Zapiš stock_status: reserved_qty sladu = 0
2. V-001 → "Připravit výdejku" (draft)
3. Zkontroluj stock_status

**Ověř:**
- [ ] reserved_qty sladu = **0** (beze změny)
- [ ] available_qty = quantity (beze změny)
- [ ] Sloupec is_reserved na stock_issues **neexistuje** (nebo je ignorován)

### TC-04.2 Confirm výdejky NEOVLIVNÍ reserved_qty
**Kroky:**
1. Připrav draft production issue pro V-002
2. Potvrď výdejku

**Ověř:**
- [ ] reserved_qty = **0** (stále)
- [ ] quantity kleslo o vydané množství (FIFO movements)

### TC-04.3 Cancel draft výdejky — žádný side-effect
**Kroky:**
1. Připrav draft production issue pro V-001
2. Stornuj draft

**Ověř:**
- [ ] reserved_qty = **0** (beze změny)
- [ ] quantity = beze změny (draft nemá movements)
- [ ] Výdejka status = cancelled

---

## TC-05: Batch tab "Suroviny" — tabulka

### TC-05.1 Prázdný stav (žádné výdeje)
**Kroky:**
1. Otevři V-001, tab "Suroviny" (žádné production issues)

**Ověř:**
- [ ] Tabulka zobrazuje 3 řádky (ingredience z receptu)
- [ ] Sloupce: Surovina | Kategorie | Recept | Vydáno | Chybí | Šarže
- [ ] Sloupec Recept: škálované množství (slad 10 kg, chmel 0,1 kg, kvasnice 0,04 kg)
- [ ] Sloupec Vydáno: **0** u všech
- [ ] Sloupec Chybí: **= Recept** (celé množství)
- [ ] Sloupec Šarže: prázdný
- [ ] **ŽÁDNÝ** sloupec "Rezervováno"

### TC-05.2 Po potvrzeném výdeji
**Kroky:**
1. Potvrď production issue pro V-001 (plný výdej)
2. Tab "Suroviny"

**Ověř:**
- [ ] Sloupec Vydáno: slad 10 kg, chmel 0,1 kg, kvasnice 0,04 kg
- [ ] Sloupec Chybí: **0** u všech
- [ ] Sloupec Šarže: zobrazuje šarže s množstvím

### TC-05.3 Po částečném výdeji
**Kroky:**
1. Potvrď production issue s částečným výdejem (slad: 8 z 10 kg)
2. Tab "Suroviny"

**Ověř:**
- [ ] Slad: Vydáno = 8 kg, Chybí = **2 kg**
- [ ] Chmel + kvasnice: Chybí = 0 (plně vydáno)

### TC-05.4 Grouping per kategorie
**Ověř:**
- [ ] Řádky seskupeny: Slad (Plzeňský slad), Chmel (Apollo), Kvasnice (Safale)
- [ ] Skupiny jsou collapsible (volitelné pro MVP)

---

## TC-06: Vizuální indikátory

### TC-06.1 Chybějící množství — červeně
**Kroky:**
1. Částečný výdej (slad 8 z 10 kg)
2. Tab "Suroviny"

**Ověř:**
- [ ] Slad Chybí = "2 kg" — **červený text** nebo červený badge
- [ ] Chmel Chybí = "0" — šedý/normální text
- [ ] Kvasnice Chybí = "0" — šedý/normální text

### TC-06.2 Šarže — klikatelné linky
**Kroky:**
1. Výdej s FIFO přes L-001 a L-002

**Ověř:**
- [ ] Sloupec Šarže: "L-001 (6 kg), L-002 (4 kg)"
- [ ] Klik na "L-001" → navigace na Tracking detail šarže L-001

---

## TC-07: Batch tab — tlačítka

### TC-07.1 Várka s receptem, žádné výdeje
**Ověř:**
- [ ] Tlačítko **"Připravit výdejku"** — viditelné, aktivní
- [ ] Tlačítko **"Vydat suroviny"** — viditelné, aktivní
- [ ] Žádné tlačítko "Rezervovat" ani "Zrušit rezervaci"

### TC-07.2 "Připravit výdejku" — flow
**Kroky:**
1. Klikni "Připravit výdejku"

**Ověř:**
- [ ] Navigace na detail nové draft výdejky
- [ ] Výdejka předvyplněná (purpose=production, batch=V-001, řádky z receptu)
- [ ] User může editovat řádky, vybrat šarže (manual_lot), pak potvrdit

### TC-07.3 "Vydat suroviny" — flow
**Kroky:**
1. Klikni "Vydat suroviny"

**Ověř:**
- [ ] Prevalidace: pokud vše dostupné → rovnou confirm (nebo krátký confirm dialog)
- [ ] Prevalidace: pokud nedostatek → varování dialog s rozpadem
- [ ] Po confirm: výdejka ve stavu confirmed, movements vytvořeny

### TC-07.4 Tlačítka po existujícím výdeji
**Kroky:**
1. Potvrď production issue pro V-001

**Ověř:**
- [ ] Obě tlačítka stále dostupná (sládek může vydat další — dry hop atd.)

### TC-07.5 Várka bez receptu
**Ověř:**
- [ ] Obě tlačítka **neviditelná** nebo disabled
- [ ] Hláška "Várka nemá přiřazený recept"

---

## TC-08: Sekce Výdejky + vícenásobné výdeje

### TC-08.1 Seznam výdejek
**Kroky:**
1. Vytvoř 2 production issues na V-001 (jedna confirmed, jedna draft)
2. Tab "Suroviny" → sekce "Výdejky"

**Ověř:**
- [ ] Seznam zobrazuje obě výdejky
- [ ] Sloupce: Kód | Stav (badge) | Datum
- [ ] Kód výdejky = klikatelný link → otevře detail výdejky
- [ ] Stav: ✅ Potvrzeno / 📝 Draft

### TC-08.2 Cancelled výdejky
**Kroky:**
1. Stornuj jednu výdejku

**Ověř:**
- [ ] Cancelled výdejka se nezobrazuje v seznamu (nebo přeškrtnutě/šedě)

### TC-08.3 Vícenásobné výdeje — agregace v tabulce
**Kroky:**
1. Potvrď první production issue (hlavní — všechny suroviny)
2. Vytvoř DRUHOU production issue ručně — přidej 0,03 kg chmele (dry hop)
3. Potvrď druhou
4. Tab "Suroviny"

**Ověř:**
- [ ] Chmel: Vydáno = **0,1 + 0,03 = 0,13 kg** (součet obou výdejek)
- [ ] Sekce Výdejky: 2 potvrzené výdejky

### TC-08.4 Žádné výdejky
**Kroky:**
1. Nová várka, tab "Suroviny"

**Ověř:**
- [ ] Sekce Výdejky: "Žádné výdejky"

---

## TC-09: Výdejka formulář — purpose select + batch select

### TC-09.1 Purpose dropdown existuje
**Kroky:**
1. Vytvoř novou výdejku

**Ověř:**
- [ ] Na formuláři existuje dropdown "Účel"
- [ ] Hodnoty: Prodej | Výroba | Převod | Odpis | Ostatní
- [ ] Default = Prodej

### TC-09.2 Purpose = Výroba → batch select
**Kroky:**
1. Změň purpose na "Výroba"

**Ověř:**
- [ ] Zobrazí se pole "Várka" (select/lookup)
- [ ] Nabízí jen várky ve stavu planned / brewing / fermenting / conditioning
- [ ] Label: "{batchNumber} — {recipeName}"

### TC-09.3 Purpose ≠ Výroba → batch select skrytý
**Kroky:**
1. Nastav purpose = Výroba → batch select viditelný
2. Vyber batch V-001
3. Změň purpose zpět na "Prodej"

**Ověř:**
- [ ] Pole "Várka" zmizí
- [ ] batch_id na výdejce se vyčistí (NULL)

### TC-09.4 Completed/dumped várky NEVIDITELNÉ v selectu
**Kroky:**
1. Ukonči V-002 (completed)
2. Nová výdejka, purpose = Výroba

**Ověř:**
- [ ] V-002 se NENABÍZÍ v selectu várky (completed)
- [ ] V-001 (planned/brewing) se nabízí

---

## TC-10: Výdejka — batch prefill

### TC-10.1 Prefill po výběru batch
**Kroky:**
1. Nová výdejka, purpose = Výroba
2. Vyber batch V-001

**Ověř:**
- [ ] Řádky automaticky předvyplněny: slad 10 kg, chmel 0,1 kg, kvasnice 0,04 kg
- [ ] recipe_item_id vyplněn na každém řádku
- [ ] Sklad předvyplněn z shop settings

### TC-10.2 Editace prefilled řádků
**Kroky:**
1. Prefill z V-001
2. Změň slad z 10 → 12 kg
3. Přidej nový řádek: Dextroza 0,5 kg
4. Odstraň kvasnice
5. Ulož draft

**Ověř:**
- [ ] Slad: requested_qty = 12 kg, recipe_item_id zachován
- [ ] Dextroza: requested_qty = 0,5 kg, recipe_item_id = **NULL** (ne z receptu)
- [ ] Kvasnice: řádek smazán
- [ ] Uložení OK

### TC-10.3 Změna batch — přepsat dialog
**Kroky:**
1. Prefill z V-001 (3 řádky, ×2 škálování)
2. Změň batch na V-002

**Ověř:**
- [ ] Dialog: "Přepsat řádky z nového receptu?"
- [ ] **Ano** → řádky přepsány (×1 škálování: slad 5 kg místo 10 kg)
- [ ] **Ne** → řádky zůstávají z V-001

### TC-10.4 Přechod z batch detail → výdejka
**Kroky:**
1. V-001, tab "Suroviny" → klikni "Připravit výdejku"

**Ověř:**
- [ ] Otevře se nová výdejka s purpose = Výroba, batch = V-001 přednastavené
- [ ] Řádky předvyplněny
- [ ] User nemusí ručně vybírat purpose a batch

---

## TC-11: order_item_id na výdejkách z objednávek

### TC-11.1 Výdejka z objednávky
**Kroky:**
1. Objednávka OBJ-001 (confirmed), řádek: Plzeňský slad 5 kg
2. Vytvoř výdejku z objednávky (existující flow ze Sprint 4)
3. DB: `SELECT order_item_id FROM stock_issue_lines WHERE stock_issue_id = '<issue_id>'`

**Ověř:**
- [ ] order_item_id vyplněn (ne NULL)
- [ ] order_item_id odkazuje na řádek OBJ-001

### TC-11.2 Výdejka mimo objednávku
**Kroky:**
1. Vytvoř manuální výdejku (purpose = sale, bez objednávky)

**Ověř:**
- [ ] order_item_id = NULL na všech řádcích (korektní)

---

## TC-12: Tracking detail — sloupec Várka

### TC-12.1 Lot použitý ve výrobě
**Kroky:**
1. Potvrď production issue pro V-001 (FIFO z šarže L-001)
2. Tracking → detail šarže L-001

**Ověř:**
- [ ] Tabulka výdejů: sloupec "Várka" zobrazuje batch_number V-001
- [ ] Várka = klikatelný link → otevře batch detail V-001
- [ ] Sloupec "Účel": "Výroba"

### TC-12.2 Lot použitý v prodeji
**Kroky:**
1. Prodejní výdejka (purpose = sale) se sladem z šarže L-002
2. Tracking → detail L-002

**Ověř:**
- [ ] Sloupec Várka = **—** (prázdný)
- [ ] Sloupec Účel = "Prodej"

### TC-12.3 Lot použitý ve více várkách
**Kroky:**
1. Příjemka 15 kg sladu, šarže L-003
2. Výdej na V-001 (10 kg z L-003)
3. Výdej na V-002 (5 kg z L-003)
4. Tracking → detail L-003

**Ověř:**
- [ ] 2 řádky: V-001 (10 kg), V-002 (5 kg)
- [ ] Obě várky klikatelné

---

## TC-13: Demand model — požadavky na stock status

### TC-13.1 Demand z várky
**Kroky:**
1. V-001 existuje (potřeba: slad 10 kg), žádné výdeje
2. Item detail → Plzeňský slad → tab "Stav skladu"

**Ověř:**
- [ ] Sloupec **Požadavky**: 10 kg (z V-001)
- [ ] Sloupec **Rozdíl**: quantity - 10 (zelený pokud kladný, červený pokud záporný)

### TC-13.2 Demand z objednávky + várky
**Kroky:**
1. OBJ-001 confirmed (slad 5 kg), V-001 (slad 10 kg), žádné výdeje
2. Item detail Plzeňský slad

**Ověř:**
- [ ] Požadavky: **15 kg** (5 + 10)
- [ ] Klik na Požadavky → rozpad: "OBJ-001: 5 kg, V-001: 10 kg"

### TC-13.3 Demand se snižuje po výdeji
**Kroky:**
1. V-001 potřeba 10 kg, OBJ-001 potřeba 5 kg
2. Vydej na V-001: 10 kg (plný výdej)
3. Item detail Plzeňský slad

**Ověř:**
- [ ] Požadavky: **5 kg** (V-001 pokryt, zbývá OBJ-001)
- [ ] Rozpad: "OBJ-001: 5 kg" (V-001 zmizí — plně pokryt)

### TC-13.4 Částečný výdej — demand zůstává
**Kroky:**
1. V-001 potřeba 10 kg sladu
2. Vydej 6 kg (částečný)
3. Item detail Plzeňský slad

**Ověř:**
- [ ] Požadavky: **4 kg** (10 - 6 = zbývající demand)

### TC-13.5 Cancelled objednávka/várka — demand odpadá
**Kroky:**
1. OBJ-001 confirmed (5 kg), V-001 planned (10 kg)
2. Cancel OBJ-001
3. Item detail Plzeňský slad

**Ověř:**
- [ ] Požadavky: **10 kg** (jen V-001, OBJ-001 cancelled = nula)

### TC-13.6 Completed várka — demand odpadá
**Kroky:**
1. V-001 (10 kg demand), ukonči várku (completed) bez výdeje surovin

**Ověř:**
- [ ] Požadavky: **0 kg** (completed batch negeneruje demand)

---

## EDGE CASES

### EC-01: Dvojklik "Vydat suroviny" (race condition)
**Kroky:** Klikni "Vydat suroviny" dvakrát rychle
**Ověř:**
- [ ] Vznikne jen 1 výdejka (debounce nebo lock)
- [ ] Množství odepsáno jen jednou

### EC-02: Editace recipe snapshotu mezi výdejkami
**Kroky:**
1. Vydej na V-001 (první production issue)
2. Edituj snapshot: přidej ingredienci "Irish Moss"
3. Vytvoř druhou production issue

**Ověř:**
- [ ] Druhá výdejka obsahuje Irish Moss, první ne
- [ ] Tab Suroviny: oba výdeje se agregují korektně (Irish Moss jen z druhé)

### EC-03: Storno potvrzené production issue
**Kroky:**
1. Potvrď production issue (10 kg sladu vydáno)
2. Stornuj ji

**Ověř:**
- [ ] quantity se vrátí (+10 kg)
- [ ] remaining_qty na příjmových řádcích se vrátí
- [ ] Batch tab "Suroviny": Vydáno = 0, Chybí = 10 kg
- [ ] Demand: požadavek 10 kg se vrátí (výdej zrušen)

### EC-04: Storno příjemky, ze které bylo vydáno na batch
**Kroky:**
1. Příjemka P1: 10 kg sladu, šarže L-001
2. Production issue na V-001: 8 kg z P1
3. Pokus o storno P1

**Ověř:**
- [ ] Storno blokováno: "Z řádku Plzeňský slad (šarže L-001) bylo vydáno 8 kg"
- [ ] Odkaz na blokující výdejku

### EC-05: Výdej na várku v různých stavech batch
**Kroky:** Vytvoř production issue pro batch ve stavu planned, brewing, fermenting

**Ověř:**
- [ ] Všechny stavy povoleny (sládek vydává suroviny v různých fázích)
- [ ] Completed/dumped: tlačítka stále dostupná (opravný výdej)

### EC-06: Množství 0 v receptu
**Kroky:** Ingredience s amount = 0 v receptu (placeholder)

**Ověř:**
- [ ] Řádek se buď přeskočí, nebo se vytvoří s requested_qty = 0
- [ ] Nesmí způsobit error

---

## SOUHRN

| Oblast | Počet testů |
|--------|-------------|
| TC-01: createProductionIssue | 3 |
| TC-02: recipe_item_id | 1 |
| TC-03: directProductionIssue | 3 |
| TC-04: Žádná rezervace | 3 |
| TC-05: Tabulka suroviny | 4 |
| TC-06: Vizuální indikátory | 2 |
| TC-07: Tlačítka | 5 |
| TC-08: Výdejky + vícenásobné | 4 |
| TC-09: Purpose + batch select | 4 |
| TC-10: Prefill | 4 |
| TC-11: order_item_id | 2 |
| TC-12: Tracking várka | 3 |
| TC-13: Demand model | 6 |
| Edge cases | 6 |
| **Celkem** | **50** |
