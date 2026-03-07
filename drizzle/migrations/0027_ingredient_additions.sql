ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "ingredient_additions" jsonb DEFAULT '{}'::jsonb;
