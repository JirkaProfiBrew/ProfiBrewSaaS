-- ============================================================
-- RLS POLICIES — Sprint 0: Basic tenant isolation
-- ============================================================

-- Enable RLS on tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- tenant_users: user can only see their own memberships
-- ------------------------------------------------------------
CREATE POLICY "Users can view own tenant memberships"
  ON tenant_users FOR SELECT
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- tenants: user can only see tenants where they are a member
-- ------------------------------------------------------------
CREATE POLICY "Users can view own tenants"
  ON tenants FOR SELECT
  USING (id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- user_profiles: user can view and edit their own profile
-- ------------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- ------------------------------------------------------------
-- saved_views: user can manage own views + see shared views in their tenant
-- ------------------------------------------------------------
CREATE POLICY "Users can view own and shared views"
  ON saved_views FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
    AND (user_id = auth.uid() OR is_shared = true)
  );

CREATE POLICY "Users can insert own views"
  ON saved_views FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own views"
  ON saved_views FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own views"
  ON saved_views FOR DELETE
  USING (user_id = auth.uid());
