-- ============================================================
-- Sprint 1: CREATE TABLES + RLS POLICIES
-- ============================================================

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

-- === COUNTERS ===
CREATE TABLE IF NOT EXISTS counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  entity text NOT NULL,
  prefix text NOT NULL,
  include_year boolean DEFAULT true,
  current_number integer DEFAULT 0,
  padding integer DEFAULT 3,
  separator text DEFAULT '-',
  reset_yearly boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, entity)
);

-- === COUNTRIES (global codebook — no tenant_id) ===
CREATE TABLE IF NOT EXISTS countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_cs text NOT NULL,
  name_en text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- === UNITS (system + tenant-specific) ===
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name text NOT NULL,
  base_unit text,
  conversion_factor numeric,
  created_at timestamptz DEFAULT now()
);

-- === SHOPS ===
CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  shop_type text NOT NULL,
  address jsonb,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === EQUIPMENT ===
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shop_id uuid REFERENCES shops(id),
  name text NOT NULL,
  equipment_type text NOT NULL,
  volume_l numeric,
  status text DEFAULT 'available',
  current_batch_id uuid,
  properties jsonb DEFAULT '{}',
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === ITEMS ===
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  brand text,

  -- flags
  is_brew_material boolean DEFAULT false,
  is_production_item boolean DEFAULT false,
  is_sale_item boolean DEFAULT false,
  is_excise_relevant boolean DEFAULT false,

  -- stock
  stock_category text,
  issue_mode text DEFAULT 'fifo',
  unit_id uuid REFERENCES units(id),
  base_unit_amount numeric,

  -- material-specific
  material_type text,
  alpha numeric,
  ebc numeric,
  extract_percent numeric,

  -- product-specific
  packaging_type text,
  volume_l numeric,
  abv numeric,
  plato numeric,
  ean text,

  -- pricing
  cost_price numeric,
  avg_price numeric,
  sale_price numeric,
  overhead_manual boolean DEFAULT false,
  overhead_price numeric,

  -- pos / web
  pos_available boolean DEFAULT false,
  web_available boolean DEFAULT false,
  color text,

  -- meta
  image_url text,
  notes text,
  is_active boolean DEFAULT true,
  is_from_library boolean DEFAULT false,
  source_library_id uuid,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_items_tenant_material ON items (tenant_id, material_type);
CREATE INDEX IF NOT EXISTS idx_items_tenant_active ON items (tenant_id, is_active);

-- === CATEGORIES ===
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name text NOT NULL,
  category_type text NOT NULL,
  parent_id uuid,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- === ITEM_CATEGORIES (junction) ===
CREATE TABLE IF NOT EXISTS item_categories (
  item_id uuid NOT NULL REFERENCES items(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  PRIMARY KEY (item_id, category_id)
);

-- === PARTNERS ===
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,

  -- flags
  is_customer boolean DEFAULT false,
  is_supplier boolean DEFAULT false,

  -- legal
  legal_form text,
  ico text,
  dic text,
  dic_validated boolean DEFAULT false,
  legal_form_code text,

  -- contact
  email text,
  phone text,
  mobile text,
  web text,

  -- primary address
  address_street text,
  address_city text,
  address_zip text,
  country_id uuid REFERENCES countries(id),

  -- commercial
  payment_terms integer DEFAULT 14,
  price_list_id uuid,
  credit_limit numeric,

  -- meta
  logo_url text,
  notes text,
  is_active boolean DEFAULT true,
  last_sync_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === CONTACTS ===
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  partner_id uuid NOT NULL REFERENCES partners(id),
  name text NOT NULL,
  position text,
  email text,
  phone text,
  mobile text,
  is_primary boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === ADDRESSES ===
CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  partner_id uuid NOT NULL REFERENCES partners(id),
  address_type text NOT NULL,
  label text,
  street text,
  city text,
  zip text,
  country_id uuid REFERENCES countries(id),
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- === PARTNER BANK ACCOUNTS ===
CREATE TABLE IF NOT EXISTS partner_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  partner_id uuid NOT NULL REFERENCES partners(id),
  bank_name text,
  account_number text,
  iban text,
  swift text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- === ATTACHMENTS ===
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments (tenant_id, entity_type, entity_id);


-- ============================================================
-- 2. ENABLE RLS + CREATE POLICIES
-- ============================================================

-- === COUNTERS ===
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON counters
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === SHOPS ===
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON shops
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === EQUIPMENT ===
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON equipment
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === ITEMS ===
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON items
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === CATEGORIES ===
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant or global" ON categories
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = (current_setting('app.current_tenant_id', true))::uuid
  );

-- === PARTNERS ===
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON partners
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === CONTACTS ===
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON contacts
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === ADDRESSES ===
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON addresses
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === PARTNER BANK ACCOUNTS ===
ALTER TABLE partner_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON partner_bank_accounts
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === ATTACHMENTS ===
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON attachments
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === UNITS ===
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant or global" ON units
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = (current_setting('app.current_tenant_id', true))::uuid
  );

-- === COUNTRIES ===
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON countries
  FOR SELECT USING (true);

-- === ITEM CATEGORIES (junction table) ===
ALTER TABLE item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Via item tenant" ON item_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM items
      WHERE items.id = item_categories.item_id
      AND items.tenant_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );
