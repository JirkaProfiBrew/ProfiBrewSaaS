-- Sprint 3: Stock module schema
-- Warehouses, Stock Issues, Stock Movements, FIFO Allocations, Stock Status, Material Lots
-- Also: counters.warehouse_id extension, items.base_item_id/base_item_quantity

-- ============================================================
-- 1. WAREHOUSES
-- ============================================================
CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "shop_id" uuid REFERENCES "shops"("id"),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "is_excise_relevant" boolean DEFAULT false,
  "categories" text[],
  "is_default" boolean DEFAULT false,
  "is_active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_code" UNIQUE ("tenant_id", "code");

-- RLS
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_tenant_isolation" ON "warehouses"
  USING ("tenant_id" = (current_setting('app.tenant_id', true))::uuid);

-- ============================================================
-- 2. COUNTERS — add warehouse_id column
-- ============================================================
ALTER TABLE "counters" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;

-- Drop old unique constraint and create new one (tenant_id, entity, warehouse_id)
ALTER TABLE "counters" DROP CONSTRAINT IF EXISTS "counters_tenant_entity";
ALTER TABLE "counters" ADD CONSTRAINT "counters_tenant_entity_warehouse"
  UNIQUE ("tenant_id", "entity", "warehouse_id");

-- ============================================================
-- 3. ITEMS — add base_item columns
-- ============================================================
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "base_item_id" uuid REFERENCES "items"("id");
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "base_item_quantity" decimal;

-- ============================================================
-- 4. STOCK ISSUES
-- ============================================================
CREATE TABLE IF NOT EXISTS "stock_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "code" text NOT NULL,
  "code_number" integer,
  "code_prefix" text,
  "counter_id" uuid REFERENCES "counters"("id"),
  "movement_type" text NOT NULL,
  "movement_purpose" text NOT NULL,
  "date" date NOT NULL,
  "status" text DEFAULT 'draft',
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "partner_id" uuid REFERENCES "partners"("id"),
  "order_id" uuid,
  "batch_id" uuid REFERENCES "batches"("id"),
  "season" text,
  "additional_cost" decimal DEFAULT 0,
  "total_cost" decimal DEFAULT 0,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_tenant_code" UNIQUE ("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "idx_stock_issues_tenant_status" ON "stock_issues" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_stock_issues_tenant_date" ON "stock_issues" ("tenant_id", "date");

-- RLS
ALTER TABLE "stock_issues" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_issues_tenant_isolation" ON "stock_issues"
  USING ("tenant_id" = (current_setting('app.tenant_id', true))::uuid);

-- ============================================================
-- 5. STOCK ISSUE LINES
-- ============================================================
CREATE TABLE IF NOT EXISTS "stock_issue_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "stock_issue_id" uuid NOT NULL REFERENCES "stock_issues"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "items"("id"),
  "line_no" integer,
  "requested_qty" decimal NOT NULL,
  "issued_qty" decimal,
  "missing_qty" decimal,
  "unit_price" decimal,
  "total_cost" decimal,
  "issue_mode_snapshot" text,
  "notes" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_stock_issue_lines_issue" ON "stock_issue_lines" ("stock_issue_id");

-- RLS
ALTER TABLE "stock_issue_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_issue_lines_tenant_isolation" ON "stock_issue_lines"
  USING ("tenant_id" = (current_setting('app.tenant_id', true))::uuid);

-- ============================================================
-- 6. STOCK MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "items"("id"),
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "movement_type" text NOT NULL,
  "quantity" decimal NOT NULL,
  "unit_price" decimal,
  "stock_issue_id" uuid REFERENCES "stock_issues"("id"),
  "stock_issue_line_id" uuid REFERENCES "stock_issue_lines"("id"),
  "order_id" uuid,
  "batch_id" uuid REFERENCES "batches"("id"),
  "lot_id" uuid,
  "is_closed" boolean DEFAULT false,
  "date" date NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_stock_movements_item_warehouse" ON "stock_movements" ("tenant_id", "item_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_date" ON "stock_movements" ("tenant_id", "date");

-- RLS
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_tenant_isolation" ON "stock_movements"
  USING ("tenant_id" = (current_setting('app.tenant_id', true))::uuid);

-- ============================================================
-- 7. STOCK ISSUE ALLOCATIONS (FIFO/LIFO)
-- ============================================================
CREATE TABLE IF NOT EXISTS "stock_issue_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "stock_issue_line_id" uuid NOT NULL REFERENCES "stock_issue_lines"("id"),
  "source_movement_id" uuid NOT NULL REFERENCES "stock_movements"("id"),
  "quantity" decimal NOT NULL,
  "unit_price" decimal NOT NULL,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_stock_issue_allocations_line" ON "stock_issue_allocations" ("stock_issue_line_id");

-- RLS
ALTER TABLE "stock_issue_allocations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_issue_allocations_tenant_isolation" ON "stock_issue_allocations"
  USING ("tenant_id" = (current_setting('app.tenant_id', true))::uuid);

-- ============================================================
-- 8. STOCK STATUS (materialized current levels)
-- ============================================================
CREATE TABLE IF NOT EXISTS "stock_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "items"("id"),
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "quantity" decimal DEFAULT 0,
  "reserved_qty" decimal DEFAULT 0,
  "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE "stock_status" ADD CONSTRAINT "stock_status_tenant_item_warehouse"
  UNIQUE ("tenant_id", "item_id", "warehouse_id");

-- RLS
ALTER TABLE "stock_status" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_status_tenant_isolation" ON "stock_status"
  USING ("tenant_id" = (current_setting('app.tenant_id', true))::uuid);

-- ============================================================
-- 9. MATERIAL LOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS "material_lots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "items"("id"),
  "lot_number" text NOT NULL,
  "supplier_id" uuid REFERENCES "partners"("id"),
  "received_date" date,
  "expiry_date" date,
  "quantity_initial" decimal,
  "quantity_remaining" decimal,
  "unit_price" decimal,
  "properties" jsonb DEFAULT '{}',
  "notes" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_material_lots_item" ON "material_lots" ("tenant_id", "item_id");

-- RLS
ALTER TABLE "material_lots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_lots_tenant_isolation" ON "material_lots"
  USING ("tenant_id" = (current_setting('app.tenant_id', true))::uuid);

-- ============================================================
-- 10. Add FK on batch_material_lots.lot_id (now that material_lots exists)
-- ============================================================
ALTER TABLE "batch_material_lots" ADD CONSTRAINT "batch_material_lots_lot_fk"
  FOREIGN KEY ("lot_id") REFERENCES "material_lots"("id");
