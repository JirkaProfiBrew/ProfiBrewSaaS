-- Sprint 6 Phase A4: Mashing Profiles expansion
-- Add mashing_type, description, is_active, updated_at to mashing_profiles

ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS mashing_type TEXT;
ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Update existing system profiles with mashing_type
UPDATE mashing_profiles SET mashing_type = 'infusion' WHERE name = 'Jednokvasný infuzní' AND tenant_id IS NULL;
UPDATE mashing_profiles SET mashing_type = 'infusion' WHERE name = 'Dvourastový infuzní' AND tenant_id IS NULL;
UPDATE mashing_profiles SET mashing_type = 'decoction' WHERE name LIKE 'Český dekokční%' AND tenant_id IS NULL;

-- Update system profiles with descriptions
UPDATE mashing_profiles SET description = 'Základní infuzní postup s jednou teplotní pauzou. Vhodný pro většinu světlých ležáků a jednoduchých receptur.' WHERE name = 'Jednokvasný infuzní' AND tenant_id IS NULL;
UPDATE mashing_profiles SET description = 'Dvourastový infuzní postup s bílkovinným rastem a dvěma sacharifikačními teplotami. Pro plnější tělo a lepší konverzi škrobů.' WHERE name = 'Dvourastový infuzní' AND tenant_id IS NULL;
UPDATE mashing_profiles SET description = 'Klasický český jednomezový dekokční postup s jedním odběrem a varem. Tradice českého pivovarnictví.' WHERE name = 'Český dekokční — jednomezový' AND tenant_id IS NULL;
UPDATE mashing_profiles SET description = 'Tradiční český dvoumezový dekokční postup se dvěma odběry a vary. Maximální výtěžnost a plné tělo piva. Nejnáročnější na čas a energii.' WHERE name = 'Český dekokční — dvoumezový' AND tenant_id IS NULL;
