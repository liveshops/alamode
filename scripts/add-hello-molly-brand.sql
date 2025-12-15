-- Add Hello Molly brand
-- Uses Apify E-commerce scraper

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES (
  'Hello Molly',
  'hello-molly',
  NULL,
  'https://www.hellomolly.com',
  'custom',
  true,
  '{
    "type": "apify-ecommerce",
    "apify_task_id": "tropical_infinity~e-commerce-scraping-tool-lulus",
    "max_products": 500
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  is_active = EXCLUDED.is_active,
  scraper_config = EXCLUDED.scraper_config,
  updated_at = NOW();

-- Verify the brand was added
SELECT 
  name,
  slug,
  website_url,
  platform,
  is_active,
  scraper_config
FROM brands
WHERE slug = 'hello-molly';
