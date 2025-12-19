-- Migration: Product Impression Tracking
-- Date: December 19, 2025
-- Purpose: Track product impressions to deprioritize repeatedly shown but not liked products

-- 1. Create impressions table
CREATE TABLE IF NOT EXISTS user_product_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  impression_count INTEGER DEFAULT 1,
  last_shown_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_impressions_user_product 
ON user_product_impressions(user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_impressions_last_shown 
ON user_product_impressions(user_id, last_shown_at);

-- 2. Function to record impressions (batch)
CREATE OR REPLACE FUNCTION record_product_impressions(
  p_user_id UUID,
  p_product_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_product_impressions (user_id, product_id, impression_count, last_shown_at)
  SELECT p_user_id, unnest(p_product_ids), 1, NOW()
  ON CONFLICT (user_id, product_id) 
  DO UPDATE SET 
    impression_count = user_product_impressions.impression_count + 1,
    last_shown_at = NOW();
END;
$$;

-- 3. Update get_recommendations to factor in impressions
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
BEGIN
  -- Refresh user preferences
  PERFORM compute_user_preferences(target_user_id);
  
  -- Get user preferences
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  
  -- Check if user has any preferences
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;
  
  RETURN QUERY
  WITH impression_data AS (
    -- Get impression counts for this user (last 24 hours weighted more heavily)
    SELECT 
      upi.product_id,
      upi.impression_count,
      upi.last_shown_at,
      CASE 
        WHEN upi.last_shown_at > NOW() - INTERVAL '1 hour' THEN 5  -- Very recent: heavy penalty
        WHEN upi.last_shown_at > NOW() - INTERVAL '6 hours' THEN 3  -- Recent: moderate penalty
        WHEN upi.last_shown_at > NOW() - INTERVAL '24 hours' THEN 1  -- Same day: light penalty
        ELSE 0  -- Older: no penalty
      END as recency_penalty
    FROM user_product_impressions upi
    WHERE upi.user_id = target_user_id
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
      
      -- Get impression data
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
      
      -- Variety score with refresh seed
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed + EXTRACT(EPOCH FROM p.created_at)::bigint % 1000) % 6) as variety_score,
      
      -- IMPRESSION PENALTY: Penalize products shown multiple times but not liked
      -- Each impression without a like reduces score
      -- Recency makes the penalty stronger (recently shown = more penalty)
      CASE 
        WHEN COALESCE(imp.impression_count, 0) >= 5 THEN -15  -- Shown 5+ times: heavy penalty
        WHEN COALESCE(imp.impression_count, 0) >= 3 THEN -8   -- Shown 3-4 times: moderate penalty
        WHEN COALESCE(imp.impression_count, 0) >= 1 THEN -3   -- Shown 1-2 times: light penalty
        ELSE 0
      END - COALESCE(imp.recency_penalty, 0) * 2 as impression_penalty
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN impression_data imp ON imp.product_id = p.id
    WHERE p.is_available = true
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score + sp.impression_penalty) as total_score,
      CASE 
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.freshness_popularity_score > 10 THEN 'Trending now'
        WHEN sp.created_at > NOW() - INTERVAL '7 days' THEN 'New arrival'
        ELSE 'Popular pick'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus + sp.variety_score + sp.impression_penalty) DESC,
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
  OFFSET offset_val;
END;
$$;

-- 4. Cleanup job: Remove old impressions (optional, run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_impressions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reset impression counts for products not shown in 7 days
  DELETE FROM user_product_impressions
  WHERE last_shown_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Enable RLS
ALTER TABLE user_product_impressions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own impressions" ON user_product_impressions;
CREATE POLICY "Users can view own impressions" ON user_product_impressions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own impressions" ON user_product_impressions;
CREATE POLICY "Users can insert own impressions" ON user_product_impressions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own impressions" ON user_product_impressions;
CREATE POLICY "Users can update own impressions" ON user_product_impressions
  FOR UPDATE USING (auth.uid() = user_id);

-- Verification
DO $$
BEGIN
  RAISE NOTICE '=== Impression Tracking Migration Complete ===';
  RAISE NOTICE 'Created: user_product_impressions table';
  RAISE NOTICE 'Created: record_product_impressions() function';
  RAISE NOTICE 'Updated: get_recommendations() with impression penalties';
  RAISE NOTICE '';
  RAISE NOTICE 'Penalty system:';
  RAISE NOTICE '  - Shown 1-2x: -3 points';
  RAISE NOTICE '  - Shown 3-4x: -8 points';
  RAISE NOTICE '  - Shown 5+x: -15 points';
  RAISE NOTICE '  - Recent (<1hr): extra -10 points';
  RAISE NOTICE '  - Same day (<24hr): extra -2 points';
  RAISE NOTICE '';
  RAISE NOTICE 'Impressions reset after 7 days of not being shown';
END $$;
