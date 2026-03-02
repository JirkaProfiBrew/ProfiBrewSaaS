# TEST CASES — ŘÍZENÍ VARU (Batch Lifecycle F1–F7)

## ProfiBrew.com | Datum: 02.03.2026

---

## TESTOVACÍ DATA

### Tenant: Pivovar Testovací
- Excise evidence: **ON**, Kategorie **A** (16,00 Kč/°P/hl)
- Brewing system: **Varna 120L** (primary)
  - batch_size_l: 120, efficiency: 71%, kettle_loss: 10%, whirlpool_loss: 11%
  - time_preparation: 1, time_lautering: 60, time_whirlpool: 90, time_transfer: 15, time_cleanup: 60

### Recept: Ležák 13 na velikonoce
- Styl: Czech Premium Pale Lager
- OG: 13,3 °P | FG: 3,3 °P | ABV: 5,2% | IBU: 38 | EBC: 10
- Objem: 120 L (batch size)
- Slady: Český světlý 21,2 kg, Vídeňský 6,1 kg, Mnichovský II 3,0 kg
- Chmele: Premiant 120g (90 min), Žatecký červeňák 100g (45 min), Žatecký červeňák 100g (10 min)
- Kvasnice: Saflager S-189 100g
- Rmutovací profil: Infuze — 2 rmuty (Vystírka 52°C, Nižší cukr 63°C, Vyšší cukr 72°C, Odrmut 78°C)
- Chmelovar: 90 min
- Kvašení: 7 dní | Ležení: 21 dní

### Sklady
| Sklad | is_excise_relevant | Stav |
|-------|--------------------|------|
| Sklad surovin | ❌ | Plzeňský 259 kg, Vídeňský 27 kg, Mnichov. 164 kg, Žatecký 390 g, Premiant 53 g, Saflager 100 g |
| Sklad piva | ✅ | Prázdný |

### Tanky (equipment)
| Tank | Typ | Kapacita | Stav |
|------|-----|----------|------|
| CKT-1 | conditioning | 300 L | Volný |
| CKT-2 | conditioning | 300 L | Obsazený (jiný var) |
| Ležák-1 | brite_tank | 200 L | Volný |

---

## POUŽITÍ DOKUMENTU

### FÁZE 1 — Claude Code (automatická verifikace + příprava dat)

```
Projdi test casy v test-cases-brew-lifecycle.md. Tvůj úkol má 2 části:

ČÁST A — Příprava testovacích dat:
Vytvoř seed SQL skript `supabase/seed-brew-test.sql` který založí všechna 
testovací data popsaná v sekci TESTOVACÍ DATA:
- Recepturu "Ležák 13 na velikonoce" se všemi surovinami (recipe_items), 
  kroky (recipe_steps) a rmutovacím profilem
- Položky (items): slady, chmele, kvasnice — s is_brew_material = true
- Skladové zásoby (stock) odpovídající tabulce v test cases
- Equipment: CKT-1 (volný), CKT-2 (obsazený), Ležák-1 (volný)
- Brewing system "Varna 120L" s parametry z test cases, is_primary = true
- Beer style "Czech Premium Pale Lager" pokud neexistuje

Skript musí:
- Používat tenant_id aktuálního testovacího tenantu (parametr nebo najdi dle názvu)
- Být idempotentní (ON CONFLICT DO NOTHING nebo DELETE + INSERT)
- Být spustitelný v Supabase SQL Editor
- Na konci vypsat: "Test data ready. Recipe ID: ..., Brewing System ID: ..."

ČÁST B — Verifikace funkcionality:
Pro každý TC ověř:
1. Existuje route/page pro danou obrazovku?
2. Existuje komponenta zobrazující popsaný obsah?
3. Existuje server action pro popsanou operaci?
4. Jsou inputy/tlačítka/selecty reálně v renderovaném UI?
5. Jsou i18n klíče definované (cs + en)?

Pokud něco chybí — doplň.
Na konci vytvoř checklist: TC-ID | OK/CHYBÍ | co bylo doplněno.
Commitni jako "fix: brew lifecycle test readiness + seed data".
```

### FÁZE 2 — Manuální proklikání (Jirka)

