-- Sprint 7 Phase C Patch: Recipe design target fields
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS target_ibu NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS target_ebc NUMERIC;

COMMENT ON COLUMN recipes.target_ibu IS 'Target IBU from design sliders (what brewer wants)';
COMMENT ON COLUMN recipes.target_ebc IS 'Target EBC from design sliders (what brewer wants)';
