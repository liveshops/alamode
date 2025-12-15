-- Debug: Check Aritzia products and brand status

-- 1. Check Aritzia brand configuration
SELECT 
  id,
  name,
  slug,
  is_active,
  follower_count,
  scraper_config,
  last_synced_at
FROM brands
WHERE slug = 'aritzia';

-- 2. Count Aritzia products by availability status
SELECT 
  is_available,
  COUNT(*) as product_count
FROM products p
JOIN brands b ON p.brand_id = b.id
WHERE b.slug = 'aritzia'
GROUP BY is_available;

-- 3. Sample of Aritzia products
SELECT 
  p.id,
  p.name,
  p.price,
  p.is_available,
  p.image_url,
  p.variants,
  p.created_at
FROM products p
JOIN brands b ON p.brand_id = b.id
WHERE b.slug = 'aritzia'
ORDER BY p.created_at DESC
LIMIT 10;

-- 4. Check if variants data is causing is_available to be false
SELECT 
  p.id,
  p.name,
  p.is_available,
  p.variants::text as variants_json
FROM products p
JOIN brands b ON p.brand_id = b.id
WHERE b.slug = 'aritzia'
LIMIT 5;

-- 5. Test the get_shop_brands function for Aritzia
SELECT 
  id,
  name,
  slug,
  follower_count,
  products
FROM get_shop_brands(NULL, 6)
WHERE slug = 'aritzia';