1. Spustit `supabase/seed-brew-test.sql` v Supabase SQL Editor
2. Projít TC jeden po druhém v prohlížeči. U každého zaznamenat ✅/❌/⚠️.

---

## 0. ZALOŽENÍ VARU

### TC-000: Tlačítko "+ Várka" v browseru
**Prereq:** Přihlášený uživatel, existuje alespoň 1 receptura
**Kroky:** Pivovar → Vary → klik `+ Várka`
**Očekáváno:** Otevře se stránka/formulář pro nový var

### TC-001: Formulář nového varu — pole
**Prereq:** TC-000
**Kroky:** Zobrazit formulář
**Očekáváno:** Formulář obsahuje:
- Výběr receptury (select s vyhledáváním, **povinné**)
- Plánované datum (date picker, default = dnes)
- NEOBSAHUJE: equipment, notes (ty se vyplní ve F1 Plán)

### TC-002: Validace — bez receptury
**Kroky:** Nevy brat recepturu → klik Uložit
**Očekáváno:** Chybová hláška "Vyberte recepturu" (nebo obdobná). Var se nezaloží.

### TC-003: Založení varu — happy path
**Kroky:** Vybrat "Ležák 13 na velikonoce" → datum 1.3.2026 → Uložit
**Očekáváno:**
- Var vytvořen s číslem V-2026-XXX
- Recipe snapshot vytvořen (recipe.status = 'batch_snapshot')
- `current_phase = "plan"`
- `phase_history.plan.started_at` = timestamp
- Redirect na `/brewery/batches/{id}/brew` → auto-redirect na `/brew/plan`

### TC-004: Snapshot receptury
**Prereq:** TC-003
**Kroky:** V DB ověřit snapshot
**Claude Code:** `SELECT id, status, source_recipe_id FROM recipes WHERE status = 'batch_snapshot' ORDER BY created_at DESC LIMIT 1`
**Očekáváno:** Snapshot existuje, `source_recipe_id` = ID původní receptury, recipe_items a recipe_steps zkopírovány

---

## 1. F1 — PLÁN

### TC-100: Zobrazení F1 Plán
**Prereq:** TC-003 — nový var ve fázi "plan"
**Kroky:** Otevřít `/brewery/batches/{id}/brew/plan`
**Očekáváno:**
- Záhlaví: číslo varu, název receptury, styl, OG/IBU/EBC/objem
- Process bar: "Plán" zvýrazněná (active), ostatní šedé (locked)
- Obsah stránky: tři sekce (Receptura, Časový plán, Nádoby)

### TC-101: Process bar — stav kroků
**Kroky:** Vizuálně zkontrolovat process bar
**Očekáváno:**
- Plán = aktivní (zvýrazněný)
- Příprava, Var, Kvašení, Ležení, Stáčení, Hotovo = locked (šedé)
- Klik na locked fázi → tooltip "Nejprve dokončete aktuální fázi" (nebo disabled)

### TC-102: Sekce Receptura
**Kroky:** Zkontrolovat levý sloupec
**Očekáváno:** Zobrazuje:
- Název receptury + styl
- OG, IBU, EBC, ABV, objem
- Seznam sladů (s %)
- Seznam chmelů (s gramáží a čas přidání)
- Kvasnice
- Odkaz na recept (link)

### TC-103: Sekce Časový plán
**Kroky:** Zkontrolovat prostřední sloupec
**Očekáváno:**
- Plánovaný datum + čas (editovatelné)
- Odhad rmutování (min) — spočítaný z profilu
- Odhad celkového času varu (min)
- Kvašení (dny): input s default z receptury (7)
- Ležení (dny): input s default z receptury (21)
- Odhadovaný konec: automaticky spočítaný datum

### TC-104: Sekce Nádoby
**Kroky:** Zkontrolovat pravý sloupec
**Očekáváno:**
- Kvasná nádoba: select s volnými tanky (CKT-1 = volný, CKT-2 = obsazený)
- Ležácká nádoba: select s volnými tanky
- Obsazené tanky = disabled nebo označené

### TC-105: Editace plánovaného data
**Kroky:** Změnit datum na 5.3.2026, čas na 08:00 → ověřit přepočet
**Očekáváno:** Odhadovaný konec se přepočítá

