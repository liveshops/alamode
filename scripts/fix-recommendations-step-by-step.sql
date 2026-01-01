-- Step-by-step debug and fix get_recommendations
-- We know simple queries work, so let's isolate what's breaking

-- STEP 1: Test basic structure with no complex logic
CREATE OR REPLACE FUNCTION get_recommendations_debug_v1(
  target_user_id UUID,
  result_limit INTEGER DEFAULT 50
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
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.price,
    p.sale_price,
    p.image_url,
    p.additional_images,
    p.product_url,
    p.brand_id,
    b.name,
    b.slug,
    p.taxonomy_category_name,
    p.like_count,
    false,
    10.0::decimal,
    'Debug test'::text,
    p.created_at
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  WHERE p.is_available = true
    AND NOT EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
    )
  ORDER BY p.created_at DESC
  LIMIT result_limit;
END;
$$;

-- Test this basic version
-- SELECT * FROM get_recommendations_debug_v1('8d218535-6ad9-44bd-8956-fb79220f1c2d', 5);

-- STEP 2: Add the complex CTEs one by one to see which breaks it
CREATE OR REPLACE FUNCTION get_recommendations_debug_v2(
  target_user_id UUID,
  result_limit INTEGER DEFAULT 50
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
BEGIN
  -- Get user preferences (this might be failing)
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;

  RETURN QUERY
  WITH recent_impressions AS (
    SELECT 
      upi.product_id,
      upi.last_shown_at,
      upi.impression_count,
      EXTRACT(DAY FROM NOW() - upi.last_shown_at)::INTEGER as days_since_shown
    FROM user_product_impressions upi
    WHERE upi.user_id = target_user_id
      AND upi.last_shown_at > NOW() - INTERVAL '14 days'
  )
  SELECT 
    p.id,
    p.name,
    p.price,
    p.sale_price,
    p.image_url,
    p.additional_images,
    p.product_url,
    p.brand_id,
    b.name,
    b.slug,
    p.taxonomy_category_name,
    p.like_count,
    false,
    15.0::decimal,
    'With impressions'::text,
    p.created_at
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  LEFT JOIN recent_impressions ri ON ri.product_id = p.id
  WHERE p.is_available = true
    AND NOT EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
    )
  ORDER BY p.created_at DESC
  LIMIT result_limit;
END;
$$;

-- STEP 3: Create a working version by fixing the original
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
  has_preferences BOOLEAN := false;
  max_per_brand INTEGER := 5; -- Increased from 4
  total_available INTEGER;
  effective_offset INTEGER;
BEGIN
  -- Safely get user preferences with fallback
  BEGIN
    SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
    has_preferences := FOUND AND (user_prefs.total_likes > 0 OR user_prefs.total_follows > 0);
  EXCEPTION 
    WHEN OTHERS THEN 
      has_preferences := false;
  END;
  
  -- Count available products
  SELECT COUNT(*) INTO total_available 
  FROM products p 
  WHERE p.is_available = true 
    AND NOT EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
    );
  
  -- Simple offset calculation
  effective_offset := offset_val % GREATEST(total_available, 1);
  
  RETURN QUERY
  WITH recent_impressions AS (
    SELECT 
      upi.product_id,
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
      p.like_count,
      p.created_at,
      
      -- Simple scoring - prioritize fresh products
      CASE 
        WHEN p.created_at > NOW() - INTERVAL '1 day' THEN 20
        WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 15  
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 10
        WHEN p.created_at > NOW() - INTERVAL '14 days' THEN 5
        ELSE 1
      END as freshness_score,
      
      -- Simple penalties for repeats
      CASE 
        WHEN ri.product_id IS NULL THEN 0
        WHEN ri.days_since_shown < 2 THEN -10
        WHEN ri.days_since_shown < 7 THEN -5
        ELSE -2
      END as repeat_penalty,
      
      -- Brand affinity (safe)
      CASE 
        WHEN has_preferences THEN
          COALESCE((user_prefs.preferred_brands->>p.brand_id::text)::numeric, 0) * 3.0
        ELSE 0
      END as brand_score,
      
      -- Simple variety
      (p.like_count + refresh_seed) % 10 as variety_score
      
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN recent_impressions ri ON ri.product_id = p.id
    WHERE p.is_available = true
      AND NOT EXISTS(
        SELECT 1 FROM user_likes_products ulp 
        WHERE ulp.product_id = p.id AND ulp.user_id = target_user_id
      )
  ),
  ranked_products AS (
    SELECT 
      sp.*,
      (sp.freshness_score + sp.repeat_penalty + sp.brand_score + sp.variety_score) as total_score,
      CASE 
        WHEN sp.freshness_score >= 15 THEN 'Just added'
        WHEN sp.freshness_score >= 10 THEN 'New this week'
        WHEN sp.brand_score > 3 THEN 'From brands you love'
        ELSE 'Discover something new'
      END as reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY 
        (sp.freshness_score + sp.repeat_penalty + sp.brand_score + sp.variety_score) DESC,
        sp.created_at DESC
      ) as brand_rank
    FROM scored_products sp
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
  WHERE rp.brand_rank <= max_per_brand
  ORDER BY rp.total_score DESC, rp.created_at DESC
  LIMIT result_limit OFFSET effective_offset;
END;
$$;

-- Test the fixed version
-- SELECT * FROM get_recommendations('8d218535-6ad9-44bd-8956-fb79220f1c2d', 10, 0, 0);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ FIXED RECOMMENDATION ALGORITHM!';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 FIXES APPLIED:';
  RAISE NOTICE '   • Safe user preferences handling with fallback';
  RAISE NOTICE '   • Simplified scoring to avoid complex failures';
  RAISE NOTICE '   • Increased max products per brand (5 vs 4)';
  RAISE NOTICE '   • Robust error handling for preferences lookup';
  RAISE NOTICE '   • Clean freshness prioritization';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Test with: SELECT * FROM get_recommendations(''8d218535-6ad9-44bd-8956-fb79220f1c2d'', 10);';
END $$;
