-- Migration: Optimize get_recommendations for performance
-- Date: January 16, 2026
-- Purpose: Fix statement timeout on Android/slow connections
-- Problem: Function scans ALL products before limiting, causing timeouts

-- Drop old functions
DROP FUNCTION IF EXISTS get_recommendations(UUID, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS compute_user_preferences(uuid);

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
STABLE
AS $$
DECLARE
  user_prefs user_preferences%ROWTYPE;
  has_preferences BOOLEAN;
  max_per_brand INTEGER := 3;
  prefs_age INTERVAL;
BEGIN
  -- Only refresh preferences if stale (> 1 hour old) or missing
  SELECT NOW() - up.updated_at INTO prefs_age
  FROM user_preferences up WHERE up.user_id = target_user_id;
  
  IF prefs_age IS NULL OR prefs_age > INTERVAL '1 hour' THEN
    PERFORM compute_user_preferences(target_user_id);
  END IF;
  
  -- Get user preferences
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  
  -- Check if user has any preferences
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;
  
  RETURN QUERY
  WITH 
  -- Get user's liked product IDs for exclusion (limit to recent for performance)
  user_liked AS (
    SELECT ulp.product_id 
    FROM user_likes_products ulp 
    WHERE ulp.user_id = target_user_id
  ),
  -- Get followed brand IDs for boosting
  followed_brands AS (
    SELECT ufb.brand_id
    FROM user_follows_brands ufb
    WHERE ufb.user_id = target_user_id
  ),
  -- OPTIMIZATION: Pre-filter to a reasonable candidate set BEFORE scoring
  -- This is the key fix - we limit the rows we process
  candidate_products AS (
    SELECT p.*, b.name as b_name, b.slug as b_slug
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.is_available = true
      AND p.id NOT IN (SELECT product_id FROM user_liked)
      AND (
        -- Include products from followed brands (high priority)
        p.brand_id IN (SELECT brand_id FROM followed_brands)
        OR
        -- Include recent products (discovery)
        p.created_at > NOW() - INTERVAL '30 days'
        OR
        -- Include popular products (discovery)
        p.like_count >= 3
      )
    -- Limit candidate pool to prevent full table scan
    LIMIT 5000
  ),
  scored_products AS (
    SELECT 
      cp.id,
      cp.name,
      cp.price,
      cp.sale_price,
      cp.image_url,
      cp.additional_images,
      cp.product_url,
      cp.brand_id,
      cp.b_name as brand_name,
      cp.b_slug as brand_slug,
      cp.taxonomy_category_name,
      cp.taxonomy_id,
      cp.like_count,
      cp.created_at,
      
      -- BRAND AFFINITY (30% weight)
      CASE 
        WHEN has_preferences THEN
          COALESCE((user_prefs.preferred_brands->>cp.brand_id::text)::numeric, 0) * 3.0
        ELSE 0
      END as brand_score,
      
      -- CATEGORY MATCH (35% weight)
      CASE 
        WHEN has_preferences AND cp.taxonomy_id IS NOT NULL THEN
          COALESCE((user_prefs.preferred_categories->>cp.taxonomy_id)::numeric, 0) * 3.5
        ELSE 0
      END as category_score,
      
      -- FRESHNESS + POPULARITY (25% weight)
      (
        CASE 
          WHEN cp.created_at > NOW() - INTERVAL '1 day' THEN 12
          WHEN cp.created_at > NOW() - INTERVAL '3 days' THEN 10
          WHEN cp.created_at > NOW() - INTERVAL '7 days' THEN 7
          WHEN cp.created_at > NOW() - INTERVAL '14 days' THEN 4
          WHEN cp.created_at > NOW() - INTERVAL '30 days' THEN 2
          ELSE 0
        END
        +
        LEAST(cp.like_count, 13)
      ) * 1.0 as freshness_popularity_score,
      
      -- PRICE MATCH (5% weight)
      CASE 
        WHEN has_preferences AND user_prefs.avg_price IS NOT NULL THEN
          CASE 
            WHEN cp.price BETWEEN user_prefs.price_range_min AND user_prefs.price_range_max THEN 5
            WHEN ABS(cp.price - user_prefs.avg_price) < user_prefs.avg_price * 0.3 THEN 3
            ELSE 0
          END
        ELSE 2.5
      END * 0.5 as price_score,
      
      -- Sale bonus
      CASE WHEN cp.sale_price IS NOT NULL AND cp.sale_price < cp.price THEN 2 ELSE 0 END as sale_bonus,
      
      -- Variety score with refresh seed
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed + EXTRACT(EPOCH FROM cp.created_at)::bigint % 1000) % 6) as variety_score
      
    FROM candidate_products cp
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
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score) DESC,
        sp.created_at DESC
      ) as brand_rank
    FROM scored_products sp
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
    false as is_liked_by_user,  -- We already excluded liked products
    bl.total_score,
    bl.reason,
    bl.created_at
  FROM brand_limited bl
  ORDER BY bl.interleave_position, bl.total_score DESC
  LIMIT result_limit
  OFFSET offset_val;
