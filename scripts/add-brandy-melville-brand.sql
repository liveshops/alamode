-- Add Brandy Melville brand
-- Shopify-based trendy fashion brand

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES (
  'Brandy Melville',
  'brandy-melville',
  NULL,
  'https://us.brandymelville.com',
  'shopify',
  true,
  '{
    "type": "shopify",
    "collections": ["new-arrivals"],
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
