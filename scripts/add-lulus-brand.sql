-- Add Lulu's brand
-- Shopify-based women's fashion brand

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES (
  'Lulu''s',
  'lulus',
  NULL,
  'https://www.lulus.com',
  'shopify',
  true,
  '{
    "type": "shopify",
    "collections": ["new-in-today"],
    "start_urls": [
      "https://www.lulus.com/categories/19281_16921/new-in-today.html"
    ],
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
WHERE slug = 'lulus';
