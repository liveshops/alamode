-- =====================================================
-- Performance Optimization Migration
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. FIX RLS POLICIES - Address Performance Warnings
-- =====================================================

-- Drop existing policies that have issues
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can manage own brand follows" ON user_follows_brands;
DROP POLICY IF EXISTS "Users can see all brand follows" ON user_follows_brands;
DROP POLICY IF EXISTS "Users can manage own user follows" ON user_follows_users;
DROP POLICY IF EXISTS "Users can see all user follows" ON user_follows_users;
DROP POLICY IF EXISTS "Users can manage own product likes" ON user_likes_products;
DROP POLICY IF EXISTS "Users can see all product likes" ON user_likes_products;

-- PROFILES: Optimize auth.uid() evaluation
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id);

-- USER_FOLLOWS_BRANDS: Consolidate policies and optimize auth
CREATE POLICY "Brand follows select" ON user_follows_brands
  FOR SELECT USING (true);

CREATE POLICY "Brand follows modify" ON user_follows_brands
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Brand follows delete" ON user_follows_brands
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- USER_FOLLOWS_USERS: Consolidate policies and optimize auth
CREATE POLICY "User follows select" ON user_follows_users
  FOR SELECT USING (true);

CREATE POLICY "User follows modify" ON user_follows_users
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = follower_id);

CREATE POLICY "User follows delete" ON user_follows_users
  FOR DELETE USING ((SELECT auth.uid()) = follower_id);

-- USER_LIKES_PRODUCTS: Consolidate policies and optimize auth
CREATE POLICY "Product likes select" ON user_likes_products
  FOR SELECT USING (true);

CREATE POLICY "Product likes modify" ON user_likes_products
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Product likes delete" ON user_likes_products
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- =====================================================
-- 2. ADD CRITICAL MISSING INDEXES
-- =====================================================

-- Enable pg_trgm extension for better text search (MUST BE FIRST!)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Products table - Critical performance indexes
CREATE INDEX IF NOT EXISTS idx_products_is_available ON products(is_available) 
  WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_products_brand_available ON products(brand_id, is_available, created_at DESC)
  WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_products_available_like_count ON products(like_count DESC, created_at DESC)
  WHERE is_available = true;

-- User likes products - for checking if user liked a product
CREATE INDEX IF NOT EXISTS idx_user_likes_user_product ON user_likes_products(user_id, product_id);

-- Composite index for product feed queries
CREATE INDEX IF NOT EXISTS idx_products_brand_created ON products(brand_id, created_at DESC)
  WHERE is_available = true;

-- Index for search queries (requires pg_trgm extension above)
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_brands_name_trgm ON brands USING gin(name gin_trgm_ops);

-- =====================================================
-- 3. CREATE OPTIMIZED DATABASE FUNCTIONS
-- =====================================================

-- Function to get user feed with pagination
CREATE OR REPLACE FUNCTION get_user_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  brand_id UUID,
  external_id TEXT,
  name TEXT,
  description TEXT,
  price NUMERIC,
  sale_price NUMERIC,
  currency TEXT,
  image_url TEXT,
  additional_images TEXT[],
  product_url TEXT,
  like_count INT,
  is_available BOOLEAN,
  created_at TIMESTAMPTZ,
  brand_name TEXT,
  brand_slug TEXT,
  brand_logo_url TEXT,
  is_liked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.brand_id,
    p.external_id,
    p.name,
    p.description,
    p.price,
    p.sale_price,
    p.currency,
    p.image_url,
    p.additional_images,
    p.product_url,
    p.like_count,
    p.is_available,
    p.created_at,
    b.name as brand_name,
    b.slug as brand_slug,
    b.logo_url as brand_logo_url,
    EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = p_user_id
    ) as is_liked
  FROM products p
  INNER JOIN brands b ON p.brand_id = b.id
  INNER JOIN user_follows_brands ufb ON ufb.brand_id = b.id
  WHERE ufb.user_id = p_user_id
    AND p.is_available = true
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get shop brands with limited products
CREATE OR REPLACE FUNCTION get_shop_brands(
  p_user_id UUID,
  p_products_per_brand INT DEFAULT 6
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
      SELECT JSONB_AGG(
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
      )
      FROM (
        SELECT * FROM products p2
        WHERE p2.brand_id = b.id AND p2.is_available = true
        ORDER BY p2.like_count DESC, p2.created_at DESC
        LIMIT p_products_per_brand
      ) p
    ) as products
  FROM brands b
  ORDER BY b.follower_count DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function for search - most liked products