END;
$$;

-- Add index to speed up the candidate filtering
CREATE INDEX IF NOT EXISTS idx_products_created_at_available 
ON products(created_at DESC) 
WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_products_like_count_available 
ON products(like_count DESC) 
WHERE is_available = true AND like_count >= 3;

-- Ensure user_preferences has updated_at for staleness check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_preferences' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Update compute_user_preferences to set updated_at
CREATE OR REPLACE FUNCTION compute_user_preferences(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  pref_record RECORD;
BEGIN
  -- Calculate preferences from user's liked products and followed brands
  WITH liked_products AS (
    SELECT p.brand_id, p.taxonomy_id, p.price
    FROM user_likes_products ulp
    JOIN products p ON p.id = ulp.product_id
    WHERE ulp.user_id = p_user_id
  ),
  brand_counts AS (
    SELECT brand_id, COUNT(*)::numeric as cnt
    FROM liked_products
    GROUP BY brand_id
  ),
  category_counts AS (
    SELECT taxonomy_id, COUNT(*)::numeric as cnt
    FROM liked_products
    WHERE taxonomy_id IS NOT NULL
    GROUP BY taxonomy_id
  ),
  price_stats AS (
    SELECT 
      AVG(price) as avg_price,
      PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY price) as price_min,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY price) as price_max
    FROM liked_products
  ),
  follow_count AS (
    SELECT COUNT(*) as cnt FROM user_follows_brands WHERE user_id = p_user_id
  )
  SELECT 
    COALESCE((SELECT jsonb_object_agg(brand_id, cnt) FROM brand_counts), '{}'::jsonb) as preferred_brands,
    COALESCE((SELECT jsonb_object_agg(taxonomy_id, cnt) FROM category_counts), '{}'::jsonb) as preferred_categories,
    (SELECT avg_price FROM price_stats) as avg_price,
    (SELECT price_min FROM price_stats) as price_range_min,
    (SELECT price_max FROM price_stats) as price_range_max,
    (SELECT COUNT(*) FROM liked_products) as total_likes,
    (SELECT cnt FROM follow_count) as total_follows
  INTO pref_record;
  
  INSERT INTO user_preferences (
    user_id, preferred_brands, preferred_categories, 
    avg_price, price_range_min, price_range_max,
    total_likes, total_follows, updated_at
  )
  VALUES (
    p_user_id, pref_record.preferred_brands, pref_record.preferred_categories,
    pref_record.avg_price, pref_record.price_range_min, pref_record.price_range_max,
    pref_record.total_likes, pref_record.total_follows, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_brands = EXCLUDED.preferred_brands,
    preferred_categories = EXCLUDED.preferred_categories,
    avg_price = EXCLUDED.avg_price,
    price_range_min = EXCLUDED.price_range_min,
    price_range_max = EXCLUDED.price_range_max,
    total_likes = EXCLUDED.total_likes,
    total_follows = EXCLUDED.total_follows,
    updated_at = NOW();
END;
$$;

-- Analyze for query planner
ANALYZE products;
ANALYZE user_preferences;

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: optimized get_recommendations';
  RAISE NOTICE 'Key changes:';
  RAISE NOTICE '  - Pre-filters to 5000 candidate products before scoring';
  RAISE NOTICE '  - Only refreshes preferences if > 1 hour old';
  RAISE NOTICE '  - Added indexes for candidate filtering';
END $$;
