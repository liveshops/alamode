-- Add Yellow The Label brand
-- Shopify-based swimwear/beachwear brand

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES (
  'Yellow The Label',
  'yellow-the-label',
  NULL,
  'https://yllwthelabel.com',
  'shopify',
  true,
  '{
    "type": "shopify",
    "collections": ["newest-products"],
    "max_products": 100
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  is_active = EXCLUDED.is_active,
  scraper_config = EXCLUDED.scraper_config,
  updated_at = NOW();
