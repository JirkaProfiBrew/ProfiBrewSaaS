-- Recipe Snapshot: add source_recipe_id to track which original recipe a batch snapshot was cloned from
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipes_source ON recipes(source_recipe_id);
