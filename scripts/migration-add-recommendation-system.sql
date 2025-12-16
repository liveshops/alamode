-- Migration: Add Recommendation System
-- Date: December 16, 2025
-- Purpose: Create tables and functions for personalized product recommendations

-- ============================================
-- 1. Create user_preferences table
-- ============================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  preferred_brands JSONB DEFAULT '{}'::jsonb,        -- {brand_id: score, ...}
  preferred_categories JSONB DEFAULT '{}'::jsonb,    -- {taxonomy_id: score, ...}
  price_range_min DECIMAL(10,2),
  price_range_max DECIMAL(10,2),
  avg_price DECIMAL(10,2),
  total_likes INTEGER DEFAULT 0,
  total_follows INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_updated ON user_preferences(updated_at);

COMMENT ON TABLE user_preferences IS 'Aggregated user preferences computed from behavior signals';
COMMENT ON COLUMN user_preferences.preferred_brands IS 'Brand affinity scores based on likes and follows';
COMMENT ON COLUMN user_preferences.preferred_categories IS 'Category affinity scores based on liked products';

-- ============================================
-- 2. Function to compute user preferences
-- ============================================

CREATE OR REPLACE FUNCTION compute_user_preferences(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  brand_prefs JSONB;
  category_prefs JSONB;
  min_price DECIMAL;
  max_price DECIMAL;
  avg_price_val DECIMAL;
  like_count INTEGER;
  follow_count INTEGER;
BEGIN
  -- Compute brand preferences from likes (weighted by recency)
  SELECT COALESCE(jsonb_object_agg(brand_id, score), '{}'::jsonb)
  INTO brand_prefs
  FROM (
    SELECT 
      p.brand_id::text as brand_id,
      SUM(
        CASE 
          WHEN ulp.liked_at > NOW() - INTERVAL '7 days' THEN 3
          WHEN ulp.liked_at > NOW() - INTERVAL '30 days' THEN 2
          ELSE 1
        END
      ) as score
    FROM user_likes_products ulp
    JOIN products p ON p.id = ulp.product_id
    WHERE ulp.user_id = target_user_id
    GROUP BY p.brand_id
  ) brand_scores;

  -- Add followed brands with bonus score
  SELECT COALESCE(
    brand_prefs || jsonb_object_agg(
      brand_id::text, 
      COALESCE((brand_prefs->>brand_id::text)::int, 0) + 5
    ),
    brand_prefs
  )
  INTO brand_prefs
  FROM user_follows_brands
  WHERE user_id = target_user_id;

  -- Compute category preferences from likes
  SELECT COALESCE(jsonb_object_agg(taxonomy_id, score), '{}'::jsonb)
  INTO category_prefs
  FROM (
    SELECT 
      p.taxonomy_id,
      SUM(
        CASE 
          WHEN ulp.liked_at > NOW() - INTERVAL '7 days' THEN 3
          WHEN ulp.liked_at > NOW() - INTERVAL '30 days' THEN 2
          ELSE 1
        END
      ) as score
    FROM user_likes_products ulp
    JOIN products p ON p.id = ulp.product_id
    WHERE ulp.user_id = target_user_id
      AND p.taxonomy_id IS NOT NULL
    GROUP BY p.taxonomy_id
  ) cat_scores;

  -- Compute price range from liked products
  SELECT 
    PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY p.price),
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY p.price),
    AVG(p.price)
  INTO min_price, max_price, avg_price_val
  FROM user_likes_products ulp
  JOIN products p ON p.id = ulp.product_id
  WHERE ulp.user_id = target_user_id;

  -- Count totals
  SELECT COUNT(*) INTO like_count FROM user_likes_products WHERE user_id = target_user_id;
  SELECT COUNT(*) INTO follow_count FROM user_follows_brands WHERE user_id = target_user_id;

  -- Upsert user preferences
  INSERT INTO user_preferences (
    user_id, 
    preferred_brands, 
    preferred_categories, 
    price_range_min, 
    price_range_max, 
    avg_price,
    total_likes,
    total_follows,
    updated_at
  )
  VALUES (
    target_user_id, 
    brand_prefs, 
    category_prefs, 
    min_price, 
    max_price, 
    avg_price_val,
    like_count,
    follow_count,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_brands = EXCLUDED.preferred_brands,
    preferred_categories = EXCLUDED.preferred_categories,
    price_range_min = EXCLUDED.price_range_min,
    price_range_max = EXCLUDED.price_range_max,
    avg_price = EXCLUDED.avg_price,
    total_likes = EXCLUDED.total_likes,
    total_follows = EXCLUDED.total_follows,
    updated_at = NOW();
END;
$$;

-- ============================================
-- 3. Main recommendation function
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
      
      -- BRAND AFFINITY (40% weight)
      CASE 
        WHEN has_preferences THEN
          COALESCE((user_prefs.preferred_brands->>p.brand_id::text)::numeric, 0) * 4.0
        ELSE 0
      END as brand_score,
      
      -- CATEGORY MATCH (35% weight)
      CASE 
        WHEN has_preferences AND p.taxonomy_id IS NOT NULL THEN
          COALESCE((user_prefs.preferred_categories->>p.taxonomy_id)::numeric, 0) * 3.5
        ELSE 0
      END as category_score,
      
      -- FRESHNESS + POPULARITY (20% weight)
      (
        -- Freshness component (10%)
        CASE 
          WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 10
          WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 8
          WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 6
          WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 4
          WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 2
          ELSE 0
        END
        +
        -- Popularity component (10%)
        LEAST(p.like_count, 10)
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
      
      -- Sale bonus (small boost for items on sale)
      CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 2 ELSE 0 END as sale_bonus
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.is_available = true
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.brand_score + sp.category_score + sp.freshness_popularity_score + sp.price_score + sp.sale_bonus) as total_score,
      CASE 
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.freshness_popularity_score > 8 THEN 'Trending now'
        WHEN sp.created_at > NOW() - INTERVAL '7 days' THEN 'New arrival'
        ELSE 'Popular pick'
      END as reason
    FROM scored_products sp
    WHERE sp.is_liked = false  -- Don't recommend already-liked items
  )
  SELECT 
    rp.id,
    rp.name,
    rp.price,
    rp.sale_price,
    rp.image_url,
    rp.product_url,
    rp.brand_id,
    rp.brand_name,
    rp.brand_slug,
    rp.taxonomy_category_name,
    rp.like_count,
    rp.is_liked,
    rp.total_score,
    rp.reason
  FROM ranked_products rp
  ORDER BY rp.total_score DESC, rp.created_at DESC
  LIMIT result_limit
  OFFSET offset_val;
