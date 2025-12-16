-- Add pagination support to get_similar_products
-- Run this in Supabase SQL Editor

-- Drop old function and create with pagination
DROP FUNCTION IF EXISTS get_similar_products(UUID, INT);

CREATE OR REPLACE FUNCTION get_similar_products(
  source_product_id UUID,
  result_limit INTEGER DEFAULT 10,
  result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  product_id UUID,
  name TEXT,
  price DECIMAL,
  sale_price DECIMAL,
  image_url TEXT,
  product_url TEXT,
  brand_id UUID,
  brand_name TEXT,
  brand_slug TEXT,
  taxonomy_category_name TEXT,
  like_count INTEGER,
  similarity_score DECIMAL,
  similarity_reason TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  source_brand_id UUID;
  source_taxonomy TEXT;
  source_price DECIMAL;
BEGIN
  -- Get source product details
  SELECT p.brand_id, p.taxonomy_id, p.price
  INTO source_brand_id, source_taxonomy, source_price
  FROM products p
  WHERE p.id = source_product_id;

  RETURN QUERY
  WITH scored AS (
    SELECT 
      p.id,
      p.name,
      p.price,
      p.sale_price,
      p.image_url,
      p.product_url,
      p.brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      p.taxonomy_category_name,
      p.like_count,
      
      -- Same brand score
      CASE WHEN p.brand_id = source_brand_id THEN 30 ELSE 0 END as brand_match,
      
      -- Same category score
      CASE 
        WHEN p.taxonomy_id = source_taxonomy THEN 40
        WHEN p.taxonomy_id IS NOT NULL AND source_taxonomy IS NOT NULL 
             AND split_part(p.taxonomy_id, '-', 1) = split_part(source_taxonomy, '-', 1)
             AND split_part(p.taxonomy_id, '-', 2) = split_part(source_taxonomy, '-', 2) THEN 20
        ELSE 0
      END as category_match,
      
      -- Price similarity score
      CASE 
        WHEN source_price > 0 THEN
          GREATEST(0, 20 - (ABS(p.price - source_price) / source_price * 40))
        ELSE 10
      END as price_match,
      
      -- Popularity bonus
      LEAST(p.like_count, 10) as popularity_bonus
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id != source_product_id
      AND p.is_available = true
  )
  SELECT 
    s.id,
    s.name,
    s.price,
    s.sale_price,
    s.image_url,
    s.product_url,
    s.brand_id,
    s.brand_name,
    s.brand_slug,
    s.taxonomy_category_name,
    s.like_count,
    (s.brand_match + s.category_match + s.price_match + s.popularity_bonus)::DECIMAL as score,
    CASE 
      WHEN s.brand_match > 0 AND s.category_match >= 40 THEN 'Same brand & style'
      WHEN s.category_match >= 40 THEN 'Similar style'
      WHEN s.brand_match > 0 THEN 'More from this brand'
      WHEN s.category_match > 0 THEN 'You might also like'
      ELSE 'Similar price range'
    END as reason
  FROM scored s
  WHERE (s.brand_match + s.category_match + s.price_match) > 10
  ORDER BY score DESC, s.like_count DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_similar_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_similar_products TO anon;

DO $$
BEGIN
  RAISE NOTICE 'get_similar_products updated with pagination (result_offset parameter)';
END $$;
