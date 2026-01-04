-- Fix Recommendation Algorithm: Aggressive Age & Repeat Penalties
-- Addresses: 1) Too many old products (2-3 weeks), 2) Same products appearing 10-12 times

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
    -- Track impressions from last 60 days (extended for stronger penalties)
    SELECT 
      upi.product_id,
      upi.last_shown_at,
      upi.impression_count,
      EXTRACT(DAY FROM NOW() - upi.last_shown_at)::INTEGER as days_since_shown
    FROM user_product_impressions upi
    WHERE upi.user_id = target_user_id
      AND upi.last_shown_at > NOW() - INTERVAL '60 days'
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
      
      -- BRAND AFFINITY (25% weight - reduced to prioritize freshness)
      CASE 
        WHEN has_preferences THEN
          COALESCE((user_prefs.preferred_brands->>p.brand_id::text)::numeric, 0) * 2.5
        ELSE 0
      END as brand_score,
      
      -- CATEGORY MATCH (20% weight - reduced)
      CASE 
        WHEN has_preferences AND p.taxonomy_id IS NOT NULL THEN
          COALESCE((user_prefs.preferred_categories->>p.taxonomy_id)::numeric, 0) * 2.0
        ELSE 0
      END as category_score,
      
      -- MASSIVE FRESHNESS BOOST (45% weight - much higher priority for new products)
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 45   -- Last 24 hours: huge boost
        WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 35  -- Last 3 days: large boost
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 25  -- Last week: good boost
        WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 15 -- Last 2 weeks: small boost
        WHEN p.created_at > NOW() - INTERVAL '21 days' THEN 8  -- Last 3 weeks: tiny boost
        WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 3  -- Last month: minimal
        ELSE 0  -- Older than month: no boost
      END as freshness_score,
      
      -- HEAVY AGE PENALTIES - Punish old products much more aggressively
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 0   -- New products: no penalty
        WHEN p.created_at > NOW() - INTERVAL '14 days' THEN -15 -- 1-2 weeks: moderate penalty
        WHEN p.created_at > NOW() - INTERVAL '21 days' THEN -35 -- 2-3 weeks: large penalty  
        WHEN p.created_at > NOW() - INTERVAL '30 days' THEN -60 -- 3-4 weeks: huge penalty
        WHEN p.created_at > NOW() - INTERVAL '60 days' THEN -100 -- 1-2 months: massive penalty
        ELSE -150  -- Older than 2 months: extreme penalty
      END as age_penalty,
      
      -- POPULARITY (8% weight)
      LEAST(p.like_count, 12) * 0.8 as popularity_score,
      
      -- PRICE MATCH (2% weight - minimal)
      CASE 
        WHEN has_preferences AND user_prefs.avg_price IS NOT NULL THEN
          CASE 
            WHEN p.price BETWEEN user_prefs.price_range_min AND user_prefs.price_range_max THEN 2
            WHEN ABS(p.price - user_prefs.avg_price) < user_prefs.avg_price * 0.3 THEN 1
            ELSE 0
          END
        ELSE 1
      END as price_score,
      
      -- Sale bonus (small)
      CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 5 ELSE 0 END as sale_bonus,
      
      -- EXTREME REPEAT PENALTIES - Heavily punish products shown multiple times
      CASE 
        WHEN ri.product_id IS NULL THEN 0  -- Never shown = no penalty
        WHEN ri.days_since_shown < 1 THEN -200   -- Shown today = extreme penalty
        WHEN ri.days_since_shown < 2 THEN -150   -- Shown yesterday = huge penalty
        WHEN ri.days_since_shown < 3 THEN -100   -- Shown 2 days ago = large penalty
        WHEN ri.days_since_shown < 7 THEN -60    -- Shown this week = moderate penalty
        WHEN ri.days_since_shown < 14 THEN -30   -- Shown 1-2 weeks ago
        WHEN ri.days_since_shown < 21 THEN -20   -- Shown 2-3 weeks ago
        WHEN ri.days_since_shown < 30 THEN -10   -- Shown 3-4 weeks ago
        ELSE -5  -- Shown over a month ago
      END as recency_penalty,
      
      -- MASSIVE REPETITION PENALTIES - Heavily punish frequently shown products
      CASE 
        WHEN ri.impression_count >= 10 THEN -500  -- Shown 10+ times: kill it
        WHEN ri.impression_count >= 7 THEN -300   -- Shown 7-9 times: massive penalty
        WHEN ri.impression_count >= 5 THEN -200   -- Shown 5-6 times: huge penalty
        WHEN ri.impression_count >= 3 THEN -100   -- Shown 3-4 times: large penalty
        WHEN ri.impression_count >= 2 THEN -50    -- Shown 2 times: moderate penalty
        WHEN ri.impression_count >= 1 THEN -20    -- Shown once: small penalty
        ELSE 0
      END as repetition_penalty,
      
      -- Variety bonus (small randomization)
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed + (EXTRACT(EPOCH FROM p.created_at)::bigint % 1000)::int) % 15) as variety_score
      
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
       sp.recency_penalty + sp.repetition_penalty + sp.variety_score) as total_score,
      CASE 
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.freshness_score >= 35 THEN 'Just added'
        WHEN sp.freshness_score >= 25 THEN 'New this week'
        WHEN sp.freshness_score > 15 THEN 'New arrival'
        WHEN sp.popularity_score >= 8 THEN 'Trending now'
        ELSE 'Discover something new'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_score + sp.age_penalty + 
         sp.popularity_score + sp.price_score + sp.sale_bonus + 
         sp.recency_penalty + sp.repetition_penalty + sp.variety_score) DESC,
        sp.created_at DESC
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
  WHERE rp.brand_rank <= max_per_brand  -- Limit products per brand
    AND rp.total_score > -50  -- Only show products with decent scores (filters out heavily penalized items)
  ORDER BY rp.total_score DESC, rp.created_at DESC
  LIMIT result_limit OFFSET effective_offset;
END;
$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ RECOMMENDATION ALGORITHM UPDATED!';
  RAISE NOTICE '';
  RAISE NOTICE '🔥 NEW FEATURES:';
  RAISE NOTICE '   • MASSIVE freshness boost (45% weight for new products)';
  RAISE NOTICE '   • HEAVY age penalties (-15 to -150 for old products)';
  RAISE NOTICE '   • EXTREME repeat penalties (-20 to -500 for shown products)';
  RAISE NOTICE '   • Products with 10+ impressions get -500 score penalty';
  RAISE NOTICE '';
  RAISE NOTICE '📱 This should dramatically reduce:';
  RAISE NOTICE '   • Old products (2-3+ weeks) appearing in feed';
  RAISE NOTICE '   • Same products repeating 10+ times';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Fresh products (last 7 days) now get huge priority!';
END $$;
