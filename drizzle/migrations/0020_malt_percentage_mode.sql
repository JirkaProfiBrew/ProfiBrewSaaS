ALTER TABLE recipe_items ADD COLUMN percent NUMERIC;
ALTER TABLE recipes ADD COLUMN malt_input_mode TEXT DEFAULT 'percent';
