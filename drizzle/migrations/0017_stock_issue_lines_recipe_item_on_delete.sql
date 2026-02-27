-- Fix FK constraint: stock_issue_lines.recipe_item_id → recipe_items.id
-- Change from RESTRICT to SET NULL so recipe items can be deleted freely.

ALTER TABLE stock_issue_lines
  DROP CONSTRAINT IF EXISTS stock_issue_lines_recipe_item_id_recipe_items_id_fk;

ALTER TABLE stock_issue_lines
  ADD CONSTRAINT stock_issue_lines_recipe_item_id_recipe_items_id_fk
  FOREIGN KEY (recipe_item_id) REFERENCES recipe_items(id) ON DELETE SET NULL;
