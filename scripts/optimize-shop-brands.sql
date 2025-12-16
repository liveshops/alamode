-- Optimize get_shop_brands with pagination
-- Run this in Supabase SQL Editor

-- Drop the old function first (it has different argument signature)
DROP FUNCTION IF EXISTS get_shop_brands(UUID, INT);

CREATE OR REPLACE FUNCTION get_shop_brands(
  p_user_id UUID,
  p_products_per_brand INT DEFAULT 6,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  logo_url TEXT,
  follower_count INT,
  is_following BOOLEAN,
  products JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.slug,
    b.logo_url,
    b.follower_count,
    EXISTS(
      SELECT 1 FROM user_follows_brands ufb 
      WHERE ufb.brand_id = b.id AND ufb.user_id = p_user_id
    ) as is_following,
    (
      SELECT COALESCE(JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', p.id,
          'name', p.name,
          'price', p.price,
          'sale_price', p.sale_price,
          'currency', p.currency,
          'image_url', p.image_url,
          'product_url', p.product_url,
          'like_count', p.like_count,
          'is_liked', EXISTS(
            SELECT 1 FROM user_likes_products ulp 
            WHERE ulp.product_id = p.id AND ulp.user_id = p_user_id
          ),
          'brand', JSONB_BUILD_OBJECT(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'logo_url', b.logo_url
          )
        ) ORDER BY p.like_count DESC, p.created_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT * FROM products p2
        WHERE p2.brand_id = b.id AND p2.is_available = true
        ORDER BY p2.like_count DESC, p2.created_at DESC
        LIMIT p_products_per_brand
      ) p
    ) as products
  FROM brands b
  ORDER BY b.follower_count DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_shop_brands TO authenticated;
GRANT EXECUTE ON FUNCTION get_shop_brands TO anon;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'get_shop_brands updated with pagination support (p_limit, p_offset)';
END $$;
