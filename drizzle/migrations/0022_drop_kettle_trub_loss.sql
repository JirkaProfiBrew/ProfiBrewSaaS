-- Remove kettle_trub_loss_l column — duplicate of whirlpool_loss_pct.
-- Post-boil volume now includes trub/hop matter (physically measurable in the kettle).
ALTER TABLE brewing_systems DROP COLUMN IF EXISTS kettle_trub_loss_l;