### TC-106: Výběr kvasné nádoby
**Kroky:** Vybrat CKT-1 (volný)
**Očekáváno:** Vybrán, uložen na batch.equipment_id

### TC-107: Sidebar — ikony přístupné
**Kroky:** Na pravém okraji kliknout na ikony sidebarů
**Očekáváno:** Otevřou se panely:
- 📋 Náhled receptu — kompaktní recept
- 💧 Voda a objemy — pipeline objemů
- 📝 Poznámky — prázdné, možnost přidat
- 🔄 Tracking šarží — prázdný (dosud žádné)
- 🏛️ Spotřební daň — plánovaná daň z objemu

### TC-108: Sidebar — přidání poznámky
**Kroky:** Otevřít sidebar Poznámky → napsat "Testovací poznámka k plánu" → Uložit
**Očekáváno:** Poznámka uložena s timestampem, zobrazí se v seznamu

### TC-109: Přechod F1 → F2
**Kroky:** Klik `[Zahájit přípravu]`
**Očekáváno:**
- Redirect na `/brew/prep`
- Process bar: Plán = ✅ done, Příprava = active
- `current_phase = "preparation"`
- `phase_history.plan.completed_at` vyplněno
- `phase_history.preparation.started_at` vyplněno

---

## 2. F2 — PŘÍPRAVA

### TC-200: Zobrazení F2 Příprava
**Prereq:** TC-109
**Kroky:** Otevřít `/brewery/batches/{id}/brew/prep`
**Očekáváno:** Dvě sekce: Suroviny a sklad | Voda a objemy + Preview kroků

### TC-201: Tabulka surovin vs. sklad
**Kroky:** Zkontrolovat tabulku surovin
**Očekáváno:**

| Položka | Recept | Sklad | Stav |
|---------|--------|-------|------|
| Český světlý | 21,2 kg | 259 kg | ✅ zelená |
| Vídeňský | 6,1 kg | 27 kg | ✅ zelená |
| Mnichovský II | 3,0 kg | 164 kg | ✅ zelená |
| Premiant | 120 g | 53 g | 🔴 červená (nedostatek!) |
| Žatecký červeňák | 200 g | 390 g | ✅ zelená |
| Saflager S-189 | 100 g | 100 g | ✅ zelená (přesně) |

### TC-202: Nedostatek suroviny — vizuální indikátor
**Kroky:** Zkontrolovat řádek Premiant
**Očekáváno:** Červeně zvýrazněný (sklad 53g < recept 120g). Varování viditelné.

### TC-203: Preview vodních objemů
**Kroky:** Zkontrolovat sekci Voda a objemy
**Očekáváno:**
- Voda na vystírku: ~106 L
- Voda na vyslazování: ~74 L
- Voda celkem: ~180 L
- Objem díla, sladiny, po chmelovaru, při zakvašení

### TC-204: Preview kroků vaření
**Kroky:** Zkontrolovat preview kroků
**Očekáváno:** Tabulka s ~15 kroky (příprava → rmutování → scezování → chmelovar → whirlpool → úklid), celkový čas

### TC-205: Vydat suroviny
**Kroky:** Klik `[Vydat suroviny]` → potvrdit
**Očekáváno:**
- Dialog potvrzení
- Vytvoření skladového dokladu (výdejka)
- Odečet ze skladu surovin
- Zápis do `batch_lot_tracking` (direction = 'in') pro každou surovinu
- Tlačítko "Vydat" se změní na "Vydáno" (disabled) nebo zmizí

### TC-206: Lot tracking po výdeji
**Kroky:** Otevřít sidebar Tracking šarží
**Očekáváno:** Vstupní šarže: 6 řádků (3 slady + 2 chmele + 1 kvasnice) s množstvím a lot čísly

### TC-207: Vrátit se na F1
**Kroky:** Klik na "Plán" v process baru
**Očekáváno:** Zobrazí se F1 Plán s toast "Zobrazujete historickou fázi". Data jsou readonly nebo editovatelná (dle implementace).

