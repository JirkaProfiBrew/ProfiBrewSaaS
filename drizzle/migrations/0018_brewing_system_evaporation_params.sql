-- Replace kettle_loss_pct with evaporation_rate + kettle_trub_loss + grain_absorption

ALTER TABLE brewing_systems ADD COLUMN IF NOT EXISTS evaporation_rate_pct_per_hour NUMERIC DEFAULT 8;
ALTER TABLE brewing_systems ADD COLUMN IF NOT EXISTS kettle_trub_loss_l NUMERIC DEFAULT 5;
ALTER TABLE brewing_systems ADD COLUMN IF NOT EXISTS grain_absorption_l_per_kg NUMERIC DEFAULT 0.8;

-- Migrate existing kettle_loss_pct data (rough estimate: assume evaporation ≈ kettle_loss)
UPDATE brewing_systems
SET evaporation_rate_pct_per_hour = COALESCE(kettle_loss_pct, 8)
WHERE evaporation_rate_pct_per_hour IS NULL OR evaporation_rate_pct_per_hour = 8;

ALTER TABLE brewing_systems DROP COLUMN IF EXISTS kettle_loss_pct;

COMMENT ON COLUMN brewing_systems.evaporation_rate_pct_per_hour IS 'Evaporation rate during boil (% of volume per hour)';
COMMENT ON COLUMN brewing_systems.kettle_trub_loss_l IS 'Fixed loss in kettle (hop trub, hot break) in liters';
COMMENT ON COLUMN brewing_systems.grain_absorption_l_per_kg IS 'Water absorption by grain (liters per kg of malt)';
