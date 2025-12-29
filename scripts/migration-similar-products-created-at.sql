-- Migration: Add created_at to get_similar_products output
-- Date: December 29, 2025
-- Purpose: Return created_at for recency badge display on similar products

DROP FUNCTION IF EXISTS get_similar_products(UUID, INT, INT, UUID);

CREATE OR REPLACE FUNCTION get_similar_products(
  source_product_id UUID,
  result_limit INTEGER DEFAULT 10,
  result_offset INTEGER DEFAULT 0,
  for_user_id UUID DEFAULT NULL
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
  similarity_reason TEXT,
  created_at TIMESTAMPTZ  -- Added for recency badge
)
LANGUAGE plpgsql
AS $$
DECLARE
  source_brand_id UUID;
  source_taxonomy TEXT;
  source_price DECIMAL;
  max_consecutive_per_brand INTEGER := 3;
  brand_gap INTEGER := 4;
BEGIN
  SELECT p.brand_id, p.taxonomy_id, p.price
  INTO source_brand_id, source_taxonomy, source_price
  FROM products p
  WHERE p.id = source_product_id;

  RETURN QUERY
  WITH user_followed_brands AS (
    SELECT ufb_inner.brand_id as followed_brand_id 
    FROM user_follows_brands ufb_inner 
    WHERE ufb_inner.user_id = for_user_id
  ),
  scored AS (
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
      p.created_at,
      
      CASE WHEN p.brand_id = source_brand_id THEN 10 ELSE 0 END as brand_match,
      
      CASE 
        WHEN p.taxonomy_id = source_taxonomy THEN 40
        WHEN p.taxonomy_id IS NOT NULL AND source_taxonomy IS NOT NULL 
             AND split_part(p.taxonomy_id, '-', 1) = split_part(source_taxonomy, '-', 1)
             AND split_part(p.taxonomy_id, '-', 2) = split_part(source_taxonomy, '-', 2) THEN 25
        WHEN p.taxonomy_id IS NOT NULL AND source_taxonomy IS NOT NULL 
             AND split_part(p.taxonomy_id, '-', 1) = split_part(source_taxonomy, '-', 1) THEN 15
        ELSE 0
      END as category_match,
      
      CASE 
        WHEN source_price > 0 THEN
          GREATEST(0, 20 - (ABS(p.price - source_price) / source_price * 40))
        ELSE 10
      END as price_match,
      
      LEAST(p.like_count, 10) as popularity_bonus,
      
      CASE 
        WHEN for_user_id IS NOT NULL 
             AND p.brand_id != source_brand_id
             AND NOT EXISTS (SELECT 1 FROM user_followed_brands ufb WHERE ufb.followed_brand_id = p.brand_id)
        THEN 8
        ELSE 0
      END as discovery_bonus,
      
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 5
        WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 3
        ELSE 0
      END as freshness_bonus
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id != source_product_id
      AND p.is_available = true
  ),
  ranked AS (
    SELECT 
      s.*,
      (s.brand_match + s.category_match + s.price_match + s.popularity_bonus + s.discovery_bonus + s.freshness_bonus) as total_score,
      CASE 
        WHEN s.brand_match > 0 AND s.category_match >= 40 THEN 'Same brand & style'
        WHEN s.category_match >= 40 THEN 'Similar style'
        WHEN s.brand_match > 0 THEN 'More from this brand'
        WHEN s.discovery_bonus > 0 AND s.category_match > 0 THEN 'Discover this brand'
        WHEN s.category_match > 0 THEN 'You might also like'
        ELSE 'Similar price range'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY s.brand_id ORDER BY 
        (s.brand_match + s.category_match + s.price_match + s.popularity_bonus + s.discovery_bonus + s.freshness_bonus) DESC,
        s.like_count DESC
      ) as brand_rank
    FROM scored s
    WHERE (s.brand_match + s.category_match + s.price_match) > 10
  ),
  interleaved AS (
    SELECT 
      r.*,
      (
        ((r.brand_rank - 1) / max_consecutive_per_brand) * 10000
        +
        ROW_NUMBER() OVER (
          PARTITION BY ((r.brand_rank - 1) / max_consecutive_per_brand)
          ORDER BY r.total_score DESC, r.like_count DESC
        )
      ) as interleave_position
    FROM ranked r
  )
  SELECT 
    i.id,
    i.name,
    i.price,
    i.sale_price,
    i.image_url,
    i.product_url,
    i.brand_id,
    i.brand_name,
    i.brand_slug,
    i.taxonomy_category_name,
    i.like_count,
    i.total_score,
    i.reason,
    i.created_at  -- Return created_at
  FROM interleaved i
  ORDER BY i.interleave_position, i.total_score DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_similar_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_similar_products TO anon;

DO $$
BEGIN
  RAISE NOTICE '=== Similar Products Created At Migration Complete ===';
  RAISE NOTICE 'Added created_at to get_similar_products output for recency badges';
END $$;
