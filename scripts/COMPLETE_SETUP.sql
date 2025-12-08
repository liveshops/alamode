-- COMPLETE SCRAPING SYSTEM SETUP
-- Run this entire script in Supabase SQL Editor to set up everything at once
-- This combines: migrations + brand seeding + monitoring views

-- ============================================================================
-- PART 1: ADD MISSING COLUMNS TO BRANDS TABLE
-- ============================================================================

ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'shopify',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS scraper_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_frequency TEXT DEFAULT 'daily';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_brands_is_active ON brands(is_active);
CREATE INDEX IF NOT EXISTS idx_brands_platform ON brands(platform);

-- Update existing brands to be active
UPDATE brands SET is_active = true WHERE is_active IS NULL;

-- ============================================================================
-- PART 2: ADD MISSING COLUMNS TO PRODUCTS TABLE
-- ============================================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_variants ON products USING GIN (variants);

-- ============================================================================
-- PART 3: ADD MISSING COLUMNS TO SCRAPE LOGS TABLE
-- ============================================================================

ALTER TABLE product_scrape_logs
ADD COLUMN IF NOT EXISTS execution_time_seconds INTEGER,
ADD COLUMN IF NOT EXISTS apify_dataset_id TEXT;

-- ============================================================================
-- PART 4: SEED FASHION BRANDS (22 brands)
-- ============================================================================

INSERT INTO brands (name, slug, website_url, platform, is_active, scraper_config) VALUES

-- Shopify-based brands
('H&M', 'hm', 'https://www2.hm.com', 'shopify', true, 
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/en_us/women/new-arrivals.html')),

('Urban Outfitters', 'urban-outfitters', 'https://www.urbanoutfitters.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/womens-new-arrivals')),

('Free People', 'free-people', 'https://www.freepeople.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/new-arrivals/')),

('Anthropologie', 'anthropologie', 'https://www.anthropologie.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/new-clothes')),

('Edikted', 'edikted', 'https://edikted.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Damson Madder', 'damson-madder', 'https://www.damsonmadder.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Sisters & Seekers', 'sisters-and-seekers', 'https://www.sistersandseekers.com.au', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Miaou', 'miaou', 'https://miaou.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Handover', 'handover', 'https://handover-shop.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-in')),

('Sndys', 'sndys', 'https://sndys.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Rumored', 'rumored', 'https://shoproomered.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Design By Si', 'design-by-si', 'https://designbysi.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Steele', 'steele', 'https://steele.com.au', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('DISSH', 'dissh', 'https://dissh.com.au', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Doen', 'doen', 'https://shopdoen.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/whats-new')),

('With Jean', 'with-jean', 'https://withjean.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

-- Custom platform brands
('Aritzia', 'aritzia', 'https://www.aritzia.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'api_type', 'rest', 'new_arrivals_path', '/en/clothing/new')),

('Altar''d State', 'altard-state', 'https://www.altardstate.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/new-arrivals')),

('Zara', 'zara', 'https://www.zara.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'api_type', 'rest', 'new_arrivals_path', '/us/en/woman-new-in-l1180.html')),

('Guizio', 'guizio', 'https://guizio.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/collections/new-arrivals')),

('Cult Mia', 'cult-mia', 'https://www.cultmia.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/whats-new')),

('Stradivarius', 'stradivarius', 'https://www.stradivarius.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/us/woman/new-c1390516.html'))

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  scraper_config = EXCLUDED.scraper_config,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- PART 5: CREATE MONITORING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW brand_sync_stats AS
SELECT 
  b.name,
  b.slug,
  b.platform,
  b.is_active,
  b.last_synced_at,
  COUNT(DISTINCT p.id) as total_products,
  COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN p.id END) as products_last_7_days,
  COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '1 day' THEN p.id END) as products_last_24h,
  (SELECT COUNT(*) FROM product_scrape_logs WHERE brand_id = b.id AND status = 'success') as successful_syncs,
  (SELECT COUNT(*) FROM product_scrape_logs WHERE brand_id = b.id AND status = 'failed') as failed_syncs,
  (SELECT MAX(completed_at) FROM product_scrape_logs WHERE brand_id = b.id) as last_sync_completed
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
WHERE b.is_active = true
GROUP BY b.id, b.name, b.slug, b.platform, b.is_active, b.last_synced_at
ORDER BY b.name;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Show all brands added
SELECT 
  name,
  slug,
  platform,
  is_active,
  scraper_config->>'scraper_type' as scraper_type,
  scraper_config->>'new_arrivals_path' as new_arrivals_path
FROM brands
ORDER BY name;

-- Show column additions
SELECT 
  column_name, 
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name = 'brands' 
AND column_name IN ('platform', 'is_active', 'scraper_config', 'last_synced_at')
ORDER BY column_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Setup complete! 22 brands added.';
  RAISE NOTICE '📝 Next step: Run "npm install" to install dependencies';
  RAISE NOTICE '🧪 Then test: npm run test-scraper free-people';
END $$;
