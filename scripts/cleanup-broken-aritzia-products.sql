-- Clean up broken Aritzia products from failed Apify scrape
-- These products have no title, no variants, and are marked unavailable

-- First, check what we're about to delete
SELECT 
  id,
  name,
  is_available,
  variants,
  created_at
FROM products
WHERE brand_id = (SELECT id FROM brands WHERE slug = 'aritzia')
  AND name = 'Untitled Product'
  AND (variants = '[]'::jsonb OR variants IS NULL);

-- If the above looks correct (should show ~23 products), run this:
DELETE FROM products
WHERE brand_id = (SELECT id FROM brands WHERE slug = 'aritzia')
  AND name = 'Untitled Product'
  AND (variants = '[]'::jsonb OR variants IS NULL);

-- Verify the cleanup
SELECT 
  COUNT(*) as total_products,
  COUNT(CASE WHEN is_available = true THEN 1 END) as available_products,
  COUNT(CASE WHEN is_available = false THEN 1 END) as unavailable_products
FROM products
WHERE brand_id = (SELECT id FROM brands WHERE slug = 'aritzia');