### TC-208: Přechod F2 → F3
**Kroky:** Klik `[Zahájit var]`
**Očekáváno:**
- Potvrzovací dialog: "Zahájit vaření? Kroky vaření budou vygenerovány."
- Po potvrzení: batch_steps vygenerovány (mash z receptury + post-mash z brewing_system)
- Redirect na `/brew/brewing`
- `current_phase = "brewing"`, `brew_date` nastaven

### TC-209: Ověření vygenerovaných batch_steps
**Claude Code:** Ověřit v DB/action že batch_steps obsahují:
1. Příprava (system, 1 min)
2. Ohřev Vystírka (recipe, 52°C, ramp+hold)
3. Prodleva Vystírka (recipe, 52°C)
4. Ohřev Nižší cukr (recipe, 63°C)
5. Prodleva Nižší cukr (recipe, 63°C)
6. Ohřev Vyšší cukr (recipe, 72°C)
7. Prodleva Vyšší cukr (recipe, 72°C)
8. Ohřev Odrmut (recipe, 78°C)
9. Prodleva Odrmut (recipe, 78°C)
10. Scezování (system, 70°C, 60 min)
11. Ohřev na chmelovar (system, 100°C, 30 min)
12. Chmelovar (system, 100°C, 90 min) — s hop_additions JSONB
13. Whirlpool a chlazení (system, 90 min)
14. Přesun na kvašení (system, 15 min)
15. Úklid (system, 60 min)

Každý step má `start_time_plan` spočítaný kumulativně.

---

## 3. F3 — VAR (Varný list)

### TC-300: Zobrazení varného listu
**Prereq:** TC-208
**Kroky:** Otevřít `/brewery/batches/{id}/brew/brewing`
**Očekáváno:**
- Process bar: Plán ✅, Příprava ✅, **Var** active
- Tabulka kroků vaření (min. 15 řádků)
- Sekce: Chmelení, Stopky, Měření

### TC-301: Tabulka kroků — struktura
**Kroky:** Zkontrolovat tabulku
**Očekáváno:** Sloupce: #, Krok, Cíl °C, Plán min, Skut min (input), Δ, Poznámka
- Vizuální oddělovače mezi: Rmutování / Scezování / Chmelovar / Whirlpool

### TC-302: Zápis skutečného času kroku
**Kroky:** U kroku "Prodleva Vystírka" zadat skutečný čas = 8 min (plán 10)
**Očekáváno:**
- Input přijme hodnotu
- Δ = -2 (zelená — rychlejší než plán)
- Auto-save (po blur nebo debounce)
- Refresh stránky → hodnota přetrvává

### TC-303: Zápis delšího skutečného času
**Kroky:** U kroku "Prodleva Nižší cukr" zadat 30 min (plán 25)
**Očekáváno:** Δ = +5 (červená — pomalejší)

### TC-304: Stopky — celkové
**Kroky:** Klik ▶ na "Celkové stopky"
**Očekáváno:** Timer běží (0:00:01, 0:00:02...). Klik ⏸ zastaví. Klik ▶ pokračuje.

### TC-305: Stopky — prodleva
**Kroky:** Klik ▶ na "Stopky prodleva"
**Očekáváno:** Nezávislý timer (běží samostatně od celkových)

### TC-306: Chmelovar timer — zobrazení
**Kroky:** Zkontrolovat sekci Chmelení
**Očekáváno:** Tabulka hop additions:

| Chmel | Množství | Přidat v min | Skutečný čas | ✓ |
|-------|----------|--------------|--------------|---|
| Premiant | 120 g | 0 (start) | [input] | ☐ |
| Žatecký červeňák | 100 g | 45 | [input] | ☐ |
| Žatecký červeňák | 100 g | 80 (10 min do konce) | [input] | ☐ |

### TC-307: Chmelovar timer — stopky
**Kroky:** Klik ▶ na stopky chmelovaru
**Očekáváno:** Countdown od 90:00 (nebo countup od 0:00)

### TC-308: Potvrzení hop addition
**Kroky:** U Premiantu klik "Potvrdit" (☑)
**Očekáváno:** Checkbox zaškrtnut, `actual_time` zapsán (aktuální čas), řádek vizuálně potvrzený (zelená/průhledná)

### TC-309: Sekce Měření — plán vs. skutečnost
**Kroky:** Zkontrolovat sekci Měření
**Očekáváno:** Tabulka s řádky:

