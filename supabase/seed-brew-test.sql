-- ============================================================
-- SEED: Brew Lifecycle Test Data
-- ============================================================
-- Idempotent: uses ON CONFLICT DO NOTHING / DO UPDATE where applicable.
-- Runnable in Supabase SQL Editor.
-- Assumes at least one tenant already exists (from onboarding).
-- ============================================================

DO $$
DECLARE
  v_tenant_id       UUID;

  -- Units
  v_unit_kg         UUID;
  v_unit_g          UUID;
  v_unit_l          UUID;

  -- Beer style
  v_style_group_id  UUID;
  v_style_id        UUID;

  -- Brewing system
  v_system_id       UUID;

  -- Equipment
  v_ckt1_id         UUID;
  v_ckt2_id         UUID;
  v_lezak1_id       UUID;

  -- Warehouses
  v_wh_suroviny_id  UUID;
  v_wh_pivo_id      UUID;

  -- Items
  v_item_cesky_svetly UUID;
  v_item_vidensky     UUID;
  v_item_mnichovsky   UUID;
  v_item_premiant     UUID;
  v_item_zat_cervenak UUID;
  v_item_saflager     UUID;
  v_item_lezak13      UUID;

  -- Recipe
  v_recipe_id       UUID;

  -- Recipe items (for FK on stock_issue_lines.recipe_item_id)
  v_ri_cesky_svetly UUID;
  v_ri_vidensky     UUID;
  v_ri_mnichovsky   UUID;
  v_ri_premiant     UUID;
  v_ri_zat1         UUID;
  v_ri_zat2         UUID;
  v_ri_saflager     UUID;

  -- Stock issues (receipts)
  v_receipt_id      UUID;

  -- Stock issue lines
  v_sil_cesky_svetly UUID;
  v_sil_vidensky     UUID;
  v_sil_mnichovsky   UUID;
  v_sil_zat_cervenak UUID;
  v_sil_premiant     UUID;
  v_sil_saflager     UUID;

