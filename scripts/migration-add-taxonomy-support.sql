-- Migration: Add Shopify Taxonomy Support
-- Date: December 8, 2025
-- Purpose: Integrate Shopify's standard product taxonomy for better categorization

-- ============================================
-- 1. Add taxonomy columns to products table
-- ============================================

ALTER TABLE products
ADD COLUMN IF NOT EXISTS taxonomy_id TEXT,
ADD COLUMN IF NOT EXISTS taxonomy_category_name TEXT,
ADD COLUMN IF NOT EXISTS taxonomy_full_path TEXT,
ADD COLUMN IF NOT EXISTS taxonomy_level INTEGER,
ADD COLUMN IF NOT EXISTS taxonomy_attributes JSONB DEFAULT '[]'::jsonb;

-- Add indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_products_taxonomy_id ON products(taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_products_taxonomy_category_name ON products(taxonomy_category_name);

-- Comment the columns
COMMENT ON COLUMN products.taxonomy_id IS 'Shopify taxonomy ID (e.g., gid://shopify/TaxonomyCategory/aa-1-4-2)';
COMMENT ON COLUMN products.taxonomy_category_name IS 'Human-readable category name (e.g., Midi Dresses)';
COMMENT ON COLUMN products.taxonomy_full_path IS 'Full category path (e.g., Apparel & Accessories > Clothing > Dresses > Midi Dresses)';
COMMENT ON COLUMN products.taxonomy_level IS 'Hierarchy level (0=top, 1=category, 2=subcategory, etc.)';
COMMENT ON COLUMN products.taxonomy_attributes IS 'Category-specific attributes as JSON';

-- ============================================
-- 2. Create product_categories lookup table
-- ============================================

CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,  -- gid://shopify/TaxonomyCategory/aa-1-4-1
  name TEXT NOT NULL,  -- Mini Dresses
  full_name TEXT NOT NULL,  -- Apparel & Accessories > Clothing > Dresses > Mini Dresses
  parent_id TEXT,
  level INTEGER NOT NULL,
  vertical TEXT NOT NULL,  -- Apparel & Accessories
  attributes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_name ON product_categories(name);
CREATE INDEX IF NOT EXISTS idx_product_categories_vertical ON product_categories(vertical);
CREATE INDEX IF NOT EXISTS idx_product_categories_level ON product_categories(level);

-- Add foreign key constraint (optional, for data integrity)
ALTER TABLE products
DROP CONSTRAINT IF EXISTS fk_products_taxonomy;

ALTER TABLE products
ADD CONSTRAINT fk_products_taxonomy
FOREIGN KEY (taxonomy_id) REFERENCES product_categories(id)
ON DELETE SET NULL;

-- ============================================
-- 3. Create helper view for category stats
-- ============================================

CREATE OR REPLACE VIEW category_product_counts AS
SELECT 
  pc.id,
  pc.name,
  pc.full_name,
  pc.level,
  pc.vertical,
  COUNT(p.id) as product_count,
  COUNT(DISTINCT p.brand_id) as brand_count
FROM product_categories pc
LEFT JOIN products p ON p.taxonomy_id = pc.id
GROUP BY pc.id, pc.name, pc.full_name, pc.level, pc.vertical
ORDER BY product_count DESC;

-- ============================================
-- 4. Verification queries
-- ============================================

-- Check if migration succeeded
DO $$
BEGIN
  RAISE NOTICE '=== Taxonomy Migration Complete ===';
  RAISE NOTICE 'Added columns to products table';
  RAISE NOTICE 'Created product_categories table';
  RAISE NOTICE 'Created indexes for fast filtering';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run: node scripts/load-taxonomy-categories.js';
  RAISE NOTICE '2. Verify: SELECT COUNT(*) FROM product_categories;';
  RAISE NOTICE '3. Test with new syncs or run reclassification';
END $$;