| Parametr | Plán | Skutečnost |
|----------|------|------------|
| Voda na vystírku (L) | 106,1 | [input] |
| Voda na vyslazování (L) | 74,0 | [input] |
| Objem před chmelov. (L) | 149,8 | [input] |
| Objem po chmelovaru (L) | 134,8 | [input] |
| Objem při zakvašení (L) | 120,0 | [input] |
| Hustota (°P) | 13,3 | [input] |
| Efektivita varny (%) | 71,0 | [auto] |
| Ztráta chmelovar (%) | 10,0 | [auto] |
| Ztráta whirlpool (%) | 11,0 | [auto] |

### TC-310: Zápis měření — objemy
**Kroky:** Zadat: Voda na vystírku = 106, Objem při zakvašení = 125
**Očekáváno:** Hodnoty uloženy, auto-save

### TC-311: Zápis měření — hustota + auto-calc efektivita
**Kroky:** Zadat: Hustota = 12,8 °P, Objem před chmelov. = 150, Objem po chmelov. = 140
**Očekáváno:**
- Efektivita varny se přepočítá automaticky (≠ plán)
- Ztráta chmelovar se přepočítá: (150 - 140) / 150 = 6,7%

### TC-312: Sidebar Poznámky — přidání z F3
**Kroky:** Sidebar → Poznámky → napsat "Pomalejší ohřev, slabší plamen" → Uložit
**Očekáváno:** Poznámka uložena s timestampem a phase = "brewing". Viditelná vedle poznámky z F1.

### TC-313: Sidebar Spotřební daň
**Kroky:** Sidebar → Spotřební daň
**Očekáváno:** Zobrazuje plánovanou daň z objemu. Pohyby zatím prázdné nebo automatický příjem.

### TC-314: Přechod F3 → F4
**Kroky:** Klik `[Ukončit var — přejít na kvašení]`
**Očekáváno:**
- Dialog: "Vyplňte naměřené hodnoty"
- Povinné pole: OG skutečnost, Objem do kvasné
- Zadat: OG = 12,8 | Objem = 125

### TC-315: Přechod F3 → F4 — potvrzení
**Prereq:** TC-314
**Kroky:** Klik `[Uložit a přejít na Kvašení]`
**Očekáváno:**
- `og_actual = 12.8` uloženo na batch
- `actual_volume_l = 125` uloženo
- `current_phase = "fermentation"`, `fermentation_start = today`
- Redirect na `/brew/ferm`
- Excise: příjem 1,25 hl do daňového skladu (pokud automatic)

---

## 4. F4 — KVAŠENÍ

### TC-400: Zobrazení F4 Kvašení
**Prereq:** TC-315
**Kroky:** Otevřít `/brewery/batches/{id}/brew/ferm`
**Očekáváno:**
- Process bar: Plán ✅, Příprava ✅, Var ✅, **Kvašení** active
- Info: Nádoba (CKT-1), Kvasnice (Saflager S-189)
- Zahájení: dnešní datum
- Plán: 7 dní → konec = dnes + 7
- Progress bar: Den 1 / 7

### TC-401: Progress bar
**Kroky:** Vizuálně zkontrolovat progress
**Očekáváno:** ~14% (den 1 ze 7). Zelená barva.

### TC-402: Tabulka měření — prázdná
**Kroky:** Zkontrolovat tabulku měření
**Očekáváno:** Prázdná tabulka se sloupci: Datum, Čas, Teplota °C, Hustota °P, pH, Poznámka, Akce

### TC-403: Přidání měření
**Kroky:** Klik `[+ Přidat měření]`
**Očekáváno:** Dialog/inline form:
- Datum/čas (default: now)
- Teplota: [input] °C
- Hustota: [input] °P
- pH: [input] (volitelné)
- Poznámka: [textarea]

### TC-404: Uložení měření — zakvašení
**Kroky:** Zadat: Teplota = 12,0 | Hustota = 12,8 | Poznámka = "Zakvašení" → Uložit
**Očekáváno:** Řádek v tabulce: dnešní datum, 12,0 °C, 12,8 °P, "Zakvašení"

