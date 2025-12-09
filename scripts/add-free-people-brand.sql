-- Add Free People to brands table
-- Uses Apify Cloudflare scraper

INSERT INTO brands (
  name,
  slug,
  website_url,
  logo_url,
  description,
  platform,
  is_active,
  scraper_config
) VALUES (
  'Free People',
  'free-people',
  'https://www.freepeople.com',
  'https://static.freepeople.com/static/v3/fp_shopTabLogo_web_251031.svg',
  'An inspiring place to shop for women''s clothing, accessories and home decor. Explore our collection of dresses, blouses, sweaters, shoes and more.',
  'custom',
  true,
  '{
    "type": "apify-cloudflare",
    "start_urls": [
      "https://www.freepeople.com/shop/whats-new/",
      "https://www.freepeople.com/shop/womens-clothes/",
      "https://www.freepeople.com/shop/dresses/",
      "https://www.freepeople.com/shop/tops/",
      "https://www.freepeople.com/shop/bottoms/"
    ],
    "max_products": 500
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  scraper_config = EXCLUDED.scraper_config,
  updated_at = NOW();
