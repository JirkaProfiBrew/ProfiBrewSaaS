-- Sprint 7 Phase C: Recipe constants override
ALTER TABLE recipes ADD COLUMN constants_override JSONB;

COMMENT ON COLUMN recipes.constants_override IS 'Per-recipe overrides of brewing system parameters (JSON)';
