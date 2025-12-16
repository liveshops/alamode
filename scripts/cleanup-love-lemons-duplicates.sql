-- Cleanup For Love & Lemons Duplicates
-- Run this in Supabase SQL Editor

-- Step 1: Identify duplicates (keep oldest, delete newer)
WITH duplicates AS (
  SELECT 
    name,
    brand_id,
    MIN(created_at) as keep_created_at,
    COUNT(*) as duplicate_count
  FROM products
  WHERE brand_id = (SELECT id FROM brands WHERE slug = 'love-lemons')
  GROUP BY name, brand_id
  HAVING COUNT(*) > 1
),
products_to_delete AS (
  SELECT p.id
  FROM products p
  INNER JOIN duplicates d 
    ON p.name = d.name 
    AND p.brand_id = d.brand_id
  WHERE p.created_at > d.keep_created_at
)
SELECT COUNT(*) as products_to_delete FROM products_to_delete;

-- Step 2: Delete duplicates (UNCOMMENT TO RUN)
/*
WITH duplicates AS (
  SELECT 
    name,
    brand_id,
    MIN(created_at) as keep_created_at
  FROM products
  WHERE brand_id = (SELECT id FROM brands WHERE slug = 'love-lemons')
  GROUP BY name, brand_id
  HAVING COUNT(*) > 1
)
DELETE FROM products
WHERE id IN (
  SELECT p.id
  FROM products p
  INNER JOIN duplicates d 
    ON p.name = d.name 
    AND p.brand_id = d.brand_id
  WHERE p.created_at > d.keep_created_at
);
*/

-- Step 3: Verify cleanup
SELECT 
  name,
  COUNT(*) as count
FROM products
WHERE brand_id = (SELECT id FROM brands WHERE slug = 'love-lemons')
GROUP BY name
HAVING COUNT(*) > 1;
