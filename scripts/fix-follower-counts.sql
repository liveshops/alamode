-- Fix Follower Count System
-- This script diagnoses and fixes follower count issues

-- ============================================================================
-- PART 1: CHECK IF TRIGGERS EXIST
-- ============================================================================

SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name IN (
  'trigger_update_brand_followers',
  'trigger_update_user_followers',
  'trigger_update_product_likes'
)
ORDER BY trigger_name;

-- ============================================================================
-- PART 2: RECREATE TRIGGER FUNCTIONS (IF MISSING OR BROKEN)
-- ============================================================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_update_brand_followers ON user_follows_brands;
DROP TRIGGER IF EXISTS trigger_update_user_followers ON user_follows_users;
DROP TRIGGER IF EXISTS trigger_update_product_likes ON user_likes_products;

-- Recreate brand follower count function
CREATE OR REPLACE FUNCTION update_brand_follower_count()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE brands 
    SET follower_count = follower_count + 1 
    WHERE id = NEW.brand_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE brands 
    SET follower_count = GREATEST(0, follower_count - 1) 
    WHERE id = OLD.brand_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate user follower count function
CREATE OR REPLACE FUNCTION update_user_follower_count()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment following_count for the follower
    UPDATE profiles 
    SET following_count = following_count + 1 
    WHERE id = NEW.follower_id;
    
    -- Increment follower_count for the user being followed
    UPDATE profiles 
    SET follower_count = follower_count + 1 
    WHERE id = NEW.following_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement following_count for the follower
    UPDATE profiles 
    SET following_count = GREATEST(0, following_count - 1) 
    WHERE id = OLD.follower_id;
    
    -- Decrement follower_count for the user being unfollowed
    UPDATE profiles 
    SET follower_count = GREATEST(0, follower_count - 1) 
    WHERE id = OLD.following_id;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate product like count function  
CREATE OR REPLACE FUNCTION update_product_like_count()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment product like_count
    UPDATE products 
    SET like_count = like_count + 1 
    WHERE id = NEW.product_id;
    
    -- Increment user liked_items_count
    UPDATE profiles 
    SET liked_items_count = liked_items_count + 1 
    WHERE id = NEW.user_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement product like_count
    UPDATE products 
    SET like_count = GREATEST(0, like_count - 1) 
    WHERE id = OLD.product_id;
    
    -- Decrement user liked_items_count
    UPDATE profiles 
    SET liked_items_count = GREATEST(0, liked_items_count - 1) 
    WHERE id = OLD.user_id;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: CREATE TRIGGERS
-- ============================================================================

CREATE TRIGGER trigger_update_brand_followers
AFTER INSERT OR DELETE ON user_follows_brands
FOR EACH ROW EXECUTE FUNCTION update_brand_follower_count();

CREATE TRIGGER trigger_update_user_followers
AFTER INSERT OR DELETE ON user_follows_users
FOR EACH ROW EXECUTE FUNCTION update_user_follower_count();

CREATE TRIGGER trigger_update_product_likes
AFTER INSERT OR DELETE ON user_likes_products
FOR EACH ROW EXECUTE FUNCTION update_product_like_count();

-- ============================================================================
-- PART 4: FIX EXISTING COUNTS (Sync with reality)
-- ============================================================================

-- Fix brand follower counts
UPDATE brands b
SET follower_count = (
  SELECT COUNT(*) 
  FROM user_follows_brands ufb 
  WHERE ufb.brand_id = b.id
);

-- Fix user follower counts
UPDATE profiles p
SET follower_count = (
  SELECT COUNT(*) 
  FROM user_follows_users ufu 
  WHERE ufu.following_id = p.id
);

-- Fix user following counts
UPDATE profiles p
SET following_count = (
  SELECT COUNT(*) 
  FROM user_follows_users ufu 
  WHERE ufu.follower_id = p.id
);

-- Fix product like counts
UPDATE products p
SET like_count = (
  SELECT COUNT(*) 
  FROM user_likes_products ulp 
  WHERE ulp.product_id = p.id
);

-- Fix user liked items counts
UPDATE profiles p
SET liked_items_count = (
  SELECT COUNT(*) 
  FROM user_likes_products ulp 
  WHERE ulp.user_id = p.id
);

-- ============================================================================
-- PART 5: VERIFY TRIGGERS ARE WORKING
-- ============================================================================

-- Show all triggers
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%update%'
ORDER BY trigger_name;

-- Show current counts
SELECT 
  'brands' as table_name,
  COUNT(*) as total_records,
  SUM(follower_count) as total_followers
FROM brands
UNION ALL
SELECT 
  'profiles' as table_name,
  COUNT(*) as total_records,
  SUM(follower_count) as total_followers
FROM profiles
UNION ALL
SELECT 
  'products' as table_name,
  COUNT(*) as total_records,
  SUM(like_count) as total_likes
FROM products;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Follower count triggers recreated';
  RAISE NOTICE '✅ All existing counts synced with reality';
  RAISE NOTICE '📝 Test by following/unfollowing brands in your app';
END $$;
