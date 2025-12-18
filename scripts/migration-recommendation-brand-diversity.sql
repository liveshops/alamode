-- Migration: Add Brand Diversity to Recommendations
-- Date: December 18, 2025
-- Purpose: Prevent single brand from dominating the feed by limiting products per brand
--          and interleaving brands for variety

-- ============================================
-- Updated recommendation function with brand diversity
-- ============================================

CREATE OR REPLACE FUNCTION get_recommendations(
  target_user_id UUID,
  result_limit INTEGER DEFAULT 50,
  offset_val INTEGER DEFAULT 0
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
  is_liked_by_user BOOLEAN,
  recommendation_score DECIMAL,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_prefs user_preferences%ROWTYPE;
  has_preferences BOOLEAN;
  max_per_brand INTEGER := 3;  -- Max products per brand per page
BEGIN
  -- Refresh user preferences
  PERFORM compute_user_preferences(target_user_id);
  
  -- Get user preferences
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  
  -- Check if user has any preferences
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;
  
  RETURN QUERY
  WITH scored_products AS (
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
      p.taxonomy_id,
      p.like_count,
      p.created_at,
      EXISTS(
        SELECT 1 FROM user_likes_products ulp 
        WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
      ) as is_liked,
      
      -- BRAND AFFINITY (30% weight - reduced from 40%)
      CASE 
        WHEN has_preferences THEN
          COALESCE((user_prefs.preferred_brands->>p.brand_id::text)::numeric, 0) * 3.0
        ELSE 0
      END as brand_score,
      
      -- CATEGORY MATCH (35% weight)
      CASE 
        WHEN has_preferences AND p.taxonomy_id IS NOT NULL THEN
          COALESCE((user_prefs.preferred_categories->>p.taxonomy_id)::numeric, 0) * 3.5
        ELSE 0
      END as category_score,
      
      -- FRESHNESS + POPULARITY (25% weight - increased from 20%)
      (
        -- Freshness component (12%)
        CASE 
          WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 12
          WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 10
          WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 7
          WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 4
          WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 2
          ELSE 0
        END
        +
        -- Popularity component (13%)
        LEAST(p.like_count, 13)
      ) * 1.0 as freshness_popularity_score,
      
      -- PRICE MATCH (5% weight)
      CASE 
        WHEN has_preferences AND user_prefs.avg_price IS NOT NULL THEN
          CASE 
            WHEN p.price BETWEEN user_prefs.price_range_min AND user_prefs.price_range_max THEN 5
            WHEN ABS(p.price - user_prefs.avg_price) < user_prefs.avg_price * 0.3 THEN 3
            ELSE 0
          END
        ELSE 2.5  -- Neutral score for new users
      END * 0.5 as price_score,
      
      -- Sale bonus
      CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 2 ELSE 0 END as sale_bonus,
      
      -- Random factor for variety (0-5 points) - changes daily per product
      (EXTRACT(DOY FROM NOW())::int + EXTRACT(EPOCH FROM p.created_at)::bigint % 1000) % 6 as variety_score
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.is_available = true
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score) as total_score,
      CASE 
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.freshness_popularity_score > 10 THEN 'Trending now'
        WHEN sp.created_at > NOW() - INTERVAL '7 days' THEN 'New arrival'
        ELSE 'Popular pick'
      END as reason,
      -- Rank products within each brand by score
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score) DESC,
        sp.created_at DESC
      ) as brand_rank
    FROM scored_products sp
    WHERE sp.is_liked = false  -- Don't recommend already-liked items
  ),
  -- Filter to max N products per brand, then interleave
  brand_limited AS (
    SELECT 
      rp.*,
      -- Create interleave position: prioritize showing 1 from each brand before 2nd from any brand
      -- Formula: (brand_rank - 1) * 1000 + row_number creates interleaving pattern
      (rp.brand_rank - 1) * 10000 + ROW_NUMBER() OVER (
        PARTITION BY rp.brand_rank 
        ORDER BY rp.total_score DESC
      ) as interleave_position
    FROM ranked_products rp
    WHERE rp.brand_rank <= max_per_brand
  )
  SELECT 
    bl.id,
    bl.name,
    bl.price,
    bl.sale_price,
    bl.image_url,
    bl.product_url,
    bl.brand_id,
    bl.brand_name,
    bl.brand_slug,
    bl.taxonomy_category_name,
    bl.like_count,
    bl.is_liked,
    bl.total_score,
    bl.reason
  FROM brand_limited bl
  ORDER BY bl.interleave_position, bl.total_score DESC
  LIMIT result_limit
  OFFSET offset_val;
END;
$$;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== Brand Diversity Migration Complete ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Max 3 products per brand per page';
  RAISE NOTICE '  - Brand affinity reduced: 40%% -> 30%%';
  RAISE NOTICE '  - Freshness/popularity increased: 20%% -> 25%%';
  RAISE NOTICE '  - Added daily variety score for shuffling';
  RAISE NOTICE '  - Interleaving: shows 1 product from each brand before 2nd from any';
  RAISE NOTICE '';
  RAISE NOTICE 'Test with: SELECT brand_name, count(*) FROM get_recommendations(''<user-uuid>'', 20, 0) GROUP BY brand_name;';
END $$;