END;
$$;

-- ============================================
-- 4. Similar products function
-- ============================================

CREATE OR REPLACE FUNCTION get_similar_products(
  source_product_id UUID,
  result_limit INTEGER DEFAULT 10
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
  source_product products%ROWTYPE;
  source_brand_id UUID;
  source_taxonomy TEXT;
  source_price DECIMAL;
BEGIN
  -- Get source product details
  SELECT * INTO source_product FROM products WHERE id = source_product_id;
  
  IF source_product.id IS NULL THEN
    RETURN;
  END IF;
  
  source_brand_id := source_product.brand_id;
  source_taxonomy := source_product.taxonomy_id;
  source_price := source_product.price;
  
  RETURN QUERY
  WITH scored AS (
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
      
      -- Same brand score
      CASE WHEN p.brand_id = source_brand_id THEN 30 ELSE 0 END as brand_match,
      
      -- Same category score
      CASE 
        WHEN p.taxonomy_id = source_taxonomy THEN 40
        WHEN p.taxonomy_id IS NOT NULL AND source_taxonomy IS NOT NULL 
             AND split_part(p.taxonomy_id, '-', 1) = split_part(source_taxonomy, '-', 1)
             AND split_part(p.taxonomy_id, '-', 2) = split_part(source_taxonomy, '-', 2) THEN 20
        ELSE 0
      END as category_match,
      
      -- Price similarity score
      CASE 
        WHEN source_price > 0 THEN
          GREATEST(0, 20 - (ABS(p.price - source_price) / source_price * 40))
        ELSE 10
      END as price_match,
      
      -- Popularity bonus
      LEAST(p.like_count, 10) as popularity_bonus
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.id != source_product_id
      AND p.is_available = true
  )
  SELECT 
    s.id,
    s.name,
    s.price,
    s.sale_price,
    s.image_url,
    s.product_url,
    s.brand_id,
    s.brand_name,
    s.brand_slug,
    s.taxonomy_category_name,
    s.like_count,
    (s.brand_match + s.category_match + s.price_match + s.popularity_bonus)::DECIMAL as score,
    CASE 
      WHEN s.brand_match > 0 AND s.category_match >= 40 THEN 'Same brand & style'
      WHEN s.category_match >= 40 THEN 'Similar style'
      WHEN s.brand_match > 0 THEN 'More from this brand'
      WHEN s.category_match > 0 THEN 'You might also like'
      ELSE 'Similar price range'
    END as reason
  FROM scored s
  WHERE (s.brand_match + s.category_match + s.price_match) > 10
  ORDER BY score DESC, s.like_count DESC
  LIMIT result_limit;
END;
$$;

-- ============================================
-- 5. Trigger to update preferences on activity
-- ============================================

CREATE OR REPLACE FUNCTION trigger_update_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark preferences as stale (will be recomputed on next recommendation request)
  -- We don't recompute immediately to avoid performance issues
  IF TG_OP = 'INSERT' THEN
    UPDATE user_preferences 
    SET updated_at = NOW() - INTERVAL '1 hour'  -- Mark as needing refresh
    WHERE user_id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_preferences 
    SET updated_at = NOW() - INTERVAL '1 hour'
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to likes
DROP TRIGGER IF EXISTS trigger_preferences_on_like ON user_likes_products;
CREATE TRIGGER trigger_preferences_on_like
AFTER INSERT OR DELETE ON user_likes_products
FOR EACH ROW EXECUTE FUNCTION trigger_update_user_preferences();

-- Apply trigger to brand follows
DROP TRIGGER IF EXISTS trigger_preferences_on_follow ON user_follows_brands;
CREATE TRIGGER trigger_preferences_on_follow
AFTER INSERT OR DELETE ON user_follows_brands
FOR EACH ROW EXECUTE FUNCTION trigger_update_user_preferences();

-- ============================================
-- 6. RLS Policies for user_preferences
-- ============================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own preferences
CREATE POLICY "Users can delete own preferences" ON user_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 7. Verification
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== Recommendation System Migration Complete ===';
  RAISE NOTICE 'Created: user_preferences table';
  RAISE NOTICE 'Created: compute_user_preferences() function';
  RAISE NOTICE 'Created: get_recommendations() function';
  RAISE NOTICE 'Created: get_similar_products() function';
  RAISE NOTICE 'Created: preference update triggers';
  RAISE NOTICE '';
  RAISE NOTICE 'Algorithm weights:';
  RAISE NOTICE '  - Brand affinity: 40%%';
  RAISE NOTICE '  - Category match: 35%%';
  RAISE NOTICE '  - Freshness + Popularity: 20%%';
  RAISE NOTICE '  - Price range: 5%%';
  RAISE NOTICE '';
  RAISE NOTICE 'Test with: SELECT * FROM get_recommendations(''<user-uuid>'');';
END $$;
