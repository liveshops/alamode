-- Migration: Balanced Penalties for Feed Diversity
-- Date: December 30, 2025
-- Purpose: Prevent repetition without completely eliminating recently shown products

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
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_prefs user_preferences%ROWTYPE;
  has_preferences BOOLEAN;
  max_per_brand INTEGER := 3;
  total_available INTEGER;
  effective_offset INTEGER;
BEGIN
  -- Refresh user preferences
  PERFORM compute_user_preferences(target_user_id);
  
  -- Get user preferences
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  
  -- Check if user has any preferences
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;
  
  -- Count ALL available products (not liked by user)
  SELECT COUNT(*) INTO total_available 
  FROM products p 
  WHERE p.is_available = true 
    AND NOT EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
    );
  
  -- Infinite scroll with better randomization
  IF total_available > 0 THEN
    effective_offset := (offset_val + (refresh_seed * 7)) % total_available;
  ELSE
    effective_offset := 0;
  END IF;
  
  RETURN QUERY
  WITH recent_impressions AS (
    -- Extended to 30 days
    SELECT 
      upi.product_id,
      upi.last_shown_at,
      upi.impression_count,
      EXTRACT(DAY FROM NOW() - upi.last_shown_at)::INTEGER as days_since_shown
    FROM user_product_impressions upi
    WHERE upi.user_id = target_user_id
      AND upi.last_shown_at > NOW() - INTERVAL '30 days'
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
      
      -- Track impression data
      ri.product_id IS NOT NULL as was_recently_shown,
      COALESCE(ri.impression_count, 0) as recent_impression_count,
      COALESCE(ri.days_since_shown, 999) as days_since_shown,
      
      -- BRAND AFFINITY (30% weight)
      CASE 
        WHEN has_preferences THEN
          COALESCE((user_prefs.preferred_brands->>p.brand_id::text)::numeric, 0) * 3.0
        ELSE 0
      END as brand_score,
      
      -- CATEGORY MATCH (25% weight)
      CASE 
        WHEN has_preferences AND p.taxonomy_id IS NOT NULL THEN
          COALESCE((user_prefs.preferred_categories->>p.taxonomy_id)::numeric, 0) * 2.5
        ELSE 0
      END as category_score,
      
      -- FRESHNESS BOOST (35% weight) - prioritize new products
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 25
        WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 20
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 16
        WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 10
        WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 5
        ELSE 0
      END as freshness_score,
      
      -- POPULARITY (10% weight)
      LEAST(p.like_count, 15) as popularity_score,
      
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
      CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 3 ELSE 0 END as sale_bonus,
      
      -- ENHANCED variety score
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed + (EXTRACT(EPOCH FROM p.created_at)::bigint % 1000)::int) % 25) as variety_score,
      
      -- ENHANCED discovery bonus
      ((abs(('x' || substr(p.id::text, 1, 8))::bit(32)::bigint) + refresh_seed::bigint) % 30)::int as discovery_bonus,
      
      -- BALANCED PENALTY for recently shown products
      -- Strong but not overwhelming - allows good matches to still appear
      CASE 
        WHEN ri.product_id IS NULL THEN 0  -- Never shown = no penalty
        WHEN ri.days_since_shown < 1 THEN -80   -- Shown today = strong penalty but not impossible
        WHEN ri.days_since_shown < 2 THEN -60   -- Shown yesterday
        WHEN ri.days_since_shown < 3 THEN -45   -- Shown 2 days ago
        WHEN ri.days_since_shown < 7 THEN -30   -- Shown this week
        WHEN ri.days_since_shown < 14 THEN -20  -- Shown 1-2 weeks ago
        WHEN ri.days_since_shown < 21 THEN -10  -- Shown 2-3 weeks ago
        WHEN ri.days_since_shown < 30 THEN -5   -- Shown 3-4 weeks ago
        ELSE 0
      END as recency_penalty,
      
      -- Additional penalty for products shown multiple times (but not extreme)
      CASE 
        WHEN ri.impression_count >= 5 THEN -30
        WHEN ri.impression_count >= 3 THEN -20
        WHEN ri.impression_count >= 2 THEN -10
        ELSE 0
      END as repetition_penalty
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN recent_impressions ri ON ri.product_id = p.id
    WHERE p.is_available = true
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.brand_score + sp.category_score + sp.freshness_score + sp.popularity_score + 
       sp.price_score + sp.sale_bonus + sp.variety_score + sp.discovery_bonus + 
       sp.recency_penalty + sp.repetition_penalty) as total_score,
      CASE 
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.freshness_score >= 20 THEN 'Just added'
        WHEN sp.freshness_score >= 16 THEN 'New this week'
        WHEN sp.freshness_score > 0 THEN 'New arrival'
        WHEN sp.popularity_score >= 10 THEN 'Trending now'
        ELSE 'Discover something new'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_score + sp.popularity_score + 
         sp.price_score + sp.sale_bonus + sp.variety_score + sp.discovery_bonus + 
         sp.recency_penalty + sp.repetition_penalty) DESC,
        sp.created_at DESC
      ) as brand_rank
    FROM scored_products sp
    WHERE sp.is_liked = false  -- Don't show already-liked products
  ),
  brand_limited AS (
    SELECT 
      rp.*,
      (rp.brand_rank - 1) * 10000 + ROW_NUMBER() OVER (
        PARTITION BY rp.brand_rank 
        ORDER BY rp.total_score DESC, rp.created_at DESC
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
    bl.created_at
  FROM brand_limited bl
  ORDER BY bl.interleave_position, bl.total_score DESC, bl.created_at DESC
  LIMIT result_limit
  OFFSET effective_offset;
END;
$$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '=== Balanced Feed Penalties Migration Complete ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Reduced recency penalties to balanced levels:';
  RAISE NOTICE '    * Today: -80 (was -500)';
  RAISE NOTICE '    * Yesterday: -60 (was -300)';
  RAISE NOTICE '    * 2 days: -45';
  RAISE NOTICE '    * This week: -30 (was -200)';
  RAISE NOTICE '  - Repetition penalties: -30/-20/-10 (was -100/-50/-25)';
  RAISE NOTICE '  - 30-day impression window maintained';
  RAISE NOTICE '  - Enhanced variety and discovery scores maintained';
  RAISE NOTICE '';
  RAISE NOTICE 'Products shown recently will be deprioritized but still appear';
  RAISE NOTICE 'Strong brand/category matches can overcome the penalties';
END $$;
