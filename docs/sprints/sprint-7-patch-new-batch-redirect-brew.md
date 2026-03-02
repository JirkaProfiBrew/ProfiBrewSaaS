# PATCH: Nový var → redirect na /brew/plan
## Batch Creation Flow | ProfiBrew.com
### Datum: 02.03.2026

**Prerekvizita:** Fáze B z `batch-brew-management-impl.md` musí být hotová (route `/brew/plan` existuje).

---

## CÍL

Po založení nového varu se uživatel ocitne rovnou ve fázi F1 Plán (nový brew layout), ne na klasickém detailu.

---

## ZMĚNA 1: Zjednodušit formulář pro nový var

**Soubor:** `src/modules/batches/components/BatchDetail.tsx`

Stávající `createFormSection` obsahuje: `recipeId`, `plannedDate`, `equipmentId`, `notes`.

Zúžit na:
- `recipeId` — povinné (validace: pokud prázdné → error "Vyberte recepturu")
- `plannedDate` — volitelné, default = dnes

Odstranit z create formu:
- `equipmentId` — přesunuto do F1 Plán
- `notes` — přesunuto do F1 Plán

```typescript
const createFormSection: FormSectionConfig = useMemo(
  () => ({
    title: t("createDialog.title"),
    fields: [
      {
        key: "recipeId",
        label: t("form.recipe"),
        type: "relation",
        options: recipeOptions,
        required: true,
      },
      {
        key: "plannedDate",
        label: t("form.plannedDate"),
        type: "date",
        defaultValue: new Date().toISOString().split("T")[0],
      },
    ],
  }),
  [t, recipeOptions]
);
```

---

## ZMĚNA 2: Redirect po vytvoření → /brew

**Soubor:** `src/modules/batches/components/BatchDetail.tsx`

V `doSave` callback, větev `isNew`:

```typescript
// STÁVAJÍCÍ:
router.push(`/brewery/batches/${result.id}`);

// NOVÝ:
router.push(`/brewery/batches/${result.id}/brew`);
```

Route `/brew` (page.tsx) automaticky redirectne na `/brew/plan` (aktuální fáze = "plan").

---

## ZMĚNA 3: createBatch — nastavit current_phase

**Soubor:** `src/modules/batches/actions.ts`

V `createBatch()`, při insertu do `batches`, přidat:

```typescript
currentPhase: "plan",
phaseHistory: {
  plan: {
    started_at: new Date().toISOString(),
    completed_at: null,
  },
},
```

Tím se nový batch rovnou inicializuje ve fázi "plan".

---

## ZMĚNA 4: Validace recipeId

**Soubor:** `src/modules/batches/components/BatchDetail.tsx`

V `handleSave` (nebo `doSave`), přidat validaci:

```typescript
if (isNew && !values.recipeId) {
  setErrors({ recipeId: t("validation.recipeRequired") });
  return;
}
```

**i18n doplnit:**
```json
{
  "validation": {
    "recipeRequired": "Vyberte recepturu pro založení varu"
  }
}
```

---

## ZMĚNA 5: createBatch input — equipmentId a notes volitelné

**Soubor:** `src/modules/batches/components/BatchDetail.tsx`

V `doSave`, větev `isNew` — posílat jen recipeId a plannedDate:

```typescript
const result = await createBatch({
  recipeId: String(values.recipeId),
  plannedDate: values.plannedDate ? String(values.plannedDate) : null,
  equipmentId: null,  // Bude se vybírat v F1 Plán
  notes: null,
});
```

---

## CO NEMĚNIT

- `createBatch()` server action — logika snapshotování receptury zůstává beze změny
- Klasický detail (`/brewery/batches/[id]`) — zachovat, je to fallback/debug view
- Browser tlačítko "+ Várka" — odkaz zůstává na `/brewery/batches/new`
- Edit mode BatchDetail — beze změny

---

## AKCEPTAČNÍ KRITÉRIA

1. [ ] Klik "+ Várka" → formulář jen s recepturou (povinná) a datem (volitelné, default dnes)
2. [ ] Validace: bez receptury nelze uložit
3. [ ] Po uložení → redirect na `/brewery/batches/{id}/brew` → auto-redirect na `/brew/plan`
4. [ ] Nový batch má `current_phase = "plan"` a `phase_history` s plan.started_at
5. [ ] Stávající edit mode BatchDetail nezměněn
6. [ ] `npm run build` bez chyb
