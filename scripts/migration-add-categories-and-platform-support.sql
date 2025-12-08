-- Migration: Add Categories, Platform Support, and Variants
-- Run this in Supabase SQL Editor after initial setup
-- This adds support for scalable multi-brand product syncing

-- ============================================
-- 1. CREATE CATEGORIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public categories" ON categories
  FOR SELECT USING (true);

-- ============================================
-- 2. CREATE PRODUCT-CATEGORIES JUNCTION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS product_categories (
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public product categories" ON product_categories
  FOR SELECT USING (true);

-- ============================================
-- 3. UPDATE BRANDS TABLE - ADD PLATFORM CONFIG
-- ============================================

-- Add new columns to brands table
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'custom',
ADD COLUMN IF NOT EXISTS scraper_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sync_frequency TEXT DEFAULT 'daily',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Add index for active brands
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(is_active) WHERE is_active = true;

-- Add comment explaining scraper_config structure
COMMENT ON COLUMN brands.scraper_config IS 'JSON config: { "apify_actor_id": "string", "apify_dataset_id": "string", "scraper_url": "string", "custom_settings": {} }';

-- ============================================
-- 4. UPDATE PRODUCTS TABLE - ADD VARIANTS
-- ============================================

-- Add variants column to store size/color options
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]';

-- Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_products_variants ON products USING GIN (variants);

-- Add comment explaining variants structure
COMMENT ON COLUMN products.variants IS 'Array of variant objects: [{ "id": "string", "title": "string", "options": ["S"], "price": { "current": 7400, "previous": 0, "stockStatus": "InStock" } }]';

-- ============================================
-- 5. UPDATE PRODUCT_SCRAPE_LOGS - ENHANCED TRACKING
-- ============================================

-- Add new columns for detailed tracking
ALTER TABLE product_scrape_logs 
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS apify_dataset_id TEXT,
ADD COLUMN IF NOT EXISTS apify_run_id TEXT,
ADD COLUMN IF NOT EXISTS products_removed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS execution_time_seconds INTEGER;

-- Add index for debugging
CREATE INDEX IF NOT EXISTS idx_scrape_logs_brand_status ON product_scrape_logs(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_started ON product_scrape_logs(started_at DESC);

-- ============================================
-- 6. INSERT INITIAL CATEGORY TAXONOMY
-- ============================================

-- Top-level categories
INSERT INTO categories (name, slug, description, parent_id) VALUES
  ('Clothing', 'clothing', 'All apparel items', NULL),
  ('Swimwear', 'swimwear', 'Swimsuits, bikinis, and swim accessories', NULL),
  ('Accessories', 'accessories', 'Bags, jewelry, and other accessories', NULL),
  ('Shoes', 'shoes', 'Footwear of all types', NULL),
  ('Beauty', 'beauty', 'Makeup, skincare, and beauty products', NULL)
ON CONFLICT (slug) DO NOTHING;

-- Clothing sub-categories
INSERT INTO categories (name, slug, description, parent_id) VALUES
  ('Dresses', 'dresses', 'All dress styles', (SELECT id FROM categories WHERE slug = 'clothing')),
  ('Tops', 'tops', 'Shirts, blouses, and tops', (SELECT id FROM categories WHERE slug = 'clothing')),
  ('Bottoms', 'bottoms', 'Pants, skirts, and shorts', (SELECT id FROM categories WHERE slug = 'clothing')),
  ('Outerwear', 'outerwear', 'Jackets and coats', (SELECT id FROM categories WHERE slug = 'clothing')),
  ('Activewear', 'activewear', 'Athletic and workout clothing', (SELECT id FROM categories WHERE slug = 'clothing'))
ON CONFLICT (slug) DO NOTHING;

-- Swimwear sub-categories
INSERT INTO categories (name, slug, description, parent_id) VALUES
  ('One-Piece', 'one-piece', 'One-piece swimsuits', (SELECT id FROM categories WHERE slug = 'swimwear')),
  ('Bikinis', 'bikinis', 'Two-piece swimsuits', (SELECT id FROM categories WHERE slug = 'swimwear')),
  ('Cover-Ups', 'cover-ups', 'Beach cover-ups and wraps', (SELECT id FROM categories WHERE slug = 'swimwear')),
  ('Rash Guards', 'rash-guards', 'UV protection swimwear', (SELECT id FROM categories WHERE slug = 'swimwear'))
ON CONFLICT (slug) DO NOTHING;

-- Accessories sub-categories
INSERT INTO categories (name, slug, description, parent_id) VALUES
  ('Bags', 'bags', 'Handbags, backpacks, and purses', (SELECT id FROM categories WHERE slug = 'accessories')),
  ('Jewelry', 'jewelry', 'Necklaces, earrings, rings, and bracelets', (SELECT id FROM categories WHERE slug = 'accessories')),
  ('Hats', 'hats', 'All headwear', (SELECT id FROM categories WHERE slug = 'accessories')),
  ('Sunglasses', 'sunglasses', 'Eyewear', (SELECT id FROM categories WHERE slug = 'accessories'))
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 7. UPDATE EXISTING BRANDS WITH PLATFORM INFO
-- ============================================

-- Mark known Shopify brands
-- (You'll update this as you add more brands)
UPDATE brands 
SET platform = 'shopify'
WHERE slug IN ('motel', 'urban-outfitters');

-- Update Rad Swim (add it if not exists)
INSERT INTO brands (name, slug, website_url, platform, is_active) VALUES
  ('Rad Swim', 'rad-swim', 'https://radswim.com', 'shopify', true)
ON CONFLICT (slug) 
DO UPDATE SET 
  platform = 'shopify',
  is_active = true;

-- ============================================
-- 8. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to get products by category (including subcategories)
CREATE OR REPLACE FUNCTION get_products_by_category(category_slug_input TEXT)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  brand_name TEXT,
  price DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.id,
    p.name,
    b.name,
    p.price
  FROM products p
  JOIN brands b ON p.brand_id = b.id
  JOIN product_categories pc ON p.id = pc.product_id
  JOIN categories c ON pc.category_id = c.id
  WHERE c.slug = category_slug_input
    OR c.parent_id = (SELECT id FROM categories WHERE slug = category_slug_input)
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verify the migration
SELECT 
  'Categories created:' as status,
  COUNT(*) as count
FROM categories
UNION ALL
SELECT 
  'Brands with platform:' as status,
  COUNT(*) as count
FROM brands
WHERE platform IS NOT NULL;
