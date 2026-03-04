# Pokyn pro Claude Code: Brew Lifecycle — Opravy z testování
## ProfiBrew.com | Sprint patch | 04.03.2026

Níže jsou opravy rozdělené do 5 logických skupin. Zpracovávej skupiny postupně, po každé skupině potvrď co bylo hotovo.

---

## SKUPINA A — Kritické bugy blokující použitelnost (P1 BUG)

### A1 — #009 SYSTÉMOVÝ BUG: Přechody fází se nepromítnou do UI

**Problém:** Po stisku tlačítka přechodu fáze (Zahájit přípravu, Zahájit var, atd.) server akci provede, ale FE zůstane na původní fázi. Uživatel musí var zavřít a znovu otevřít. Potvrzeno pro F1→F2 a F2→F3, pravděpodobně postihuje všechny přechody F1–F7.

**Řešení:** Po úspěšném server action volání pro změnu fáze varu zajistit reaktivní aktualizaci UI. Použít `router.refresh()` nebo `revalidatePath()` na stránce detailu varu po každém úspěšném přechodu fáze. Zkontrolovat všechna tlačítka přechodů fází v celém lifecycle (F1→F2, F2→F3, F3→F4, F4→F5, F5→F6, F6→F7) a aplikovat konzistentně.

---

### A2 — #015 BUG: Tracking šarží prázdný po výdeji surovin

**Problém:** Sidebar "Tracking šarží" na detailu varu zůstává prázdný i po provedení výdeje surovin ze skladu. Pohyby ze skladové výdejky (výdejka vázaná na batch) se nepromítají do tracking panelu.

**Řešení:** Najít query/komponentu sidebaru "Tracking šarží". Ověřit, zda se tracking items načítají správně přes `batch_id` vazbu na skladové pohyby (`stock_movements` nebo ekvivalent). Opravit query nebo vazbu tak, aby se zobrazily všechny pohyby suroviny vázané na daný var (batch). Ověřit i revalidaci po výdeji — sidebar musí být aktuální bez nutnosti refreshe.

---

### A3 — #018 BUG: Sidebar "Voda a objemy" zobrazuje jen 2 hodnoty

**Problém:** Sidebar Voda a objemy zobrazuje pouze "Objem" a "Objem při zakvašení". Všechny ostatní objemy chybí.

**Řešení:** Rozšířit komponentu sidebaru "Voda a objemy" o kompletní sadu hodnot z receptu/varu v tomto chronologickém pořadí:
1. Voda na vystírku
2. Voda na vyslazování
3. Voda celkem
4. Voda - potřebí apod.
5. Objem díla
6. Objem sladiny
7. Objem po chmelovaru
8. Objem při zakvašení

Hodnoty jsou dostupné na snapshotu receptu vázaného na var. Zobrazit všechny — pokud hodnota není vyplněna, zobrazit `—`.

---

## SKUPINA B — Kritické ENH (P1 ENH)

### B1 — #011 ENH: Odkaz na snapshot receptu ve všech fázích varu

**Požadavek:** Odkaz na recept musí být dostupný ve všech fázích varu F1–F7. Aktuálně chybí v některých fázích (potvrzeno: F2 Příprava).

**Řešení:**
- Přidat odkaz/tlačítko na recept do záhlaví nebo persistentní části UI detailu varu tak, aby byl viditelný ve všech fázích.
- Odkaz musí vést na `recipe_id` (snapshot varu, `status = batch_snapshot`) — **NE** na `source_recipe_id` (originální recept). Viz bug #001.
- Chování dle fáze:
  - **F1 Plán**: recept otevřít jako editovatelný (lze měnit před zahájením)
  - **F2–F7**: recept otevřít jako read-only (snapshot je uzamčen)
- Recept otevírat v novém tabu nebo se zajistit, že tlačítko "zpět" vede zpět na var (ne do seznamu receptur). Viz #002.

---

