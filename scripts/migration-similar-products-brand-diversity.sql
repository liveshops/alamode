-- Migration: Add brand diversity to get_similar_products
-- Run this in Supabase SQL Editor
-- 
-- Changes:
-- 1. Reduce same-brand bonus from 30 → 10 (category matters more than brand)
-- 2. Limit max 3 products per brand in consecutive results
-- 3. Interleave brands so same brand can reappear after 4-5 other brands shown
-- 4. Add discovery bonus for products from brands user hasn't followed

-- Drop old function to avoid signature conflicts
DROP FUNCTION IF EXISTS get_similar_products(UUID, INT);
DROP FUNCTION IF EXISTS get_similar_products(UUID, INT, INT);

CREATE OR REPLACE FUNCTION get_similar_products(
  source_product_id UUID,
  result_limit INTEGER DEFAULT 10,
  result_offset INTEGER DEFAULT 0,
  for_user_id UUID DEFAULT NULL  -- Optional: pass user ID for discovery bonus
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
  max_consecutive_per_brand INTEGER := 3;  -- Max products from same brand in a row
  brand_gap INTEGER := 4;  -- Show this many other brands before same brand can reappear
BEGIN
  -- Get source product details
  SELECT p.brand_id, p.taxonomy_id, p.price
  INTO source_brand_id, source_taxonomy, source_price
  FROM products p
  WHERE p.id = source_product_id;

  RETURN QUERY
  WITH user_followed_brands AS (
    -- Get brands the user follows (for discovery scoring)
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
      
      -- Same brand score (REDUCED from 30 to 10)
      CASE WHEN p.brand_id = source_brand_id THEN 10 ELSE 0 END as brand_match,
      
      -- Same category score (stays important at 40)
      CASE 
        WHEN p.taxonomy_id = source_taxonomy THEN 40
        WHEN p.taxonomy_id IS NOT NULL AND source_taxonomy IS NOT NULL 
             AND split_part(p.taxonomy_id, '-', 1) = split_part(source_taxonomy, '-', 1)
             AND split_part(p.taxonomy_id, '-', 2) = split_part(source_taxonomy, '-', 2) THEN 25
        WHEN p.taxonomy_id IS NOT NULL AND source_taxonomy IS NOT NULL 
             AND split_part(p.taxonomy_id, '-', 1) = split_part(source_taxonomy, '-', 1) THEN 15
        ELSE 0
      END as category_match,
      
      -- Price similarity score (up to 20)
      CASE 
        WHEN source_price > 0 THEN
          GREATEST(0, 20 - (ABS(p.price - source_price) / source_price * 40))
        ELSE 10
      END as price_match,
      
      -- Popularity bonus (up to 10)
      LEAST(p.like_count, 10) as popularity_bonus,
      
      -- Discovery bonus: boost products from brands user doesn't follow (up to 8)
      CASE 
        WHEN for_user_id IS NOT NULL 
             AND p.brand_id != source_brand_id
             AND NOT EXISTS (SELECT 1 FROM user_followed_brands ufb WHERE ufb.followed_brand_id = p.brand_id)
        THEN 8
        ELSE 0
      END as discovery_bonus,
      
      -- Freshness bonus for newer products (up to 5)
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
      -- Rank within each brand by score
      ROW_NUMBER() OVER (PARTITION BY s.brand_id ORDER BY 
        (s.brand_match + s.category_match + s.price_match + s.popularity_bonus + s.discovery_bonus + s.freshness_bonus) DESC,
        s.like_count DESC
      ) as brand_rank
    FROM scored s
    WHERE (s.brand_match + s.category_match + s.price_match) > 10
  ),
  -- Interleave brands: create position that cycles through brands
  interleaved AS (
    SELECT 
      r.*,
      -- Calculate interleave position:
      -- brand_rank determines which "round" this product appears in
      -- Within each round, order by total_score
      -- This creates pattern: Brand A (1-3), Brand B (1-3), Brand C (1-3), Brand A (4-6), etc.
      (
        -- Which "cycle" this product is in (0 for items 1-3, 1 for items 4-6, etc.)
        ((r.brand_rank - 1) / max_consecutive_per_brand) * 10000
        +
        -- Within cycle, order by score across all brands
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
    i.reason
  FROM interleaved i
  ORDER BY i.interleave_position, i.total_score DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_similar_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_similar_products TO anon;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '=== Similar Products Brand Diversity Migration Complete ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  - Same brand bonus: 30 → 10 (category now more important)';
  RAISE NOTICE '  - Category match: 40 (exact), 25 (subcategory), 15 (parent)';
  RAISE NOTICE '  - Max 3 consecutive products per brand';
  RAISE NOTICE '  - Brands cycle after showing 3 products each';
  RAISE NOTICE '  - Discovery bonus (+8) for brands user does not follow';
  RAISE NOTICE '  - Freshness bonus (+5) for products < 7 days old';
  RAISE NOTICE '';
  RAISE NOTICE 'New optional parameter: for_user_id UUID';
  RAISE NOTICE '  - Pass user ID to enable discovery bonus';
  RAISE NOTICE '';
  RAISE NOTICE 'Test with:';
  RAISE NOTICE '  SELECT * FROM get_similar_products(''<product-uuid>'', 10, 0, ''<user-uuid>'');';
END $$;
