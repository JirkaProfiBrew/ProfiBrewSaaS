# PATCH: Hop Form Factor pro IBU výpočet
## ProfiBrew.com | Datum: 03.03.2026

---

## PROBLÉM

IBU výpočet neuvažuje formu chmele. Granulovaný chmel (pelety) má ~10% vyšší utilizaci než hlávkový. Všechny referenční softwary (Brewfather, BeerSmith, Bubble) tento faktor aplikují. Naše IBU vychází systematicky o ~10% nižší.

---

## ŘEŠENÍ

Nový číselník `hop_form` s koeficientem utilizace. Vazba na `items` (typ hop). Koeficient aplikován v IBU výpočtu.

---

## ZMĚNA 1: Číselník hop_form

Systémový číselník (bez tenant_id) — stejný princip jako beer_styles.

```sql
CREATE TABLE hop_forms (
  id          TEXT PRIMARY KEY,        -- 'pellet', 'leaf', 'plug', 'cryo'
  name_cs     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  utilization_factor DECIMAL NOT NULL DEFAULT 1.0,
  sort_order  INTEGER DEFAULT 0
);

INSERT INTO hop_forms (id, name_cs, name_en, utilization_factor, sort_order) VALUES
  ('pellet', 'Granule (pelety)', 'Pellet', 1.10, 1),
  ('leaf',   'Hlávkový',         'Leaf/Whole', 1.00, 2),
  ('plug',   'Plug',             'Plug', 1.02, 3),
  ('cryo',   'Cryo Hops',        'Cryo Hops', 1.10, 4);
```

---

## ZMĚNA 2: Pole hop_form na items

```sql
ALTER TABLE items ADD COLUMN hop_form TEXT REFERENCES hop_forms(id);
```

Drizzle schema `drizzle/schema/items.ts`:
```typescript
hopForm: text("hop_form"),  // FK na hop_forms — jen pro chmele
```

---

## ZMĚNA 3: Item formulář — předvyplnění + povinnost

Když `brew_material_type = 'hop'`:
- Zobrazit pole "Forma chmele" (select z hop_forms)
- Default: `'pellet'`
- Povinné (validace na uložení)

Když `brew_material_type != 'hop'`:
- Pole skryté

---

## ZMĚNA 4: recipe_items — propagace hop_form

`recipe_items` už obsahuje `item_id` → přes JOIN se dostaneme na `items.hop_form`.

Pro výpočet IBU potřebujeme `hop_form` dostupný v `IngredientInput`. Rozšířit interface:

```typescript
// V IngredientInput přidat:
hopForm?: string | null;  // 'pellet' | 'leaf' | 'plug' | 'cryo' | null
```

Při načítání recipe items pro kalkulaci JOINovat `items.hop_form`.

---

## ZMĚNA 5: IBU výpočet — aplikovat hop form factor

**Soubor:** `src/modules/recipes/utils.ts`

V `calculateIBU()`:

```typescript
// Načíst hop_forms lookup (hardcoded nebo z DB cache)
const HOP_FORM_FACTORS: Record<string, number> = {
  pellet: 1.10,
  leaf: 1.00,
  plug: 1.02,
  cryo: 1.10,
};

// V reduce loopu per hop:
const hopFormFactor = HOP_FORM_FACTORS[hop.hopForm ?? 'pellet'] ?? 1.0;
const utilization = tinsethUtilization(boilTime, sg) * hopFormFactor;
```

Pokud `hopForm` není nastavený → default `pellet` (1.10) — odpovídá realitě českých pivovarů.

---

## ZMĚNA 6: Zobrazení v recipe — hop tab

V `HopCard` / hop tabulce v receptu přidat zobrazení formy chmele:

```
Žatecký červeňák    100 g    Granule    α 3.5%    45 min    IBU 6.8
```

Forma chmele zobrazena jako badge nebo text za názvem/množstvím. Read-only (přebírá se z item).

---

## ZMĚNA 7: IBU modální okno — zobrazení hop form faktoru

V modálním okně "Výpočet IBU — Tinseth" u každého chmele přidat řádek:

```
Chmel Žatecký červeňák
Hmotnost: 100 g (0.1000 kg)    α: 3.5% (0.035)
Fáze: boil                      Čas: 45 min
Forma: Granule (×1.10)          ← NOVÝ ŘÁDEK

boilTimeFactor = (1 - e^(-0.04×45)) / 4.15 = 0.2011
U = 1.0562 × 0.2011 = 0.2124
U × hop form = 0.2124 × 1.10 = 0.2336     ← NOVÝ ŘÁDEK
IBU = (0.1000 × 0.2336 × 0.035 × 1000000) / 120.0 = 6.8
```

---

## ZMĚNA 8: i18n

**CS:**
```json
{
  "hopForm": {
    "label": "Forma chmele",
    "pellet": "Granule (pelety)",
    "leaf": "Hlávkový",
    "plug": "Plug",
    "cryo": "Cryo Hops",
    "factor": "Faktor utilizace"
  }
}
```

**EN:**
```json
{
  "hopForm": {
    "label": "Hop Form",
    "pellet": "Pellet",
    "leaf": "Leaf / Whole",
    "plug": "Plug",
    "cryo": "Cryo Hops",
    "factor": "Utilization Factor"
  }
}
```

---

## AKCEPTAČNÍ KRITÉRIA

1. [ ] Tabulka `hop_forms` s 4 záznamy (pellet, leaf, plug, cryo)
2. [ ] `items.hop_form` sloupec existuje
3. [ ] Item formulář: forma chmele zobrazena jen pro hop, default pellet, povinné
4. [ ] `IngredientInput.hopForm` propagován z items přes recipe_items
5. [ ] `calculateIBU()` aplikuje hop form factor na utilization
6. [ ] Default hop form = pellet (1.10) pokud není nastaveno
7. [ ] Hop tab v receptu zobrazuje formu chmele
8. [ ] IBU modální okno zobrazuje hop form faktor v detailu výpočtu
9. [ ] i18n: cs + en
10. [ ] `npm run build` bez chyb
