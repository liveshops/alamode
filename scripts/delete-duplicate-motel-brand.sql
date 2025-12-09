-- Delete duplicate "motel" brand
-- Keep "motel-rocks" which has synced products
-- Generated: 2025-12-09

-- ============================================================
-- STEP 1: Review what will be deleted
-- ============================================================

-- Check the two brands
SELECT id, name, slug, platform, 
       (SELECT COUNT(*) FROM products WHERE brand_id = brands.id) as product_count,
       created_at
FROM brands 
WHERE slug IN ('motel', 'motel-rocks')
ORDER BY slug;

-- Check products for the "motel" brand
SELECT id, name, external_id, created_at
FROM products 
WHERE brand_id = (SELECT id FROM brands WHERE slug = 'motel')
LIMIT 10;

-- ============================================================
-- STEP 2: Delete the duplicate brand and its products
-- ============================================================

-- First, delete all products associated with the "motel" brand
DELETE FROM products 
WHERE brand_id = (SELECT id FROM brands WHERE slug = 'motel');

-- Then delete the "motel" brand itself
DELETE FROM brands 
WHERE slug = 'motel';

-- ============================================================
-- STEP 3: Verify the cleanup
-- ============================================================

-- Should only show "motel-rocks" now
SELECT id, name, slug, platform,
       (SELECT COUNT(*) FROM products WHERE brand_id = brands.id) as product_count
FROM brands 
WHERE slug LIKE 'motel%'
ORDER BY slug;
