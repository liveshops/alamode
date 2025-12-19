-- Migration: Product Deduplication System
-- Run this in Supabase SQL Editor
--
-- This migration:
-- 1. Adds unique constraint on brand_id + external_id
-- 2. Adds unique constraint on brand_id + product_url (most reliable)
-- 3. Cleans up existing duplicate products
-- 4. Creates a function to prevent future duplicates

-- ============================================
-- Step 1: Identify and clean up duplicates
-- ============================================

-- First, let's see what duplicates exist (run this to preview)
-- SELECT 
--   brand_id, name, COUNT(*) as count 
-- FROM products 
-- GROUP BY brand_id, name 
-- HAVING COUNT(*) > 1;

-- Create a temp table to track which products to keep (newest or most liked)
CREATE TEMP TABLE products_to_keep AS
SELECT DISTINCT ON (brand_id, name) 
  id,
  brand_id,
  name,
  like_count,
  created_at
FROM products
ORDER BY brand_id, name, like_count DESC NULLS LAST, created_at DESC;

-- Create temp table for products to delete
CREATE TEMP TABLE products_to_delete AS
SELECT p.id
FROM products p
LEFT JOIN products_to_keep pk ON p.id = pk.id
WHERE pk.id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM products p2 
    WHERE p2.brand_id = p.brand_id 
      AND p2.name = p.name 
      AND p2.id != p.id
  );

-- Show count of products to delete
DO $$
DECLARE
  delete_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO delete_count FROM products_to_delete;
  RAISE NOTICE 'Found % duplicate products to delete', delete_count;
END $$;

-- Delete likes for duplicate products first (foreign key constraint)
DELETE FROM user_likes_products 
WHERE product_id IN (SELECT id FROM products_to_delete);

-- Delete the duplicate products
DELETE FROM products 
WHERE id IN (SELECT id FROM products_to_delete);

-- Clean up temp tables
DROP TABLE IF EXISTS products_to_keep;
DROP TABLE IF EXISTS products_to_delete;

-- ============================================
-- Step 2: Add unique constraints
-- ============================================

-- Unique constraint on brand_id + external_id (primary dedup key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_brand_external_unique'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_brand_external_unique 
    UNIQUE (brand_id, external_id);
    RAISE NOTICE 'Added unique constraint: products_brand_external_unique';
  ELSE
    RAISE NOTICE 'Constraint products_brand_external_unique already exists';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Cannot add constraint - duplicates still exist. Run cleanup first.';
END $$;

-- Unique constraint on brand_id + name (secondary dedup - catches name-based duplicates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_brand_name_unique'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_brand_name_unique 
    UNIQUE (brand_id, name);
    RAISE NOTICE 'Added unique constraint: products_brand_name_unique';
  ELSE
    RAISE NOTICE 'Constraint products_brand_name_unique already exists';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Cannot add constraint on brand_id + name - duplicates still exist.';
END $$;

-- ============================================
-- Step 3: Create upsert function for safe inserts
-- ============================================

CREATE OR REPLACE FUNCTION upsert_product(
  p_brand_id UUID,
  p_external_id TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_price DECIMAL DEFAULT 0,
  p_sale_price DECIMAL DEFAULT NULL,
  p_currency TEXT DEFAULT 'USD',
  p_image_url TEXT DEFAULT '',
  p_additional_images JSONB DEFAULT '[]',
  p_product_url TEXT DEFAULT '',
  p_variants JSONB DEFAULT '[]',
  p_is_available BOOLEAN DEFAULT TRUE,
  p_taxonomy_id TEXT DEFAULT NULL,
  p_taxonomy_category_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  product_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  existing_id UUID;
  result_id UUID;
  result_is_new BOOLEAN;
BEGIN
  -- First, try to find by brand_id + external_id (primary key)
  SELECT id INTO existing_id 
  FROM products 
  WHERE brand_id = p_brand_id AND external_id = p_external_id;
  
  -- If not found, try by brand_id + name (secondary check)
  IF existing_id IS NULL THEN
    SELECT id INTO existing_id 
    FROM products 
    WHERE brand_id = p_brand_id AND name = p_name;
  END IF;
  
  IF existing_id IS NOT NULL THEN
    -- Update existing product
    UPDATE products SET
      name = p_name,
      description = COALESCE(NULLIF(p_description, ''), description),
      price = p_price,
      sale_price = p_sale_price,
      currency = p_currency,
      image_url = COALESCE(NULLIF(p_image_url, ''), image_url),
      additional_images = CASE WHEN p_additional_images != '[]' THEN p_additional_images ELSE additional_images END,
      product_url = COALESCE(NULLIF(p_product_url, ''), product_url),
      variants = CASE WHEN p_variants != '[]' THEN p_variants ELSE variants END,
      is_available = p_is_available,
      taxonomy_id = COALESCE(p_taxonomy_id, taxonomy_id),
      taxonomy_category_name = COALESCE(p_taxonomy_category_name, taxonomy_category_name),
      last_checked_at = NOW(),
      updated_at = NOW()
    WHERE id = existing_id;
    
    result_id := existing_id;
    result_is_new := FALSE;
  ELSE
    -- Insert new product
    INSERT INTO products (
      brand_id, external_id, name, description, price, sale_price, currency,
      image_url, additional_images, product_url, variants, is_available,
      taxonomy_id, taxonomy_category_name, last_checked_at
    ) VALUES (
      p_brand_id, p_external_id, p_name, p_description, p_price, p_sale_price, p_currency,
      p_image_url, p_additional_images, p_product_url, p_variants, p_is_available,
      p_taxonomy_id, p_taxonomy_category_name, NOW()
    )
    RETURNING id INTO result_id;
    
    result_is_new := TRUE;
  END IF;
  
  product_id := result_id;
  is_new := result_is_new;
  RETURN NEXT;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION upsert_product TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_product TO service_role;

-- ============================================
-- Verification
-- ============================================

DO $$
DECLARE
  remaining_dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_dupes
  FROM (
    SELECT brand_id, name 
    FROM products 
    GROUP BY brand_id, name 
    HAVING COUNT(*) > 1
  ) dupes;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== Product Deduplication Migration Complete ===';
  RAISE NOTICE '';
  IF remaining_dupes = 0 THEN
    RAISE NOTICE '✅ No duplicate products remain';
  ELSE
    RAISE NOTICE '⚠️  %s product name duplicates still exist', remaining_dupes;
    RAISE NOTICE '   You may need to manually review these';
  END IF;
  RAISE NOTICE '';
  RAISE NOTICE 'Constraints added:';
  RAISE NOTICE '  - products_brand_external_unique (brand_id + external_id)';
  RAISE NOTICE '  - products_brand_name_unique (brand_id + name)';
  RAISE NOTICE '';
  RAISE NOTICE 'Function created: upsert_product()';
  RAISE NOTICE '  - Safely upserts products without creating duplicates';
  RAISE NOTICE '  - Checks both external_id and name for matches';
END $$;