BEGIN
  -- ============================================================
  -- 0. Resolve tenant
  -- ============================================================
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant found — run onboarding first';
  END IF;

  -- ============================================================
  -- 0b. Resolve units + fix base unit factors
  -- ============================================================
  -- Ensure base units have to_base_factor = 1 (not NULL) so calculations work
  UPDATE units SET to_base_factor = 1 WHERE to_base_factor IS NULL AND base_unit_code IS NULL;

  SELECT id INTO v_unit_kg FROM units WHERE code = 'kg';
  SELECT id INTO v_unit_g  FROM units WHERE code = 'g';
  SELECT id INTO v_unit_l  FROM units WHERE code = 'l';

  IF v_unit_kg IS NULL OR v_unit_g IS NULL THEN
    RAISE EXCEPTION 'Required units (kg, g) not found — seed system units first';
  END IF;

  -- ============================================================
  -- 1. Beer Style Group + Beer Style (global — no tenant_id)
  -- ============================================================
  -- Style group: "Czech Lager"
  INSERT INTO beer_style_groups (id, name, name_cz, sort_order)
  VALUES (gen_random_uuid(), 'Czech Lager', 'Český ležák', 10)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_style_group_id
    FROM beer_style_groups
   WHERE name = 'Czech Lager'
   LIMIT 1;

  -- Style: "Czech Premium Pale Lager"
  INSERT INTO beer_styles (id, style_group_id, name, og_min, og_max, fg_min, fg_max,
                           abv_min, abv_max, ibu_min, ibu_max, ebc_min, ebc_max,
                           bjcp_category, bjcp_number, origin, style_family)
  VALUES (gen_random_uuid(), v_style_group_id, 'Czech Premium Pale Lager',
          11.5, 14.0, 2.5, 4.0,
          4.2, 5.8, 25, 45, 6, 14,
          'Czech Beer', '3B', 'Czech Republic', 'Pilsner')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_style_id
    FROM beer_styles
   WHERE name = 'Czech Premium Pale Lager'
   LIMIT 1;

  -- ============================================================
  -- 2. Brewing System: "Varna 120L"
  -- ============================================================
  INSERT INTO brewing_systems (id, tenant_id, name, is_primary, batch_size_l, efficiency_pct,
                               kettle_trub_loss_l, whirlpool_loss_pct,
                               time_preparation, time_lautering, time_whirlpool, time_transfer, time_cleanup,
                               is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'Varna 120L', true, 120, 71,
          12, 11,
          1, 60, 90, 15, 60,
          true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_system_id
    FROM brewing_systems
   WHERE tenant_id = v_tenant_id AND name = 'Varna 120L'
   LIMIT 1;

  -- ============================================================
  -- 3. Equipment (tanks)
  -- ============================================================
  -- CKT-1: fermenter, 300L, available
  INSERT INTO equipment (id, tenant_id, name, equipment_type, volume_l, status, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'CKT-1', 'fermenter', 300, 'available', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ckt1_id FROM equipment WHERE tenant_id = v_tenant_id AND name = 'CKT-1' LIMIT 1;

  -- CKT-2: fermenter, 300L, in_use
  INSERT INTO equipment (id, tenant_id, name, equipment_type, volume_l, status, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'CKT-2', 'fermenter', 300, 'in_use', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ckt2_id FROM equipment WHERE tenant_id = v_tenant_id AND name = 'CKT-2' LIMIT 1;

  -- Ležák-1: brite_tank, 200L, available
  INSERT INTO equipment (id, tenant_id, name, equipment_type, volume_l, status, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'Ležák-1', 'brite_tank', 200, 'available', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_lezak1_id FROM equipment WHERE tenant_id = v_tenant_id AND name = 'Ležák-1' LIMIT 1;

  -- ============================================================
  -- 4. Warehouses
  -- ============================================================
  -- Sklad surovin (raw materials)
  INSERT INTO warehouses (id, tenant_id, code, name, is_excise_relevant, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'SUROVINY', 'Sklad surovin', false, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_wh_suroviny_id
    FROM warehouses
   WHERE tenant_id = v_tenant_id AND code = 'SUROVINY'
   LIMIT 1;

  -- Sklad piva (beer storage, excise-relevant)
  INSERT INTO warehouses (id, tenant_id, code, name, is_excise_relevant, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'PIVO', 'Sklad piva', true, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_wh_pivo_id
    FROM warehouses
   WHERE tenant_id = v_tenant_id AND code = 'PIVO'
   LIMIT 1;

  -- ============================================================
  -- 5. Items
  -- ============================================================

  -- ----- MALTS (stock unit: kg, recipe unit: kg) -----
  -- Český světlý
  INSERT INTO items (id, tenant_id, code, name, is_brew_material, stock_category, material_type,
                     unit_id, recipe_unit_id, ebc, extract_percent, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'CESKY-SVETLY', 'Český světlý', true, 'raw_material', 'malt',
          v_unit_kg, v_unit_kg, 3.5, 80, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_item_cesky_svetly FROM items WHERE tenant_id = v_tenant_id AND code = 'CESKY-SVETLY' LIMIT 1;

  -- Vídeňský
  INSERT INTO items (id, tenant_id, code, name, is_brew_material, stock_category, material_type,
                     unit_id, recipe_unit_id, ebc, extract_percent, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'VIDENSKY', 'Vídeňský', true, 'raw_material', 'malt',
          v_unit_kg, v_unit_kg, 7, 79, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_item_vidensky FROM items WHERE tenant_id = v_tenant_id AND code = 'VIDENSKY' LIMIT 1;

  -- Mnichovský II
  INSERT INTO items (id, tenant_id, code, name, is_brew_material, stock_category, material_type,
                     unit_id, recipe_unit_id, ebc, extract_percent, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'MNICHOVSKY-II', 'Mnichovský II', true, 'raw_material', 'malt',
          v_unit_kg, v_unit_kg, 20, 78, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_item_mnichovsky FROM items WHERE tenant_id = v_tenant_id AND code = 'MNICHOVSKY-II' LIMIT 1;

  -- ----- HOPS -----
  -- Premiant
  INSERT INTO items (id, tenant_id, code, name, is_brew_material, stock_category, material_type,
                     unit_id, recipe_unit_id, alpha, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'PREMIANT', 'Premiant', true, 'raw_material', 'hop',
          v_unit_g, v_unit_g, 8.5, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_item_premiant FROM items WHERE tenant_id = v_tenant_id AND code = 'PREMIANT' LIMIT 1;

  -- Žatecký červeňák
  INSERT INTO items (id, tenant_id, code, name, is_brew_material, stock_category, material_type,
                     unit_id, recipe_unit_id, alpha, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'ZAT-CERVENAK', 'Žatecký červeňák', true, 'raw_material', 'hop',
          v_unit_g, v_unit_g, 3.5, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_item_zat_cervenak FROM items WHERE tenant_id = v_tenant_id AND code = 'ZAT-CERVENAK' LIMIT 1;

  -- ----- YEAST -----
  -- Saflager S-189
  INSERT INTO items (id, tenant_id, code, name, is_brew_material, stock_category, material_type,
                     unit_id, recipe_unit_id, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'SAFLAGER-S189', 'Saflager S-189', true, 'raw_material', 'yeast',
          v_unit_g, v_unit_g, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_item_saflager FROM items WHERE tenant_id = v_tenant_id AND code = 'SAFLAGER-S189' LIMIT 1;

  -- ----- BEER (finished product) -----
  -- Ležák 13°P
  INSERT INTO items (id, tenant_id, code, name, is_production_item, is_excise_relevant, stock_category, is_active)
  VALUES (gen_random_uuid(), v_tenant_id, 'LEZAK-13', 'Ležák 13°P', true, true, 'finished_product', true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_item_lezak13 FROM items WHERE tenant_id = v_tenant_id AND code = 'LEZAK-13' LIMIT 1;

  -- ============================================================
  -- 6. Recipe: "Ležák 13 na velikonoce"
  -- ============================================================
  INSERT INTO recipes (id, tenant_id, name, status, beer_style_id, brewing_system_id, item_id,
                       batch_size_l, og, fg, abv, ibu, ebc, boil_time_min,
                       duration_fermentation_days, duration_conditioning_days)
  VALUES (gen_random_uuid(), v_tenant_id, 'Ležák 13 na velikonoce', 'active',
          v_style_id, v_system_id, v_item_lezak13,
          120, 13.3, 3.3, 5.2, 38, 10, 90,
          7, 21)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_recipe_id
    FROM recipes
   WHERE tenant_id = v_tenant_id AND name = 'Ležák 13 na velikonoce'
   LIMIT 1;

  -- ============================================================
  -- 6a. Recipe Items (ingredients)
  -- ============================================================

  -- Český světlý — malt — mash — 21.2 kg
  INSERT INTO recipe_items (id, tenant_id, recipe_id, item_id, category, amount_g, unit_id, use_stage, use_time_min, sort_order)
  VALUES (gen_random_uuid(), v_tenant_id, v_recipe_id, v_item_cesky_svetly, 'malt', 21.2, v_unit_kg, 'mash', NULL, 0)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ri_cesky_svetly
    FROM recipe_items WHERE recipe_id = v_recipe_id AND item_id = v_item_cesky_svetly LIMIT 1;

  -- Vídeňský — malt — mash — 6.1 kg
  INSERT INTO recipe_items (id, tenant_id, recipe_id, item_id, category, amount_g, unit_id, use_stage, use_time_min, sort_order)
  VALUES (gen_random_uuid(), v_tenant_id, v_recipe_id, v_item_vidensky, 'malt', 6.1, v_unit_kg, 'mash', NULL, 1)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ri_vidensky
    FROM recipe_items WHERE recipe_id = v_recipe_id AND item_id = v_item_vidensky LIMIT 1;

  -- Mnichovský II — malt — mash — 3.0 kg
  INSERT INTO recipe_items (id, tenant_id, recipe_id, item_id, category, amount_g, unit_id, use_stage, use_time_min, sort_order)
  VALUES (gen_random_uuid(), v_tenant_id, v_recipe_id, v_item_mnichovsky, 'malt', 3.0, v_unit_kg, 'mash', NULL, 2)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ri_mnichovsky
    FROM recipe_items WHERE recipe_id = v_recipe_id AND item_id = v_item_mnichovsky LIMIT 1;

  -- Premiant — hop — boil 90min — 120 g
  INSERT INTO recipe_items (id, tenant_id, recipe_id, item_id, category, amount_g, unit_id, use_stage, use_time_min, sort_order)
  VALUES (gen_random_uuid(), v_tenant_id, v_recipe_id, v_item_premiant, 'hop', 120, v_unit_g, 'boil', 90, 3)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ri_premiant
    FROM recipe_items WHERE recipe_id = v_recipe_id AND item_id = v_item_premiant AND use_time_min = 90 LIMIT 1;

  -- Žatecký červeňák — hop — boil 45min — 100 g
  INSERT INTO recipe_items (id, tenant_id, recipe_id, item_id, category, amount_g, unit_id, use_stage, use_time_min, sort_order)
  VALUES (gen_random_uuid(), v_tenant_id, v_recipe_id, v_item_zat_cervenak, 'hop', 100, v_unit_g, 'boil', 45, 4)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ri_zat1
    FROM recipe_items WHERE recipe_id = v_recipe_id AND item_id = v_item_zat_cervenak AND use_time_min = 45 LIMIT 1;

  -- Žatecký červeňák — hop — boil 10min — 100 g
  INSERT INTO recipe_items (id, tenant_id, recipe_id, item_id, category, amount_g, unit_id, use_stage, use_time_min, sort_order)
  VALUES (gen_random_uuid(), v_tenant_id, v_recipe_id, v_item_zat_cervenak, 'hop', 100, v_unit_g, 'boil', 10, 5)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ri_zat2
    FROM recipe_items WHERE recipe_id = v_recipe_id AND item_id = v_item_zat_cervenak AND use_time_min = 10 LIMIT 1;

  -- Saflager S-189 — yeast — fermentation — 100 g
  INSERT INTO recipe_items (id, tenant_id, recipe_id, item_id, category, amount_g, unit_id, use_stage, use_time_min, sort_order)
  VALUES (gen_random_uuid(), v_tenant_id, v_recipe_id, v_item_saflager, 'yeast', 100, v_unit_g, 'fermentation', NULL, 6)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ri_saflager
    FROM recipe_items WHERE recipe_id = v_recipe_id AND item_id = v_item_saflager LIMIT 1;

  -- ============================================================
  -- 6b. Recipe Steps (infusion mashing profile)
  -- ============================================================
  -- Delete existing steps for this recipe to ensure idempotency (steps have no unique constraint)
  DELETE FROM recipe_steps WHERE recipe_id = v_recipe_id;

  INSERT INTO recipe_steps (id, tenant_id, recipe_id, step_type, name, temperature_c, time_min, ramp_time_min, sort_order)
  VALUES
    (gen_random_uuid(), v_tenant_id, v_recipe_id, 'mash_in',  'Vystírka',            52, 10, 5, 0),
    (gen_random_uuid(), v_tenant_id, v_recipe_id, 'rest',     'Nižší cukrotvorná',   63, 25, 8, 1),
    (gen_random_uuid(), v_tenant_id, v_recipe_id, 'rest',     'Vyšší cukrotvorná',   72, 20, 8, 2),
    (gen_random_uuid(), v_tenant_id, v_recipe_id, 'mash_out', 'Odrmut',              78,  5, 5, 3);

  -- ============================================================
  -- 7. Stock Receipts (stock_issues + stock_issue_lines + stock_movements + stock_status)
  -- ============================================================
  -- Create a single receipt document for the initial stock
  v_receipt_id := gen_random_uuid();

  INSERT INTO stock_issues (id, tenant_id, code, movement_type, movement_purpose, date, status, warehouse_id, notes)
  VALUES (v_receipt_id, v_tenant_id, 'SEED-RCP-001', 'receipt', 'purchase', CURRENT_DATE, 'confirmed', v_wh_suroviny_id,
          'Seed: initial stock for brew lifecycle test')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Re-select in case it already existed
  SELECT id INTO v_receipt_id
    FROM stock_issues
   WHERE tenant_id = v_tenant_id AND code = 'SEED-RCP-001'
   LIMIT 1;

  -- Helper: delete existing lines & movements for this receipt (idempotency on re-run)
  DELETE FROM stock_movements WHERE stock_issue_id = v_receipt_id;
  DELETE FROM stock_issue_lines WHERE stock_issue_id = v_receipt_id;

  -- ----- Stock Issue Lines + Movements -----

  -- Český světlý: 259 kg
  v_sil_cesky_svetly := gen_random_uuid();
  INSERT INTO stock_issue_lines (id, tenant_id, stock_issue_id, item_id, line_no, requested_qty, issued_qty, remaining_qty, sort_order)
  VALUES (v_sil_cesky_svetly, v_tenant_id, v_receipt_id, v_item_cesky_svetly, 1, 259, 259, 259, 0);

  INSERT INTO stock_movements (id, tenant_id, item_id, warehouse_id, movement_type, quantity, stock_issue_id, stock_issue_line_id, receipt_line_id, date)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_cesky_svetly, v_wh_suroviny_id, 'in', 259, v_receipt_id, v_sil_cesky_svetly, v_sil_cesky_svetly, CURRENT_DATE);

  -- Vídeňský: 27 kg
  v_sil_vidensky := gen_random_uuid();
  INSERT INTO stock_issue_lines (id, tenant_id, stock_issue_id, item_id, line_no, requested_qty, issued_qty, remaining_qty, sort_order)
  VALUES (v_sil_vidensky, v_tenant_id, v_receipt_id, v_item_vidensky, 2, 27, 27, 27, 1);

  INSERT INTO stock_movements (id, tenant_id, item_id, warehouse_id, movement_type, quantity, stock_issue_id, stock_issue_line_id, receipt_line_id, date)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_vidensky, v_wh_suroviny_id, 'in', 27, v_receipt_id, v_sil_vidensky, v_sil_vidensky, CURRENT_DATE);

  -- Mnichovský II: 164 kg
  v_sil_mnichovsky := gen_random_uuid();
  INSERT INTO stock_issue_lines (id, tenant_id, stock_issue_id, item_id, line_no, requested_qty, issued_qty, remaining_qty, sort_order)
  VALUES (v_sil_mnichovsky, v_tenant_id, v_receipt_id, v_item_mnichovsky, 3, 164, 164, 164, 2);

  INSERT INTO stock_movements (id, tenant_id, item_id, warehouse_id, movement_type, quantity, stock_issue_id, stock_issue_line_id, receipt_line_id, date)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_mnichovsky, v_wh_suroviny_id, 'in', 164, v_receipt_id, v_sil_mnichovsky, v_sil_mnichovsky, CURRENT_DATE);

  -- Žatecký červeňák: 390g
  v_sil_zat_cervenak := gen_random_uuid();
  INSERT INTO stock_issue_lines (id, tenant_id, stock_issue_id, item_id, line_no, requested_qty, issued_qty, remaining_qty, sort_order)
  VALUES (v_sil_zat_cervenak, v_tenant_id, v_receipt_id, v_item_zat_cervenak, 4, 390, 390, 390, 3);

  INSERT INTO stock_movements (id, tenant_id, item_id, warehouse_id, movement_type, quantity, stock_issue_id, stock_issue_line_id, receipt_line_id, date)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_zat_cervenak, v_wh_suroviny_id, 'in', 390, v_receipt_id, v_sil_zat_cervenak, v_sil_zat_cervenak, CURRENT_DATE);

  -- Premiant: 53g
  v_sil_premiant := gen_random_uuid();
  INSERT INTO stock_issue_lines (id, tenant_id, stock_issue_id, item_id, line_no, requested_qty, issued_qty, remaining_qty, sort_order)
  VALUES (v_sil_premiant, v_tenant_id, v_receipt_id, v_item_premiant, 5, 53, 53, 53, 4);

  INSERT INTO stock_movements (id, tenant_id, item_id, warehouse_id, movement_type, quantity, stock_issue_id, stock_issue_line_id, receipt_line_id, date)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_premiant, v_wh_suroviny_id, 'in', 53, v_receipt_id, v_sil_premiant, v_sil_premiant, CURRENT_DATE);

  -- Saflager S-189: 100g
  v_sil_saflager := gen_random_uuid();
  INSERT INTO stock_issue_lines (id, tenant_id, stock_issue_id, item_id, line_no, requested_qty, issued_qty, remaining_qty, sort_order)
  VALUES (v_sil_saflager, v_tenant_id, v_receipt_id, v_item_saflager, 6, 100, 100, 100, 5);

  INSERT INTO stock_movements (id, tenant_id, item_id, warehouse_id, movement_type, quantity, stock_issue_id, stock_issue_line_id, receipt_line_id, date)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_saflager, v_wh_suroviny_id, 'in', 100, v_receipt_id, v_sil_saflager, v_sil_saflager, CURRENT_DATE);

  -- ============================================================
  -- 7b. Stock Status (current balances)
  -- ============================================================
  -- Use ON CONFLICT to update if already exists (idempotent)

  INSERT INTO stock_status (id, tenant_id, item_id, warehouse_id, quantity, reserved_qty)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_cesky_svetly, v_wh_suroviny_id, 259, 0)
  ON CONFLICT (tenant_id, item_id, warehouse_id)
    DO UPDATE SET quantity = 259, reserved_qty = 0, updated_at = now();

  INSERT INTO stock_status (id, tenant_id, item_id, warehouse_id, quantity, reserved_qty)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_vidensky, v_wh_suroviny_id, 27, 0)
  ON CONFLICT (tenant_id, item_id, warehouse_id)
    DO UPDATE SET quantity = 27, reserved_qty = 0, updated_at = now();

  INSERT INTO stock_status (id, tenant_id, item_id, warehouse_id, quantity, reserved_qty)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_mnichovsky, v_wh_suroviny_id, 164, 0)
  ON CONFLICT (tenant_id, item_id, warehouse_id)
    DO UPDATE SET quantity = 164, reserved_qty = 0, updated_at = now();

  INSERT INTO stock_status (id, tenant_id, item_id, warehouse_id, quantity, reserved_qty)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_zat_cervenak, v_wh_suroviny_id, 390, 0)
  ON CONFLICT (tenant_id, item_id, warehouse_id)
    DO UPDATE SET quantity = 390, reserved_qty = 0, updated_at = now();

  INSERT INTO stock_status (id, tenant_id, item_id, warehouse_id, quantity, reserved_qty)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_premiant, v_wh_suroviny_id, 53, 0)
  ON CONFLICT (tenant_id, item_id, warehouse_id)
    DO UPDATE SET quantity = 53, reserved_qty = 0, updated_at = now();

  INSERT INTO stock_status (id, tenant_id, item_id, warehouse_id, quantity, reserved_qty)
  VALUES (gen_random_uuid(), v_tenant_id, v_item_saflager, v_wh_suroviny_id, 100, 0)
  ON CONFLICT (tenant_id, item_id, warehouse_id)
    DO UPDATE SET quantity = 100, reserved_qty = 0, updated_at = now();

  -- ============================================================
  -- Done
  -- ============================================================
  RAISE NOTICE '✅ Brew lifecycle test data seeded successfully.';
  RAISE NOTICE '   Tenant:         %', v_tenant_id;
  RAISE NOTICE '   Brewing System:  % (Varna 120L)', v_system_id;
  RAISE NOTICE '   Recipe:          % (Ležák 13 na velikonoce)', v_recipe_id;
  RAISE NOTICE '   Equipment:       CKT-1=%, CKT-2=%, Ležák-1=%', v_ckt1_id, v_ckt2_id, v_lezak1_id;
  RAISE NOTICE '   Warehouses:      SUROVINY=%, PIVO=%', v_wh_suroviny_id, v_wh_pivo_id;
  RAISE NOTICE '   Receipt:         % (SEED-RCP-001)', v_receipt_id;

END $$;
