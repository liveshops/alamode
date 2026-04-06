-- =====================================================
-- Migration: Optimized "New Today" Feed Function
-- 
-- Combines 4 sequential queries into 1 DB call:
--   1. Followed brand IDs lookup
--   2. Brand affinity scores (liked products per brand)
--   3. Products for day range (with pagination)
--   4. Like status check
--
-- Run this in Supabase SQL Editor
-- =====================================================

CREATE OR REPLACE FUNCTION get_new_today_feed(
  p_user_id UUID,
  p_day_offset INT DEFAULT 0,
  p_limit INT DEFAULT 40,
  p_offset INT DEFAULT 0,
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  price NUMERIC,
  sale_price NUMERIC,
  currency TEXT,
  image_url TEXT,
  additional_images TEXT[],
  product_url TEXT,
  like_count INT,
  created_at TIMESTAMPTZ,
  brand_id UUID,
  brand_name TEXT,
  brand_slug TEXT,
  brand_logo_url TEXT,
  is_liked BOOLEAN,
  brand_affinity INT
) AS $$
DECLARE
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
  v_tz TEXT;
BEGIN
  -- Validate timezone, fall back to UTC if invalid
  BEGIN
    PERFORM NOW() AT TIME ZONE p_timezone;
    v_tz := p_timezone;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  -- Calculate day range in the user's local timezone
  v_day_end := (date_trunc('day', NOW() AT TIME ZONE v_tz) - (p_day_offset * INTERVAL '1 day') + INTERVAL '1 day') AT TIME ZONE v_tz;
  v_day_start := v_day_end - INTERVAL '1 day';

  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.price,
    p.sale_price,
    p.currency,
    p.image_url,
    p.additional_images,
    p.product_url,
    p.like_count,
    p.created_at,
    b.id AS brand_id,
    b.name AS brand_name,
    b.slug AS brand_slug,
    b.logo_url AS brand_logo_url,
    EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = p_user_id
    ) AS is_liked,
    COALESCE(ba.affinity_count, 0)::INT AS brand_affinity
  FROM products p
  INNER JOIN brands b ON p.brand_id = b.id
  -- Filter to only followed brands
  INNER JOIN user_follows_brands ufb ON ufb.brand_id = b.id AND ufb.user_id = p_user_id
  -- Brand affinity: how many products user has liked from each brand
  LEFT JOIN (
    SELECT pr.brand_id, COUNT(*)::INT AS affinity_count
    FROM user_likes_products ulp2
    INNER JOIN products pr ON ulp2.product_id = pr.id
    WHERE ulp2.user_id = p_user_id
    GROUP BY pr.brand_id
  ) ba ON ba.brand_id = p.brand_id
  WHERE p.is_available = true
    AND p.created_at >= v_day_start
    AND p.created_at < v_day_end
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_new_today_feed TO authenticated;

-- Also create a lightweight function to check if user follows any brands
-- (used for empty state without fetching products)
CREATE OR REPLACE FUNCTION get_followed_brand_count(p_user_id UUID)
RETURNS INT AS $$
  SELECT COUNT(*)::INT FROM user_follows_brands WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_followed_brand_count TO authenticated;

-- Analyze tables for query planner
ANALYZE products;
ANALYZE brands;
ANALYZE user_follows_brands;
ANALYZE user_likes_products;