CREATE OR REPLACE FUNCTION search_most_liked_products(
  p_user_id UUID,
  p_search_query TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  brand_id UUID,
  external_id TEXT,
  name TEXT,
  description TEXT,
  price NUMERIC,
  sale_price NUMERIC,
  currency TEXT,
  image_url TEXT,
  additional_images TEXT[],
  product_url TEXT,
  like_count INT,
  is_available BOOLEAN,
  created_at TIMESTAMPTZ,
  brand_name TEXT,
  brand_slug TEXT,
  brand_logo_url TEXT,
  is_liked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.brand_id,
    p.external_id,
    p.name,
    p.description,
    p.price,
    p.sale_price,
    p.currency,
    p.image_url,
    p.additional_images,
    p.product_url,
    p.like_count,
    p.is_available,
    p.created_at,
    b.name as brand_name,
    b.slug as brand_slug,
    b.logo_url as brand_logo_url,
    EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id AND ulp.user_id = p_user_id
    ) as is_liked
  FROM products p
  INNER JOIN brands b ON p.brand_id = b.id
  WHERE p.is_available = true
    AND (p_search_query IS NULL OR p.name ILIKE '%' || p_search_query || '%')
  ORDER BY p.like_count DESC, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function for getting liked products (favorites)
CREATE OR REPLACE FUNCTION get_user_liked_products(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  brand_id UUID,
  external_id TEXT,
  name TEXT,
  description TEXT,
  price NUMERIC,
  sale_price NUMERIC,
  currency TEXT,
  image_url TEXT,
  additional_images TEXT[],
  product_url TEXT,
  like_count INT,
  is_available BOOLEAN,
  created_at TIMESTAMPTZ,
  brand_name TEXT,
  brand_slug TEXT,
  brand_logo_url TEXT,
  liked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.brand_id,
    p.external_id,
    p.name,
    p.description,
    p.price,
    p.sale_price,
    p.currency,
    p.image_url,
    p.additional_images,
    p.product_url,
    p.like_count,
    p.is_available,
    p.created_at,
    b.name as brand_name,
    b.slug as brand_slug,
    b.logo_url as brand_logo_url,
    ulp.liked_at
  FROM user_likes_products ulp
  INNER JOIN products p ON ulp.product_id = p.id
  INNER JOIN brands b ON p.brand_id = b.id
  WHERE ulp.user_id = p_user_id
  ORDER BY ulp.liked_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- 4. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_feed TO authenticated;
GRANT EXECUTE ON FUNCTION get_shop_brands TO authenticated;
GRANT EXECUTE ON FUNCTION search_most_liked_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_liked_products TO authenticated;

-- Grant to anon as well for public access
GRANT EXECUTE ON FUNCTION get_shop_brands TO anon;
GRANT EXECUTE ON FUNCTION search_most_liked_products TO anon;

-- =====================================================
-- 5. ANALYZE TABLES FOR QUERY PLANNER
-- =====================================================

ANALYZE products;
ANALYZE brands;
ANALYZE user_likes_products;
ANALYZE user_follows_brands;
ANALYZE user_follows_users;
ANALYZE profiles;

-- =====================================================
-- DONE!
-- =====================================================

-- After running this, all your performance warnings should be resolved
-- and queries should be significantly faster.
