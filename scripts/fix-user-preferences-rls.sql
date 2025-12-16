-- Fix RLS Policy for user_preferences table
-- Run this in Supabase SQL Editor

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Service role can manage preferences" ON user_preferences;

-- Create proper policies that allow users to manage their own preferences
CREATE POLICY "Users can view own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences" ON user_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- Also make compute_user_preferences SECURITY DEFINER so it can always write
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

-- Verify fix
DO $$
BEGIN
  RAISE NOTICE 'RLS policies updated for user_preferences table';
  RAISE NOTICE 'compute_user_preferences function updated with SECURITY DEFINER';
END $$;
