-- Update Aritzia brand to use Apify task ID instead of dataset ID
-- This allows the sync script to automatically fetch the latest run

UPDATE brands 
SET scraper_config = '{
  "apify_task_id": "tropical_infinity~e-commerce-scraping-tool-aritzia"
}'
WHERE slug = 'aritzia';

-- Verify the update
SELECT 
  name,
  slug,
  scraper_config,
  last_synced_at
FROM brands
WHERE slug = 'aritzia';
