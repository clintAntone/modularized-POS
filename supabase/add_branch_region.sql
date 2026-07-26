-- Add region column to branches table
ALTER TABLE branches ADD COLUMN IF NOT EXISTS region TEXT;

-- Populate existing branches
UPDATE branches SET region = 'NCR'         WHERE name ILIKE ANY(ARRAY['%BAGONG SILANG%','%FAIRVIEW%','%KAMUNING%','%MALATE%','%MALABON%','%MARIKINA%','%MUNTINLUPA%','%NOVALICHES%','%NORTH FAIRVIEW%','%PASAY%','%PASIG%','%TAGUIG%','%TALA%','%TANDANG SORA%','%TONDO%','%VALENZUELA%','%VICAS%']);
UPDATE branches SET region = 'CAR'         WHERE name ILIKE ANY(ARRAY['%BAGUIO%','%LA TRINIDAD%']);
UPDATE branches SET region = 'Region I'    WHERE name ILIKE ANY(ARRAY['%DAGUPAN%','%SAN CARLOS%']) OR (name ILIKE '%SAN FERNANDO%' AND name ILIKE '%LA UNION%');
UPDATE branches SET region = 'Region II'   WHERE name ILIKE '%SANTIAGO%' AND name ILIKE '%ISABELA%';
UPDATE branches SET region = 'Region III'  WHERE name ILIKE ANY(ARRAY['%ANGELES%','%APALIT%','%BALAGTAS%','%BALIUAG%','%CABANATUAN%','%GAPAN%','%KAYPIAN%','%MABALACAT%','%MALOLOS%','%MARILAO%','%MEYCAUAYAN%','%MUZON%','%NORZAGARAY%','%OLONGAPO%','%PULILAN%','%SAN MIGUEL%','%SUBIC%','%TALAVERA%','%TARLAC%']) OR (name ILIKE '%SAN FERNANDO%' AND name ILIKE '%PAMPANGA%');
UPDATE branches SET region = 'Region IV-A' WHERE name ILIKE ANY(ARRAY['%ANTIPOLO%','%BACOOR%','%CALAMBA%','%CARDONA%','%DASMA%','%GENERAL TRIAS%','%IMUS%','%LIPA%','%MONTALBAN%','%NASUGBU%','%NAIC%','%SILANG%','%STA ROSA%','%STO TOMAS%','%TAGAYTAY%','%TAYTAY%','%TERESA%','%TRECE%']);
UPDATE branches SET region = 'Region VI'   WHERE name ILIKE ANY(ARRAY['%BACOLOD%','%ILOILO%']);
UPDATE branches SET region = 'Region VII'  WHERE name ILIKE ANY(ARRAY['%CEBU%','%LAPU%','%TAGBILARAN%']);

-- Remaining branches (manually identified from NULL results)
UPDATE branches SET region = 'NCR'         WHERE name ILIKE '%PARAÑAQUE%';
UPDATE branches SET region = 'NCR'         WHERE name ILIKE '%LAS PIÑAS%';
UPDATE branches SET region = 'Region III'  WHERE name ILIKE '%STA MARIA%';   -- Sta. Maria, Bulacan
UPDATE branches SET region = 'Region III'  WHERE name ILIKE '%OLONGGAPO%';   -- note double-G spelling
UPDATE branches SET region = 'Region IV-A' WHERE name ILIKE '%BATANGAS%';

-- Verify — check any branches that still have no region assigned
SELECT id, name FROM branches WHERE region IS NULL AND is_enabled = true;
