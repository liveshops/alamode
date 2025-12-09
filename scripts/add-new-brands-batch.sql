-- Add new brands batch
-- Generated: 2025-12-09
-- Shopify brands (17) + Non-Shopify brands (10) + Unknown (2)

-- ============================================================
-- ✅ SHOPIFY BRANDS (Ready to sync immediately)
-- ============================================================

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES
  ('PacSun', 'pacsun', NULL, 'https://www.pacsun.com', 'shopify', true, '{"type": "shopify", "collections": ["womens"], "max_products": 100}'::jsonb),
  ('Peppermayo', 'peppermayo', NULL, 'https://www.peppermayo.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Lioness', 'lioness', NULL, 'https://www.lionessfashion.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Princess Polly', 'princess-polly', NULL, 'https://us.princesspolly.com', 'shopify', true, '{"type": "shopify", "collections": ["whats-new"], "max_products": 100}'::jsonb),
  ('Carmen Says', 'carmen-says', NULL, 'https://www.carmensays.com', 'shopify', true, '{"type": "shopify", "collections": ["new"], "max_products": 100}'::jsonb),
  ('Mode Mischief Studios', 'mode-mischief-studios', NULL, 'https://www.modemischiefstudios.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Motel Rocks', 'motel-rocks', NULL, 'https://www.motelrocks.com', 'shopify', true, '{"type": "shopify", "collections": ["new-in"], "max_products": 100}'::jsonb),
  ('Revice', 'revice', NULL, 'https://www.revicedenim.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Yellow the Label', 'yellow-the-label', NULL, 'https://yellowthelabel.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('I am Delilah', 'i-am-delilah', NULL, 'https://iamdelilah.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Tiger Mist', 'tiger-mist', NULL, 'https://us.tigermist.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Oak + Fort', 'oak-fort', NULL, 'https://www.oakandfort.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Peachy Den', 'peachy-den', NULL, 'https://www.peachyden.com', 'shopify', true, '{"type": "shopify", "collections": ["new"], "max_products": 100}'::jsonb),
  ('Reformation', 'reformation', NULL, 'https://www.thereformation.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Bronze Snake', 'bronze-snake', NULL, 'https://www.bronzesnake.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Pistola', 'pistola', NULL, 'https://www.pistoladenim.com', 'shopify', true, '{"type": "shopify", "collections": ["new-arrivals"], "max_products": 100}'::jsonb),
  ('Susmies', 'susmies', NULL, 'https://susmies.com', 'shopify', true, '{"type": "shopify", "collections": ["new"], "max_products": 100}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  is_active = EXCLUDED.is_active,
  scraper_config = EXCLUDED.scraper_config,
  updated_at = NOW();

-- ============================================================
-- ❌ NON-SHOPIFY BRANDS (Need custom scrapers - inactive for now)
-- ============================================================

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES
  ('Hollister', 'hollister', NULL, 'https://www.hollisterco.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper or Apify"}'::jsonb),
  ('Levi''s', 'levis', NULL, 'https://www.levi.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper or Apify"}'::jsonb),
  ('Abercrombie & Fitch', 'abercrombie-fitch', NULL, 'https://www.abercrombie.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper or Apify"}'::jsonb),
  ('Aeropostale', 'aeropostale', NULL, 'https://www.aeropostale.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper or Apify"}'::jsonb),
  ('American Eagle', 'american-eagle', NULL, 'https://www.ae.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper or Apify"}'::jsonb),
  ('Asos', 'asos', NULL, 'https://www.asos.com', 'custom', false, '{"type": "custom", "note": "Large marketplace - needs special handling"}'::jsonb),
  ('My Mum Made It', 'my-mum-made-it', NULL, 'https://www.mymummadeit.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper"}'::jsonb),
  ('Mango', 'mango', NULL, 'https://www.mango.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper or Apify"}'::jsonb),
  ('Daily Drills', 'daily-drills', NULL, 'https://www.dailydrills.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper"}'::jsonb),
  ('Jaded London', 'jaded-london', NULL, 'https://www.jadedlondon.com', 'custom', false, '{"type": "custom", "note": "Needs custom scraper"}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  is_active = EXCLUDED.is_active,
  scraper_config = EXCLUDED.scraper_config,
  updated_at = NOW();

-- ============================================================
-- ❓ UNKNOWN BRANDS (Need manual verification)
-- ============================================================

INSERT INTO brands (name, slug, logo_url, website_url, platform, is_active, scraper_config)
VALUES
  ('Parke', 'parke', NULL, 'https://www.parkecollective.com', 'custom', false, '{"type": "unknown", "note": "Site check failed - verify manually"}'::jsonb),
  ('Nícoli', 'nicoli', NULL, 'https://www.nicoliapparel.com', 'custom', false, '{"type": "unknown", "note": "Site check failed - verify manually"}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  is_active = EXCLUDED.is_active,
  scraper_config = EXCLUDED.scraper_config,
  updated_at = NOW();

-- ============================================================
-- SUMMARY
-- ============================================================
-- ✅ 17 Shopify brands ready to sync
-- ❌ 10 non-Shopify brands (inactive, need custom scrapers)
-- ❓ 2 unknown brands (need manual check)
-- Total: 29 brands added