### B2 — #008 ENH: Timeline-based dostupnost tanků při plánování varu

**Problém:** Výběr disponibilních tanků ve F1 Plán filtruje dle aktuálního `stav` tanku (snapshot). Tank obsazený dnes se nezobrazí pro var za 14 dní; tank dnes volný se zobrazí, i když je rezervován jiným plánovaným varem.

**Řešení:** Nahradit filtr `stav = volný` dotazem na **časovou dostupnost**:
- Tank je disponibilní pro plánovaný var, pokud **nemá překryv** s časovým oknem jiného varu (fáze kvašení + ležení) ve stejném termínu.
- Časové okno varu = `planned_fermentation_start` až `planned_maturation_end` (nebo ekvivalentní pole).
- Query: vrátit tanky, kde neexistuje jiný batch ve stavu F4/F5 (kvašení/ležení) s overlappujícím časovým oknem s plánovaným termínem aktuálního varu.
- Pokud tato pole ještě neexistují v DB schématu, konzultovat přístup před implementací.

---

## SKUPINA C — Záhlaví varu a provozovna (P2)

### C1 — #004 ENH: Záhlaví varu — povinné identifikační údaje

**Požadavek:** Záhlaví detailu varu musí obsahovat: **Číslo varu**, **Číslo šarže**, **Provozovna**.
Přidat tyto hodnoty do záhlaví komponenty BatchDetail (nebo ekvivalentu) viditelně ve všech fázích.

### C2 — #005 ENH: Pole Provozovna povinné při zakládání zařízení

**Požadavek:** Ve formuláři přidání nového zařízení (tanky, varní zařízení) označit pole `provozovna` jako povinné (`required`). Přidat validaci na FE i BE.

### C3 — #006 ENH: Filtrovat zařízení dle provozovny z hlavičky varu

**Požadavek:** Ve F1 Plán — výběr varního zařízení a disponibilních tanků filtrovat pouze na zařízení patřící ke stejné provozovně jako var. Provozovna varu je definována v záhlaví (viz C1). Zobrazovat pouze `equipment` kde `provozovna_id = batch.provozovna_id`.

---

## SKUPINA D — Suroviny, výdejka a sklad (P2)

### D1 — #013 BUG: Sloučit duplicitní řádky surovin (stejný kód = 1 řádek)

**Problém:** Tab Suroviny ve F2 Příprava i výdejka zobrazují tutéž surovinu jako více řádků (např. Chmel Apollo 4× s různými množstvími z různých chmelových dávek receptu).

**Řešení:** Při sestavování seznamu surovin pro výdej agregovat položky dle `item_id` (kódu položky) — sečíst množství všech dávek stejné suroviny do jednoho řádku. Výdejka generovaná z tohoto seznamu bude mít každou surovinu jednou. Poznámka: dávkování chmele (čas přidání) zůstává v receptu, pro výdej/navážení není relevantní.

### D2 — #012 BUG: Zaokrouhlení množství na výdejce

**Problém:** Floating point chyby — množství jako `7.5659999999999999` nebo `3.7829999999999995`.

**Řešení:** Při výpočtu množství surovin pro var aplikovat `Math.round()` nebo `toFixed()` na max. 3 desetinná místa. Opravit na všech místech kde se zobrazuje množství suroviny: tab Suroviny, výdejka (tiskový náhled i datový výstup).

### D3 — #010 ENH: Tab Suroviny — přidat sloupec "Skladem"

**Požadavek:** Do tabulky surovin ve F2 Příprava přidat sloupec **"Skladem"** zobrazující aktuální skladové množství dané suroviny (`current_stock` nebo ekvivalent z inventory). Sloupce tabulky (návrh pořadí): `#` | `Položka` | `Požadované mn.` | `Skladem` | `Skutečné` | `Chybějící` | `Jedn. cena` | `Celkem` | `Poznámka`.

### D4 — #014 ENH: Částečný výdej surovin + opakovaný výdej

