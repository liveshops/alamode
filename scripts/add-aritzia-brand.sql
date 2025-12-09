-- Add Aritzia brand
-- Uses Apify E-commerce scraper (like Free People)

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES (
  'Aritzia',
  'aritzia',
  NULL,
  'https://www.aritzia.com',
  'custom',
  true,
  '{
    "type": "apify-ecommerce",
    "actor_id": "apify/e-commerce-scraping-tool",
    "start_urls": [
      "https://www.aritzia.com/us/en/clothing/new-arrivals",
      "https://www.aritzia.com/us/en/clothing/dresses",
      "https://www.aritzia.com/us/en/clothing/tops",
      "https://www.aritzia.com/us/en/clothing/sweaters",
      "https://www.aritzia.com/us/en/clothing/pants"
    ],
    "max_products": 100,
    "note": "Cloudflare-protected site - use Apify E-commerce scraper"
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  is_active = EXCLUDED.is_active,
  scraper_config = EXCLUDED.scraper_config,
  updated_at = NOW();
