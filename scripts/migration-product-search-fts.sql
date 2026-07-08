-- ============================================================
-- Product search: weighted full-text search + relevance-ranked RPC
-- Date: July 8, 2026
--
-- Problem being fixed: search used ILIKE '%term%' across name, description,
-- and category with no relevance ranking, ordered by like_count or created_at.
-- Products that merely MENTIONED the term in their description ("pairs great
-- with jeans") outranked actual jeans.
--
-- Solution:
--   1. Generated tsvector column with field weights:
--      name = A (highest), category = B, description = C (lowest)
--   2. GIN index for fast matching
--   3. search_products() RPC:
--      - sort='relevance' (For You): rank by weighted relevance, then likes.
--        Description-only matches allowed but ranked far below name matches.
--      - sort='newest' / 'most_liked': only NAME or CATEGORY matches qualify
--        (description-only mentions are excluded entirely), then date/likes.
--      - is_liked included (removes the client's follow-up likes query)
--      - English stemming handles plurals natively (jeans -> jean)
--
-- Note: adding the generated column rewrites the products table (~103k rows).
-- Expect this migration to take a minute or two.
-- ============================================================

-- 1. Weighted search vector (generated, always in sync with the row)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(taxonomy_category_name, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
) STORED;

-- 2. GIN index for fast @@ matching
CREATE INDEX IF NOT EXISTS idx_products_search_vector
ON products USING gin(search_vector);

-- 3. Relevance-ranked search RPC
DROP FUNCTION IF EXISTS search_products(TEXT, UUID, TEXT, UUID[], TIMESTAMPTZ, INT, INT);

CREATE OR REPLACE FUNCTION search_products(
  p_query TEXT,
  p_user_id UUID DEFAULT NULL,
  p_sort TEXT DEFAULT 'relevance',       -- 'relevance' | 'newest' | 'most_liked'
  p_brand_ids UUID[] DEFAULT NULL,       -- optional: restrict to followed brands
  p_since TIMESTAMPTZ DEFAULT NULL,      -- optional: time window (most_liked)
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  price DECIMAL,
  sale_price DECIMAL,
  image_url TEXT,
  additional_images TEXT[],
  product_url TEXT,
  like_count INTEGER,
  taxonomy_category_name TEXT,
  created_at TIMESTAMPTZ,
  brand_id UUID,
  brand_name TEXT,
  brand_slug TEXT,
  is_liked BOOLEAN,
  relevance REAL
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  q tsquery := websearch_to_tsquery('english', p_query);
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
    p.like_count,
    p.taxonomy_category_name,
    p.created_at,
    b.id,
    b.name,
    b.slug,
    (p_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_likes_products ul
      WHERE ul.user_id = p_user_id AND ul.product_id = p.id
    )) AS is_liked,
    ts_rank(p.search_vector, q) AS relevance
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  WHERE p.is_available = true
    AND p.search_vector @@ q
    AND (p_brand_ids IS NULL OR p.brand_id = ANY(p_brand_ids))
    AND (p_since IS NULL OR p.created_at >= p_since)
    -- For newest/most_liked, the term must appear in the NAME or CATEGORY.
    -- Description-only mentions ("pairs great with jeans") never qualify.
    AND (
      p_sort = 'relevance'
      OR to_tsvector('english', coalesce(p.name, '') || ' ' || coalesce(p.taxonomy_category_name, '')) @@ q
    )
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN EXTRACT(EPOCH FROM p.created_at) END DESC NULLS LAST,
    CASE WHEN p_sort = 'most_liked' THEN p.like_count END DESC NULLS LAST,
    ts_rank(p.search_vector, q) DESC,
    p.like_count DESC,
    p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_products(TEXT, UUID, TEXT, UUID[], TIMESTAMPTZ, INT, INT)
TO authenticated, anon;

-- Quick sanity checks (run manually if you like):
-- SELECT name, taxonomy_category_name, relevance
--   FROM search_products('jeans', NULL, 'relevance', NULL, NULL, 10, 0);
-- SELECT name, created_at
--   FROM search_products('jeans', NULL, 'newest', NULL, NULL, 10, 0);

DO $$
BEGIN
  RAISE NOTICE 'Product FTS search applied: weighted search_vector + search_products() RPC';
END $$;
