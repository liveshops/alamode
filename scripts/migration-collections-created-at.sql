-- Migration: Add created_at and like_count to collection preview products
-- Date: December 29, 2025
-- Purpose: Return product created_at for recency badge and like_count for display

CREATE OR REPLACE FUNCTION get_user_collections(
  p_user_id UUID,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  cover_image_url TEXT,
  is_public BOOLEAN,
  product_count INTEGER,
  created_at TIMESTAMPTZ,
  preview_products JSON
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.description,
    c.cover_image_url,
    c.is_public,
    c.product_count,
    c.created_at,
    (
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'image_url', p.image_url,
          'price', p.price,
          'sale_price', p.sale_price,
          'brand_name', b.name,
          'brand_slug', b.slug,
          'created_at', p.created_at,
          'like_count', p.like_count
        )
        ORDER BY cp.position
      )
      FROM collection_products cp
      JOIN products p ON p.id = cp.product_id
      JOIN brands b ON b.id = p.brand_id
      WHERE cp.collection_id = c.id
      LIMIT 10
    ) as preview_products
  FROM collections c
  WHERE c.user_id = p_user_id
    AND (c.is_public = true OR c.user_id = p_viewer_id)
  ORDER BY c.position, c.created_at DESC;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Added created_at and like_count to collection preview products';
END $$;
