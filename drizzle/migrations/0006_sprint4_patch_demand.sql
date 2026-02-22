-- Sprint 4 Patch: Demand model schema changes

-- P1.1 stock_issue_lines: order_item_id link to order items
ALTER TABLE stock_issue_lines
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id);

-- P1.2 recipe_items: reserved_qty prep for post-MVP reservations
ALTER TABLE recipe_items
  ADD COLUMN IF NOT EXISTS reserved_qty DECIMAL DEFAULT 0;

-- P1.3 order_items: reserved_qty prep for post-MVP reservations
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS reserved_qty DECIMAL DEFAULT 0;

-- P1.4 stock_issues: drop is_reserved (architecturally wrong — belongs on demand line)
ALTER TABLE stock_issues DROP COLUMN IF EXISTS is_reserved;
