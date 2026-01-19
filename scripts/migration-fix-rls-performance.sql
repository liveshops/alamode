-- Migration: Fix RLS Performance Issues
-- 
-- This migration addresses all Supabase Performance Advisor warnings:
-- 1. auth_rls_initplan - Wraps auth.uid() in (select auth.uid()) for performance
-- 2. multiple_permissive_policies - Consolidates overlapping policies
-- 3. duplicate_index - Removes duplicate index on products table
--
-- Run this in Supabase SQL Editor

-- ============================================================================
-- PART 1: FIX user_not_interested RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own not interested items" ON user_not_interested;
DROP POLICY IF EXISTS "Users can insert their own not interested items" ON user_not_interested;
DROP POLICY IF EXISTS "Users can delete their own not interested items" ON user_not_interested;

CREATE POLICY "Users can view their own not interested items"
ON user_not_interested FOR SELECT
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own not interested items"
ON user_not_interested FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own not interested items"
ON user_not_interested FOR DELETE
USING ((select auth.uid()) = user_id);

-- ============================================================================
-- PART 2: FIX user_product_impressions RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own impressions" ON user_product_impressions;
DROP POLICY IF EXISTS "Users can insert own impressions" ON user_product_impressions;
DROP POLICY IF EXISTS "Users can update own impressions" ON user_product_impressions;

CREATE POLICY "Users can view own impressions"
ON user_product_impressions FOR SELECT
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own impressions"
ON user_product_impressions FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own impressions"
ON user_product_impressions FOR UPDATE
USING ((select auth.uid()) = user_id);

-- ============================================================================
-- PART 3: FIX profiles RLS POLICIES
-- Also consolidates multiple INSERT policies into one
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert for service role" ON profiles;

-- Consolidated INSERT policy: allows user to insert own profile OR service role
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
WITH CHECK (
  (select auth.uid()) = id 
  OR 
  (select auth.role()) = 'service_role'
);

-- ============================================================================
-- PART 4: FIX collections RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view public collections" ON collections;
DROP POLICY IF EXISTS "Users can create own collections" ON collections;
DROP POLICY IF EXISTS "Users can update own collections" ON collections;
DROP POLICY IF EXISTS "Users can delete own collections" ON collections;

-- Users can view collections that are public OR their own
CREATE POLICY "Users can view public collections"
ON collections FOR SELECT
USING (
  is_public = true 
  OR 
  (select auth.uid()) = user_id
);

CREATE POLICY "Users can create own collections"
ON collections FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own collections"
ON collections FOR UPDATE
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own collections"
ON collections FOR DELETE
USING ((select auth.uid()) = user_id);

-- ============================================================================
-- PART 5: FIX collection_products RLS POLICIES
-- Also consolidates multiple SELECT policies into one
-- ============================================================================

DROP POLICY IF EXISTS "Users can view collection products" ON collection_products;
DROP POLICY IF EXISTS "Users can manage own collection products" ON collection_products;

-- Consolidated SELECT policy: can view if collection is public OR user owns it
CREATE POLICY "Users can view collection products"
ON collection_products FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM collections c 
    WHERE c.id = collection_id 
    AND (c.is_public = true OR c.user_id = (select auth.uid()))
  )
);

-- Separate policies for INSERT, UPDATE, DELETE (user must own collection)
CREATE POLICY "Users can insert own collection products"
ON collection_products FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM collections c 
    WHERE c.id = collection_id 
    AND c.user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can update own collection products"
ON collection_products FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM collections c 
    WHERE c.id = collection_id 
    AND c.user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can delete own collection products"
ON collection_products FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM collections c 
    WHERE c.id = collection_id 
    AND c.user_id = (select auth.uid())
  )
);

-- ============================================================================
-- PART 6: FIX user_preferences RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;

CREATE POLICY "Users can view own preferences"
ON user_preferences FOR SELECT
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own preferences"
ON user_preferences FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own preferences"
ON user_preferences FOR UPDATE
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own preferences"
ON user_preferences FOR DELETE
USING ((select auth.uid()) = user_id);

-- ============================================================================
-- PART 7: FIX DUPLICATE INDEX ON products TABLE
-- Keep the unique constraint index, drop the regular index
-- ============================================================================

-- Check which index to drop (the non-unique one)
DROP INDEX IF EXISTS idx_products_brand_external_id;

-- The unique constraint index (products_brand_external_unique) is kept
-- as it enforces data integrity

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Show updated policies count
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public';
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ RLS PERFORMANCE MIGRATION COMPLETE!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 FIXES APPLIED:';
  RAISE NOTICE '   • user_not_interested: 3 policies fixed';
  RAISE NOTICE '   • user_product_impressions: 3 policies fixed';
  RAISE NOTICE '   • profiles: 2 policies consolidated into 1';
  RAISE NOTICE '   • collections: 4 policies fixed';
  RAISE NOTICE '   • collection_products: 2 policies consolidated + 3 new';
  RAISE NOTICE '   • user_preferences: 4 policies fixed';
  RAISE NOTICE '   • products: duplicate index removed';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 PERFORMANCE IMPROVEMENTS:';
  RAISE NOTICE '   • auth.uid() now cached per query (not per row)';
  RAISE NOTICE '   • Reduced policy evaluation overhead';
  RAISE NOTICE '   • Removed duplicate index maintenance cost';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Total policies in public schema: %', policy_count;
END $$;
