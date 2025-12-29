-- Migration: Infinite Recommendations
-- Date: December 22, 2025
-- Purpose: Make the home feed infinite by always returning products, cycling through with discovery mode

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
  recommendation_reason TEXT
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
  
  -- Count total available products for cycling
  SELECT COUNT(*) INTO total_available 
  FROM products p 
  WHERE p.is_available = true 
    AND NOT EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
    );
  
  -- If we've scrolled past all products, cycle back (infinite scroll)
  -- Use modulo to wrap around, but add some randomization based on the "cycle number"
  IF total_available > 0 THEN
    effective_offset := offset_val % total_available;
  ELSE
    effective_offset := 0;
  END IF;
  
  RETURN QUERY
  WITH impression_data AS (
    SELECT 
      upi.product_id,
      upi.impression_count,
      upi.last_shown_at,
      CASE 
        WHEN upi.last_shown_at > NOW() - INTERVAL '1 hour' THEN 5
        WHEN upi.last_shown_at > NOW() - INTERVAL '6 hours' THEN 3
        WHEN upi.last_shown_at > NOW() - INTERVAL '24 hours' THEN 1
        ELSE 0
      END as recency_penalty
    FROM user_product_impressions upi
    WHERE upi.user_id = target_user_id
  ),
  -- Calculate the cycle number (how many times we've gone through the full catalog)
  cycle_info AS (
    SELECT 
      (offset_val / GREATEST(total_available, 1)) as cycle_num
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
      
      COALESCE(imp.impression_count, 0) as times_shown,
      COALESCE(imp.recency_penalty, 0) as recency_penalty,
      
      -- BRAND AFFINITY (30% weight)
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
      
      -- FRESHNESS + POPULARITY (25% weight)
      (
        CASE 
          WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 12
          WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 10
          WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 7
          WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 4
          WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 2
          ELSE 0
        END
        +
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
        ELSE 2.5
      END * 0.5 as price_score,
      
      -- Sale bonus
      CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 2 ELSE 0 END as sale_bonus,
      
      -- Variety score with refresh seed AND cycle number for different ordering each cycle
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed + (SELECT cycle_num FROM cycle_info) * 137 + EXTRACT(EPOCH FROM p.created_at)::bigint % 1000) % 6) as variety_score,
      
      -- IMPRESSION PENALTY: Reduced when cycling to allow products to reappear
      -- Penalty decays based on cycle number
      CASE 
        WHEN COALESCE(imp.impression_count, 0) >= 5 THEN -15.0 / (1 + (SELECT cycle_num FROM cycle_info) * 0.5)
        WHEN COALESCE(imp.impression_count, 0) >= 3 THEN -8.0 / (1 + (SELECT cycle_num FROM cycle_info) * 0.5)
        WHEN COALESCE(imp.impression_count, 0) >= 1 THEN -3.0 / (1 + (SELECT cycle_num FROM cycle_info) * 0.5)
        ELSE 0
      END - COALESCE(imp.recency_penalty, 0) * 2.0 / (1 + (SELECT cycle_num FROM cycle_info) * 0.3) as impression_penalty,
      
      -- Discovery bonus: adds randomization that changes each cycle
      -- Use modulo arithmetic on the UUID's hash for pseudo-random ordering
      (abs(('x' || substr(p.id::text, 1, 8))::bit(32)::int + refresh_seed + (SELECT cycle_num FROM cycle_info)::int) % 10) as discovery_bonus
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN impression_data imp ON imp.product_id = p.id
    WHERE p.is_available = true
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score + sp.impression_penalty + sp.discovery_bonus) as total_score,
      CASE 
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.freshness_popularity_score > 10 THEN 'Trending now'
        WHEN sp.created_at > NOW() - INTERVAL '7 days' THEN 'New arrival'
        ELSE 'Discover something new'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score + sp.impression_penalty + sp.discovery_bonus) DESC,
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
    bl.reason
  FROM brand_limited bl
  ORDER BY bl.interleave_position, bl.total_score DESC
  LIMIT result_limit
  OFFSET effective_offset;
END;
$$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '=== Infinite Recommendations Migration Complete ===';
  RAISE NOTICE 'Updated: get_recommendations() for infinite scroll';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Offset now wraps around when reaching end of catalog';
  RAISE NOTICE '  - Each cycle through the catalog uses different ordering';
  RAISE NOTICE '  - Impression penalties decay with each cycle';
  RAISE NOTICE '  - Discovery bonus adds variety on repeat views';
  RAISE NOTICE '  - "Discover something new" reason for cycling products';
END $$;
