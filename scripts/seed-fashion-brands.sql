-- Seed Fashion Brands Database
-- This script adds all popular fashion brands to the database
-- IMPORTANT: Run migration-add-brand-scraping-columns.sql FIRST!
-- Then run this script in Supabase SQL Editor

-- Insert all brands with their basic information
INSERT INTO brands (name, slug, website_url, platform, is_active, scraper_config) VALUES

-- Shopify-based brands
('H&M', 'hm', 'https://www2.hm.com', 'shopify', true, 
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/en_us/women/new-arrivals.html')),

('Urban Outfitters', 'urban-outfitters', 'https://www.urbanoutfitters.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/womens-new-arrivals')),

('Free People', 'free-people', 'https://www.freepeople.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/new-arrivals/')),

('Anthropologie', 'anthropologie', 'https://www.anthropologie.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/new-clothes')),

('Edikted', 'edikted', 'https://edikted.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Damson Madder', 'damson-madder', 'https://www.damsonmadder.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Sisters & Seekers', 'sisters-and-seekers', 'https://www.sistersandseekers.com.au', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Miaou', 'miaou', 'https://miaou.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Handover', 'handover', 'https://handover-shop.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-in')),

('Sndys', 'sndys', 'https://sndys.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Rumored', 'rumored', 'https://shoproomered.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Design By Si', 'design-by-si', 'https://designbysi.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Steele', 'steele', 'https://steele.com.au', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('DISSH', 'dissh', 'https://dissh.com.au', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

('Doen', 'doen', 'https://shopdoen.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/whats-new')),

('With Jean', 'with-jean', 'https://withjean.com', 'shopify', true,
  jsonb_build_object('scraper_type', 'shopify', 'new_arrivals_path', '/collections/new-arrivals')),

-- Custom platform brands
('Aritzia', 'aritzia', 'https://www.aritzia.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'api_type', 'rest', 'new_arrivals_path', '/en/clothing/new')),

('Altar''d State', 'altard-state', 'https://www.altardstate.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/new-arrivals')),

('Zara', 'zara', 'https://www.zara.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'api_type', 'rest', 'new_arrivals_path', '/us/en/woman-new-in-l1180.html')),

('Guizio', 'guizio', 'https://guizio.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/collections/new-arrivals')),

('Cult Mia', 'cult-mia', 'https://www.cultmia.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/whats-new')),

('Stradivarius', 'stradivarius', 'https://www.stradivarius.com', 'custom', true,
  jsonb_build_object('scraper_type', 'custom', 'new_arrivals_path', '/us/woman/new-c1390516.html'))

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  platform = EXCLUDED.platform,
  scraper_config = EXCLUDED.scraper_config,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verify the brands were added
SELECT 
  name,
  slug,
  platform,
  is_active,
  scraper_config->>'scraper_type' as scraper_type
FROM brands
ORDER BY name;