### TC-405: Přidání dalšího měření
**Kroky:** Přidat: Teplota = 12,5 | Hustota = 10,4 | Poznámka = "Aktivní kvašení"
**Očekáváno:** Druhý řádek v tabulce. Řazení dle data (nejnovější dole nebo nahoře).

### TC-406: Editace měření
**Kroky:** U prvního měření klik ✏️ → změnit teplotu na 11,8 → Uložit
**Očekáváno:** Hodnota aktualizována

### TC-407: Smazání měření
**Kroky:** U druhého měření klik 🗑️ → potvrdit
**Očekáváno:** Řádek smazán

### TC-408: Sidebar — dostupnost z F4
**Kroky:** Ověřit že všechny sidebary fungují i z F4
**Očekáváno:** Recept, Objemy, Měření, Poznámky, Porovnání, Tracking, Excise — všechny otevíratelné

### TC-409: Přechod F4 → F5
**Kroky:** Klik `[Přesun na ležení]`
**Očekáváno:**
- `current_phase = "conditioning"`, `conditioning_start = today`
- Redirect na `/brew/cond`
- Excise: případný odpis ztráty kvašení (pokud zadán objem loss)

---

## 5. F5 — LEŽENÍ

### TC-500: Zobrazení F5 Ležení
**Prereq:** TC-409
**Kroky:** Otevřít `/brewery/batches/{id}/brew/cond`
**Očekáváno:**
- Process bar: ...Kvašení ✅, **Ležení** active
- Info: Nádoba, Přesun z kvašení datum
- Plán: 21 dní → konec = dnes + 21
- Progress bar: Den 1 / 21
- Prázdná tabulka měření

### TC-501: Přidání měření ležení
**Kroky:** Přidat: Teplota = 2,0 | Hustota = 3,5 | pH = 4,2 | Poznámka = "Ležení start"
**Očekáváno:** Měření uloženo s `phase = "conditioning"`

### TC-502: Zpětný návrat na F3
**Kroky:** Klik na "Var" v process baru
**Očekáváno:** Zobrazí se varný list F3 (historická fáze). Toast: "Zobrazujete historickou fázi". Data kroků a měření zachována.

### TC-503: Zpětný návrat na F2
**Kroky:** Klik na "Příprava" v process baru
**Očekáváno:** F2 Příprava. Suroviny zobrazují "Vydáno" stav. Historický mód.

### TC-504: Přechod F5 → F6
**Kroky:** Klik `[Přesun na stáčení]`
**Očekáváno:**
- `current_phase = "packaging"`
- Redirect na `/brew/pack`

---

## 6. F6 — STÁČENÍ

### TC-600: Zobrazení F6 Stáčení
**Prereq:** TC-504
**Kroky:** Otevřít `/brewery/batches/{id}/brew/pack`
**Očekáváno:**
- Process bar: ...Ležení ✅, **Stáčení** active
- Stávající stáčecí UI zasazené do brew shellu
- Process bar viditelný v záhlaví

### TC-601: Stáčení — použití stávajícího modulu
**Kroky:** Provést stáčení (dle existující funkcionality)
**Očekáváno:** Stávající stáčecí modul funguje normálně v novém shellu

### TC-602: Lot tracking po stáčení
**Kroky:** Po stáčení otevřít sidebar Tracking šarží
**Očekáváno:**
- Vstupní šarže: suroviny (z F2)
- Výstupní šarže: nastáčené produkty (sudy, lahve) s lot čísly

### TC-603: Přechod F6 → F7
**Kroky:** Klik `[Dokončit var]` (nebo automaticky po stáčení)
**Očekáváno:**
- `current_phase = "completed"`, `end_brew_date = today`
- Redirect na `/brew/done`

---

## 7. F7 — UKONČENO

### TC-700: Zobrazení F7 Ukončeno
**Prereq:** TC-603
**Kroky:** Otevřít `/brewery/batches/{id}/brew/done`
**Očekáváno:**
- Process bar: všechny fáze ✅, **Hotovo** active (zelená)
- Sekce: Souhrn, Doporučené úpravy, Finance

### TC-701: Souhrn — recept vs. skutečnost
**Kroky:** Zkontrolovat tabulku souhrnu
**Očekáváno:**

