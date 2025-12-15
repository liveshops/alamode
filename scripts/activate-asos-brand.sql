-- Activate ASOS brand and configure Apify task
-- Replace 'your-asos-task-name' with your actual Apify task ID

UPDATE brands 
SET 
  is_active = true,
  scraper_config = '{
    "apify_task_id": "tropical_infinity~your-asos-task-name"
  }'::jsonb
WHERE slug = 'asos';

-- Verify the update
SELECT 
  name,
  slug,
  is_active,
  scraper_config,
  last_synced_at
FROM brands
WHERE slug = 'asos';

-- If you don't have an ASOS task yet, you can activate it without config:
-- UPDATE brands SET is_active = true WHERE slug = 'asos';
