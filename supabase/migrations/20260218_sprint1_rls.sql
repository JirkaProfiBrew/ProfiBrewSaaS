-- ============================================================
-- RLS POLICIES — Sprint 1 tables
-- ============================================================

-- Enable RLS on all new tenant-scoped tables
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- === COUNTERS ===
CREATE POLICY "Tenant isolation" ON counters
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === SHOPS ===
CREATE POLICY "Tenant isolation" ON shops
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === EQUIPMENT ===
CREATE POLICY "Tenant isolation" ON equipment
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === ITEMS ===
CREATE POLICY "Tenant isolation" ON items
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === CATEGORIES ===
-- Categories can be global (tenant_id IS NULL) or tenant-specific
CREATE POLICY "Tenant or global" ON categories
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = (current_setting('app.current_tenant_id', true))::uuid
  );

-- === PARTNERS ===
CREATE POLICY "Tenant isolation" ON partners
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === CONTACTS ===
CREATE POLICY "Tenant isolation" ON contacts
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === ADDRESSES ===
CREATE POLICY "Tenant isolation" ON addresses
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === PARTNER BANK ACCOUNTS ===
CREATE POLICY "Tenant isolation" ON partner_bank_accounts
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === ATTACHMENTS ===
CREATE POLICY "Tenant isolation" ON attachments
  FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- === UNITS ===
-- Units can be global (tenant_id IS NULL) or tenant-specific
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant or global" ON units
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = (current_setting('app.current_tenant_id', true))::uuid
  );

-- === COUNTRIES ===
-- Countries are global (read-only codebook, no tenant_id)
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