**Požadavek:**
1. Stav "Suroviny vydány" zobrazit **pouze pokud jsou vydány 100 % surovin**. Při částečném výdeji zobrazit "Suroviny vydány částečně" s indikací konkrétních chybějících položek.
2. Tlačítko pro výdej (nebo doplňkový výdej) zůstane aktivní i po prvním výdeji, pokud existují nevydané položky. Po naskladnění chybějící suroviny umožnit vydání zbytku bez nutnosti rušit celý výdej.

---

## SKUPINA E — UX a časový plán (P2/P3)

### E1 — #003 UX: Časový plán — opravit výpočet a popis

**Problém:** "Odhad rmutování" a "Odhad celkem" jsou shodné hodnoty.

**Řešení:** Nahradit tyto dva řádky:
1. **Odhad celkového času varu** = součet rmutovacího profilu (suma trvání kroků) + časy z varního zařízení (`brewing_equipment`: příprava, scezování, chmelovar, whirlpool, transfer, úklid)
2. **Předpokládaný konec varu** = `planned_start` + `Odhad celkového času varu` (zobrazit jako datetime)

### E2 — #019 ENH: Kroky vaření s časem začátku/konce již ve F2 Příprava

**Požadavek:** Ve F2 Příprava zobrazit kompletní timeline kroků varu (nejen rmutovací profil):
- Příprava (napouštění vody)
- Rmutovací kroky (dle profilu receptu)
- Scezování
- Chmelovar (s chmelovými dávkami dle časů)
- Whirlpool
- Chlazení
- Transfer

Každý krok: `název` | `trvání` | `čas začátku` | `čas konce`. Časy odvozeny od `planned_start` varu. Trvání kroků přebrat z `brewing_equipment` zařízení přiřazeného k varu.

### E3 — #016 BUG: Chybí UI pro přidání poznámky ve F2 Příprava

**Problém:** Tlačítko/pole pro přidání nové poznámky ve F2 Příprava není dostupné nebo nefunguje.

**Řešení:** Ověřit existenci komponenty pro přidání poznámky. Pokud chybí, přidat tlačítko "Přidat poznámku" s inline formulářem (textarea + uložit). Poznámky vázat na `batch_id` + `phase` (aby bylo jasné ke které fázi poznámka patří). Pokud komponenta existuje ale nefunguje, opravit chybu.

### E4 — #007 ENH: CKT do výběru nádob pro kvašení + autofill ležení

**Požadavek:**
1. Do výběru nádoby pro kvašení (F1 Plán) zahrnout i nádoby typu `CKT` (cylindro-kónické tanky), nejen klasické kvasné nádoby.
2. Po výběru CKT pro kvašení automaticky předvyplnit **stejný tank** i do pole pro ležení — CKT slouží pro obě fáze. Autofill přepsat pokud uživatel ručně vybere jiný tank pro ležení.

### E5 — #017 UX: Sidebar Náhled receptu — Brewfather styl (P3)

**Požadavek:** Redesign komponenty sidebaru "Náhled receptu" dle vizuálního stylu Brewfather:
- Kompaktní sekce s jasným nadpisem
- Důraz na klíčové hodnoty: `°P`, `OG`, `IBU`, `Barva`
- Sekce Objemy — kompaktní tabulka
- Rmutovací profil — kroky s teplotou a časem
- Suroviny — slad s %, chmel s časem přidání, kvasnice, ostatní
- Čitelná typografie, vizuální hierarchie

---

## Poznámky k implementaci

- Po každé skupině spusť build a ověř že nedošlo k regresi
- Bugy #001 (snapshot vs. originál) a #002 (tlačítko zpět) jsou součástí B1 — neřeš je samostatně
- Bug #008 (timeline dostupnost) je architektonicky náročnější — pokud narazíš na komplikace se schématem, zastav se a konzultuj před implementací
- Veškeré změny dokumentuj v `docs/CHANGELOG.md`