| Parametr | Recept | Skutečnost | Δ |
|----------|--------|------------|---|
| OG (°P) | 13,3 | 12,8 | -0,5 (červená) |
| Objem (L) | 120 | 125 | +5 (zelená) |
| Efektivita (%) | 71,0 | ~69,7 | -1,3 |

### TC-702: Doporučené úpravy konstant
**Kroky:** Zkontrolovat sekci doporučení
**Očekáváno:** Pokud |Δ efektivita| > 2%:
- "⚠️ Efektivita varny: recept 71%, skutečnost 69,7%."
- "Doporučení: nastavit efektivitu na 70%"
- Tlačítko `[Aplikovat na varní soustavu]`

### TC-703: Aplikovat úpravu na varní soustavu
**Kroky:** Klik `[Aplikovat na varní soustavu]` → potvrdit
**Očekáváno:**
- Brewing system `efficiency_pct` aktualizováno
- Toast: "Varní soustava aktualizována"
- Ověřit v DB: `SELECT efficiency_pct FROM brewing_systems WHERE id = ...`

### TC-704: Finance
**Kroky:** Zkontrolovat sekci Finance
**Očekáváno:**
- Náklady suroviny (Kč)
- Na litr (Kč/L)
- Výpočet odpovídá reálným cenám surovin × množství

### TC-705: Duplikovat var
**Kroky:** Klik `[Duplikovat var]`
**Očekáváno:** Nový var vytvořen ze stejné receptury, redirect na jeho F1 Plán

### TC-706: Sidebar Excise — finální stav
**Kroky:** Sidebar → Spotřební daň
**Očekáváno:** Kompletní přehled pohybů:
- Příjem do skladu (z F3)
- Případné odpisy ztrát (z F3-F5)
- Aktuální daňový stav

### TC-707: Sidebar Tracking — kompletní
**Kroky:** Sidebar → Tracking šarží
**Očekáváno:**
- VSTUP: 6 surovin s lot čísly (z výdeje F2)
- VÝSTUP: nastáčené produkty (z F6)

---

## 8. CROSS-CUTTING

### TC-800: Klasický detail — stále přístupný
**Kroky:** Navigovat na `/brewery/batches/{id}` (bez /brew)
**Očekáváno:** Stávající klasický BatchDetail se zobrazí. Data odpovídají aktuálnímu stavu batche.

### TC-801: Odkaz Klasické zobrazení ↔ Řízení varu
**Kroky:**
1. V brew shellu najít odkaz "Klasické zobrazení" → klik
2. V klasickém detailu najít odkaz "Řízení varu" → klik
**Očekáváno:** Obousměrná navigace funguje

### TC-802: Browser — indikace fáze
**Kroky:** Pivovar → Vary → prohlédnout browser
**Očekáváno:** U varu zobrazena aktuální fáze (např. "Kvašení" místo jen "Probíhá")

### TC-803: Refresh stránky — persistence
**Kroky:** V libovolné fázi (F3) refreshnout browser (F5)
**Očekáváno:** Stejná fáze, všechna data zachována (stopky se resetují — client-side only)

### TC-804: Mobile responsivity
**Kroky:** Otevřít brew UI na mobilním zařízení / DevTools responsive
**Očekáváno:** Layout se přizpůsobí — sloupce se stackují, sidebar funguje jako drawer, process bar horizontálně scrollovatelný

### TC-805: i18n — přepnutí jazyka
**Kroky:** Přepnout na EN → projít F1-F7
**Očekáváno:** Všechny labely přeložené, žádné chybějící klíče (viditelné jako raw keys)

---

## SHRNUTÍ

| Oblast | Počet TC | Priorita |
|--------|----------|----------|
| 0. Založení varu | 5 | 🔴 Critical |
| 1. F1 Plán | 10 | 🔴 Critical |
| 2. F2 Příprava | 10 | 🔴 Critical |
| 3. F3 Var | 16 | 🔴 Critical |
| 4. F4 Kvašení | 10 | 🟡 High |
| 5. F5 Ležení | 5 | 🟡 High |
| 6. F6 Stáčení | 4 | 🟡 High |
| 7. F7 Ukončeno | 8 | 🟡 High |
| 8. Cross-cutting | 6 | 🟢 Medium |
| **Celkem** | **74** | |
