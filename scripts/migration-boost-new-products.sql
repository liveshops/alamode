-- Migration: Boost New Products & Add created_at to recommendations
-- Date: December 29, 2025
-- Purpose: Increase priority for new products and return created_at for recency badges

DROP FUNCTION IF EXISTS get_recommendations(UUID, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_recommendations(
  target_user_id UUID,
  result_limit INTEGER DEFAULT 50,
  offset_val INTEGER DEFAULT 0,
  refresh_seed INTEGER DEFAULT 0
)
RETURNS TABLE (
  product_id UUID,
  name TEXT,
  price DECIMAL,
  sale_price DECIMAL,
  image_url TEXT,
  additional_images TEXT[],
  product_url TEXT,
  brand_id UUID,
  brand_name TEXT,
  brand_slug TEXT,
  taxonomy_category_name TEXT,
  like_count INTEGER,
  is_liked_by_user BOOLEAN,
  recommendation_score DECIMAL,
  recommendation_reason TEXT,
  created_at TIMESTAMPTZ  -- Added for recency badge display
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_prefs user_preferences%ROWTYPE;
  has_preferences BOOLEAN;
  max_per_brand INTEGER := 3;
  popular_threshold INTEGER := 100;
  total_available INTEGER;
  effective_offset INTEGER;
BEGIN
  -- Refresh user preferences
  PERFORM compute_user_preferences(target_user_id);
  
  -- Get user preferences
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  
  -- Check if user has any preferences
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;
  
  -- Count total available products for infinite scroll cycling
  SELECT COUNT(*) INTO total_available 
  FROM products p 
  WHERE p.is_available = true 
    AND NOT EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM user_product_impressions upi 
        WHERE upi.product_id = p.id 
          AND upi.user_id = target_user_id
          AND upi.last_shown_at > NOW() - INTERVAL '7 days'
      )
      OR p.like_count >= popular_threshold
    );
  
  -- Infinite scroll: cycle back to start when we've shown all products
  IF total_available > 0 THEN
    effective_offset := offset_val % total_available;
  ELSE
    effective_offset := 0;
  END IF;
  
  RETURN QUERY
  WITH recent_impressions AS (
    SELECT 
      upi.product_id,
      upi.last_shown_at
    FROM user_product_impressions upi
    WHERE upi.user_id = target_user_id
      AND upi.last_shown_at > NOW() - INTERVAL '7 days'
  ),
  scored_products AS (
    SELECT 
      p.id,
      p.name,
      p.price,
      p.sale_price,
      p.image_url,
      p.additional_images,
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
      
      -- BRAND AFFINITY (25% weight - reduced to make room for freshness)
      CASE 
        WHEN has_preferences THEN
          COALESCE((user_prefs.preferred_brands->>p.brand_id::text)::numeric, 0) * 2.5
        ELSE 0
      END as brand_score,
      
      -- CATEGORY MATCH (25% weight - reduced to make room for freshness)
      CASE 
        WHEN has_preferences AND p.taxonomy_id IS NOT NULL THEN
          COALESCE((user_prefs.preferred_categories->>p.taxonomy_id)::numeric, 0) * 2.5
        ELSE 0
      END as category_score,
      
      -- FRESHNESS BOOST (35% weight - INCREASED for new products priority)
      -- New products get significant boost
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 25    -- Brand new: huge boost
        WHEN p.created_at > NOW() - INTERVAL '2 days' THEN 20   -- Very fresh
        WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 16   -- Fresh
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 12   -- This week
        WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 6   -- Last 2 weeks
        WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 3   -- This month
        ELSE 0
      END as freshness_score,
      
      -- POPULARITY (10% weight - separate from freshness now)
      LEAST(p.like_count, 15) * 0.7 as popularity_score,
      
      -- PRICE MATCH (5% weight)
      CASE 
        WHEN has_preferences AND user_prefs.avg_price IS NOT NULL THEN
          CASE 
            WHEN p.price BETWEEN user_prefs.price_range_min AND user_prefs.price_range_max THEN 5
            WHEN ABS(p.price - user_prefs.avg_price) < user_prefs.avg_price * 0.3 THEN 3
            ELSE 0
          END
        ELSE 2.5
      END * 0.5 as price_score,
      
      -- Sale bonus
      CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 2 ELSE 0 END as sale_bonus,
      
      -- Variety score
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed + EXTRACT(EPOCH FROM p.created_at)::bigint % 1000) % 6) as variety_score,
      
      -- Discovery bonus
      (abs(('x' || substr(p.id::text, 1, 8))::bit(32)::int + refresh_seed) % 10) as discovery_bonus
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.is_available = true
      AND (
        NOT EXISTS (SELECT 1 FROM recent_impressions ri WHERE ri.product_id = p.id)
        OR p.like_count >= popular_threshold
      )
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.brand_score + sp.category_score + sp.freshness_score + sp.popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score + sp.discovery_bonus) as total_score,
      CASE 
        WHEN sp.created_at > NOW() - INTERVAL '1 day' THEN 'Just added 🔥'
        WHEN sp.created_at > NOW() - INTERVAL '3 days' THEN 'New arrival'
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.popularity_score > 8 THEN 'Trending now'
        WHEN sp.created_at > NOW() - INTERVAL '7 days' THEN 'New this week'
        WHEN sp.like_count >= popular_threshold THEN 'Popular pick'
        ELSE 'Discover something new'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_score + sp.popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score + sp.discovery_bonus) DESC,
        sp.created_at DESC
      ) as brand_rank
    FROM scored_products sp
    WHERE sp.is_liked = false
  ),
  brand_limited AS (
    SELECT 
      rp.*,
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
    bl.additional_images,
    bl.product_url,
    bl.brand_id,
    bl.brand_name,
    bl.brand_slug,
    bl.taxonomy_category_name,
    bl.like_count,
    bl.is_liked,
    bl.total_score,
    bl.reason,
    bl.created_at  -- Return created_at for recency badge
  FROM brand_limited bl
  ORDER BY bl.interleave_position, bl.total_score DESC
  LIMIT result_limit
  OFFSET effective_offset;
END;
$$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '=== Boost New Products Migration Complete ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Freshness weight increased to 35%% (was ~25%%)';
  RAISE NOTICE '  - Products < 24h old get 25 point boost';
  RAISE NOTICE '  - Products < 3 days get 16-20 point boost';
  RAISE NOTICE '  - created_at now returned for frontend recency badges';
  RAISE NOTICE '  - New recommendation reasons: "Just added", "New arrival", "New this week"';
END $$;
