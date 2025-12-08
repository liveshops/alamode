-- Migration: Add Brand Scraping Columns
-- Adds columns needed for the product scraping system to the brands table

-- Add new columns to brands table
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'shopify',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS scraper_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_frequency TEXT DEFAULT 'daily';

-- Add index for active brands (commonly queried)
CREATE INDEX IF NOT EXISTS idx_brands_is_active ON brands(is_active);

-- Add index for platform
CREATE INDEX IF NOT EXISTS idx_brands_platform ON brands(platform);

-- Update existing brands to be active
UPDATE brands SET is_active = true WHERE is_active IS NULL;

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'brands' 
ORDER BY ordinal_position;

-- Show current brands
SELECT name, slug, platform, is_active FROM brands ORDER BY name;
