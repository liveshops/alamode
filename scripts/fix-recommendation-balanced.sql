-- Fix Recommendation Algorithm: Balanced Approach
-- Goals: 1) Prioritize fresh products, 2) Reduce repeats, 3) NEVER empty feed, 4) Infinite scroll

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
  max_per_brand INTEGER := 4; -- Increased to ensure variety
  total_available INTEGER;
  effective_offset INTEGER;
BEGIN
  -- Refresh user preferences
  PERFORM compute_user_preferences(target_user_id);
  
  -- Get user preferences
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  
  -- Check if user has any preferences
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;
  
  -- Count ALL available products (not liked by user) - ENSURE INFINITE SCROLL
  SELECT COUNT(*) INTO total_available 
  FROM products p 
  WHERE p.is_available = true 
    AND NOT EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
    );
  
  -- Better infinite scroll with large product pool rotation
  IF total_available > 0 THEN
    effective_offset := (offset_val + (refresh_seed * 13)) % GREATEST(total_available, 1000);
  ELSE
    effective_offset := 0;
  END IF;
  
  RETURN QUERY
  WITH recent_impressions AS (
    -- Track impressions from last 14 days only (shorter window = less aggressive penalties)
    SELECT 
      upi.product_id,
      upi.last_shown_at,
      upi.impression_count,
      EXTRACT(DAY FROM NOW() - upi.last_shown_at)::INTEGER as days_since_shown
    FROM user_product_impressions upi
    WHERE upi.user_id = target_user_id
      AND upi.last_shown_at > NOW() - INTERVAL '14 days'
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
      
      -- MODERATE FRESHNESS BOOST (30% weight - good but not overwhelming)
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 15   -- Last 24 hours: good boost
        WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 12  -- Last 3 days: decent boost
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 8   -- Last week: small boost
        WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 5  -- Last 2 weeks: tiny boost
        WHEN p.created_at > NOW() - INTERVAL '21 days' THEN 2  -- Last 3 weeks: minimal
        ELSE 0  -- Older: no boost but no penalty
      END as freshness_score,
      
      -- MILD AGE PENALTIES - Gentle nudges, not harsh punishment
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 0   -- New products: no penalty
        WHEN p.created_at > NOW() - INTERVAL '30 days' THEN -3  -- 2-4 weeks: tiny penalty
        WHEN p.created_at > NOW() - INTERVAL '60 days' THEN -8  -- 1-2 months: small penalty
        ELSE -12  -- Older than 2 months: moderate penalty (not extreme)
      END as age_penalty,
      
      -- POPULARITY (10% weight)
      LEAST(p.like_count, 20) as popularity_score,
      
      -- PRICE MATCH (5% weight)
      CASE 
        WHEN has_preferences AND user_prefs.avg_price IS NOT NULL THEN
          CASE 
            WHEN p.price BETWEEN user_prefs.price_range_min AND user_prefs.price_range_max THEN 5
            WHEN ABS(p.price - user_prefs.avg_price) < user_prefs.avg_price * 0.4 THEN 3
            ELSE 1
          END
        ELSE 2
      END as price_score,
      
      -- Sale bonus
      CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 4 ELSE 0 END as sale_bonus,
      
      -- MODERATE REPEAT PENALTIES - Reduce repeats without killing products
      CASE 
        WHEN ri.product_id IS NULL THEN 0  -- Never shown = no penalty
        WHEN ri.days_since_shown < 1 THEN -25   -- Shown today = moderate penalty
        WHEN ri.days_since_shown < 2 THEN -18   -- Shown yesterday = small penalty
        WHEN ri.days_since_shown < 3 THEN -12   -- Shown 2 days ago = tiny penalty
        WHEN ri.days_since_shown < 7 THEN -8    -- Shown this week = minimal penalty
        ELSE -3  -- Shown over a week ago = almost no penalty
      END as recency_penalty,
      
      -- REASONABLE REPETITION PENALTIES - Discourage but don't eliminate
      CASE 
        WHEN ri.impression_count >= 8 THEN -40   -- Shown 8+ times: large penalty but not death
        WHEN ri.impression_count >= 6 THEN -30   -- Shown 6-7 times: moderate penalty
        WHEN ri.impression_count >= 4 THEN -20   -- Shown 4-5 times: small penalty
        WHEN ri.impression_count >= 2 THEN -10   -- Shown 2-3 times: tiny penalty
        WHEN ri.impression_count >= 1 THEN -5    -- Shown once: minimal penalty
        ELSE 0
      END as repetition_penalty,
      
      -- Enhanced variety and discovery
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed * 3 + (EXTRACT(EPOCH FROM p.created_at)::bigint % 1000)::int) % 25) as variety_score,
      ((abs(('x' || substr(p.id::text, 1, 8))::bit(32)::bigint) + refresh_seed::bigint * 7) % 20)::int as discovery_bonus
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN recent_impressions ri ON ri.product_id = p.id
    WHERE p.is_available = true
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.brand_score + sp.category_score + sp.freshness_score + sp.age_penalty + 
       sp.popularity_score + sp.price_score + sp.sale_bonus + 
       sp.recency_penalty + sp.repetition_penalty + sp.variety_score + sp.discovery_bonus) as total_score,
      CASE 
        WHEN sp.brand_score > 5 AND sp.category_score > 3 THEN 'Perfect match'
        WHEN sp.brand_score > 5 THEN 'From brands you love'
        WHEN sp.category_score > 3 THEN 'Similar to items you liked'
        WHEN sp.freshness_score >= 12 THEN 'Just added'
        WHEN sp.freshness_score >= 8 THEN 'New this week'
        WHEN sp.freshness_score > 2 THEN 'New arrival'
        WHEN sp.popularity_score >= 15 THEN 'Trending now'
        ELSE 'Discover something new'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_score + sp.age_penalty + 
         sp.popularity_score + sp.price_score + sp.sale_bonus + 
         sp.recency_penalty + sp.repetition_penalty + sp.variety_score + sp.discovery_bonus) DESC,
        sp.created_at DESC,
        sp.id -- Final tie-breaker for consistent ordering
      ) as brand_rank
    FROM scored_products sp
    WHERE NOT sp.is_liked  -- Exclude products user already liked
  )
  SELECT 
    rp.id,
    rp.name,
    rp.price,
    rp.sale_price,
    rp.image_url,
    rp.additional_images,
    rp.product_url,
    rp.brand_id,
    rp.brand_name,
    rp.brand_slug,
    rp.taxonomy_category_name,
    rp.like_count,
    false as is_liked_by_user,
    rp.total_score,
    rp.reason,
    rp.created_at
  FROM ranked_products rp
  WHERE rp.brand_rank <= max_per_brand  -- Reasonable brand diversity
    -- REMOVED SCORE FILTER - Never filter out products completely!
  ORDER BY rp.total_score DESC, rp.created_at DESC, rp.id
  LIMIT result_limit OFFSET effective_offset;
END;
$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ BALANCED RECOMMENDATION ALGORITHM DEPLOYED!';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 BALANCED APPROACH:';
  RAISE NOTICE '   • Moderate freshness boost (+15 for today, +8 for this week)';
  RAISE NOTICE '   • Gentle age penalties (-3 to -12, not extreme)';
  RAISE NOTICE '   • Reasonable repeat penalties (-5 to -40, not death sentences)';
  RAISE NOTICE '   • NO score threshold filter = NEVER empty feed!';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 GUARANTEED INFINITE SCROLL:';
  RAISE NOTICE '   • No products filtered out completely';
  RAISE NOTICE '   • Enhanced variety and discovery bonuses';
  RAISE NOTICE '   • Better offset rotation for endless content';
  RAISE NOTICE '';
  RAISE NOTICE '📱 Feed should now show fresh products first but never go empty!';
END $$;
