-- Fix brands with Apify task IDs that are marked as Shopify
-- Run this in Supabase SQL Editor

-- Fix Anthropologie, Lulu's, and PacSun
UPDATE brands SET platform = 'custom' WHERE slug = 'anthropologie';
UPDATE brands SET platform = 'custom' WHERE slug = 'lulus';
UPDATE brands SET platform = 'custom' WHERE slug = 'pacsun';

-- Verify the fix
SELECT name, slug, platform, scraper_config 
FROM brands 
WHERE slug IN ('anthropologie', 'lulus', 'pacsun');

-- Optional: Deactivate brands that can't sync (custom platform but no config)
-- Uncomment if you want to disable them until they're properly configured:
/*
UPDATE brands 
SET is_active = false 
WHERE platform = 'custom' 
  AND (scraper_config IS NULL OR NOT scraper_config ? 'apify_task_id')
  AND slug NOT IN ('zara', 'stradivarius');
*/
