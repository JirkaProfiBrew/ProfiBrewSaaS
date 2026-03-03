# PATCH: Yeast Form — forma kvasnic s výchozí MJ
## ProfiBrew.com | Datum: 03.03.2026

---

## PROBLÉM

U položek typu kvasnice se nabízejí jednotky g a ks — obojí nesprávné pro tekuté kvasnice. Chybí rozlišení formy (sušené/tekuté), od které se odvíjí správná měrná jednotka.

---

## ŘEŠENÍ

Nový číselník `yeast_form` s vazbou na výchozí MJ. Vazba na `items` (typ yeast). Při výběru formy se automaticky nastaví odpovídající jednotka.

---

## ZMĚNA 1: Číselník yeast_forms

Systémový číselník (bez tenant_id).

```sql
CREATE TABLE yeast_forms (
  id          TEXT PRIMARY KEY,        -- 'dry', 'liquid'
  name_cs     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  default_unit TEXT NOT NULL,          -- 'g', 'ml'
  sort_order  INTEGER DEFAULT 0
);

INSERT INTO yeast_forms (id, name_cs, name_en, default_unit, sort_order) VALUES
  ('dry',    'Sušené',  'Dry',    'g',  1),
  ('liquid', 'Tekuté',  'Liquid', 'ml', 2);
```

---

## ZMĚNA 2: Pole yeast_form na items

```sql
ALTER TABLE items ADD COLUMN yeast_form TEXT REFERENCES yeast_forms(id);
```

Drizzle schema `drizzle/schema/items.ts`:
```typescript
yeastForm: text("yeast_form"),  // FK na yeast_forms — jen pro kvasnice
```

---

## ZMĚNA 3: Item formulář — předvyplnění + povinnost

Když `brew_material_type = 'yeast'`:
- Zobrazit pole "Forma kvasnic" (select z yeast_forms)
- Default: `'dry'`
- Povinné (validace na uložení)
- Při změně formy → automaticky přepnout MJ:
  - `dry` → g
  - `liquid` → ml

Když `brew_material_type != 'yeast'`:
- Pole skryté

---

## ZMĚNA 4: Jednotky — zajistit dostupnost ml

Ověřit že `ml` existuje v systému jednotek (units). Pokud ne:

```sql
-- Zkontrolovat existující units
SELECT * FROM units WHERE code IN ('g', 'ml', 'ks');
```

Pokud `ml` chybí, přidat:
```sql
INSERT INTO units (code, name_cs, name_en, unit_type, base_unit, to_base_factor)
VALUES ('ml', 'ml', 'ml', 'volume', 'l', 0.001)
ON CONFLICT DO NOTHING;
```

Pozn.: Ověřit jak jsou units implementovány — může být enum, tabulka, nebo hardcoded. Přizpůsobit implementaci.

---

## ZMĚNA 5: Filtrace dostupných MJ dle formy

Na item formuláři pro kvasnice — omezit nabídku MJ:
- `dry` → g, kg
- `liquid` → ml, l

Ostatní jednotky (ks, apod.) se pro kvasnice nenabízejí.

---

## ZMĚNA 6: Recipe — zobrazení formy kvasnic

V recipe detail / yeast sekci přidat zobrazení formy:

```
Saflager S-189    100 g    Sušené
Wyeast 2124       200 ml   Tekuté
```

Forma zobrazena jako text/badge za množstvím. Read-only (přebírá se z item).

---

## ZMĚNA 7: Migrace stávajících dat

Stávající kvasnicové položky nemají `yeast_form`. Nastavit default:

```sql
UPDATE items 
SET yeast_form = 'dry' 
WHERE brew_material_type = 'yeast' 
  AND yeast_form IS NULL;
```

Pokud `brew_material_type` není přesně takto (ověřit skutečný název sloupce/hodnoty), upravit WHERE.

---

## ZMĚNA 8: i18n

**CS:**
```json
{
  "yeastForm": {
    "label": "Forma kvasnic",
    "dry": "Sušené",
    "liquid": "Tekuté"
  }
}
```

**EN:**
```json
{
  "yeastForm": {
    "label": "Yeast Form",
    "dry": "Dry",
    "liquid": "Liquid"
  }
}
```

---

## AKCEPTAČNÍ KRITÉRIA

1. [ ] Tabulka `yeast_forms` s 2 záznamy (dry, liquid)
2. [ ] `items.yeast_form` sloupec existuje
3. [ ] Item formulář: forma kvasnic zobrazena jen pro yeast, default dry, povinné
4. [ ] Změna formy → automatické přepnutí MJ (dry→g, liquid→ml)
5. [ ] Jednotka `ml` dostupná v systému
6. [ ] Nabídka MJ filtrována dle formy (dry: g/kg, liquid: ml/l)
7. [ ] Recipe zobrazuje formu kvasnic
8. [ ] Stávající kvasnice migrovány na `yeast_form = 'dry'`
9. [ ] i18n: cs + en
10. [ ] `npm run build` bez chyb
