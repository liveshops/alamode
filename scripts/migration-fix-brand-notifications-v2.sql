-- Migration: Fix Brand Notifications with Daily Throttle + RLS Performance Fixes
-- 
-- This migration:
-- 1. Implements daily throttling (1 notification per brand per day per user)
-- 2. Fixes RLS performance issues by using (select auth.uid()) pattern
-- 3. Cleans up old triggers to prevent conflicts
--
-- Run this in Supabase SQL Editor

-- ============================================================================
-- PART 1: CLEANUP OLD TRIGGERS
-- ============================================================================

-- Drop ALL existing brand product notification triggers to start clean
DROP TRIGGER IF EXISTS on_brand_new_product ON products;
DROP TRIGGER IF EXISTS on_brand_new_product_throttled ON products;
DROP TRIGGER IF EXISTS on_track_brand_new_product ON products;

-- ============================================================================
-- PART 2: ENSURE THROTTLE TABLE EXISTS WITH PROPER STRUCTURE
-- ============================================================================

-- Create throttle table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_brand_notification_throttle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  notification_date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_count INTEGER DEFAULT 1,
  first_product_id UUID REFERENCES products(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, brand_id, notification_date)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_brand_notification_throttle_lookup 
ON user_brand_notification_throttle(user_id, brand_id, notification_date);

-- ============================================================================
-- PART 3: FIX RLS POLICIES (Performance Optimization)
-- ============================================================================

-- Enable RLS on throttle table
ALTER TABLE user_brand_notification_throttle ENABLE ROW LEVEL SECURITY;

-- Drop old policy if exists
DROP POLICY IF EXISTS "Users can only access their own notification throttle records" ON user_brand_notification_throttle;

-- Create new policy with (select auth.uid()) for performance
CREATE POLICY "Users can only access their own notification throttle records"
ON user_brand_notification_throttle
FOR ALL
USING ((select auth.uid()) = user_id);

-- ============================================================================
-- PART 4: FIX RLS ON OTHER NOTIFICATION-RELATED TABLES
-- ============================================================================

-- Fix push_tokens RLS policies
DROP POLICY IF EXISTS "Users can view their own push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Users can insert their own push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Users can update their own push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Users can delete their own push tokens" ON push_tokens;

CREATE POLICY "Users can view their own push tokens"
ON push_tokens FOR SELECT
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own push tokens"
ON push_tokens FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own push tokens"
ON push_tokens FOR UPDATE
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own push tokens"
ON push_tokens FOR DELETE
USING ((select auth.uid()) = user_id);

-- Fix notifications RLS policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
USING ((select auth.uid()) = user_id);

-- Fix notification_preferences RLS policies
DROP POLICY IF EXISTS "Users can view their own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can insert their own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update their own notification preferences" ON notification_preferences;

CREATE POLICY "Users can view their own notification preferences"
ON notification_preferences FOR SELECT
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own notification preferences"
ON notification_preferences FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own notification preferences"
ON notification_preferences FOR UPDATE
USING ((select auth.uid()) = user_id);

-- ============================================================================
-- PART 5: CREATE THROTTLED NOTIFICATION TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_brand_new_product_throttled()
RETURNS TRIGGER AS $$
DECLARE
  brand_name_val TEXT;
  follower_record RECORD;
  already_notified BOOLEAN;
BEGIN
  -- Get the brand name
  SELECT name INTO brand_name_val
  FROM brands
  WHERE id = NEW.brand_id;

  -- Notify all users who follow this brand (with daily throttling)
  FOR follower_record IN
    SELECT user_id FROM user_follows_brands WHERE brand_id = NEW.brand_id
  LOOP
    -- Check if we've already sent a notification today for this brand to this user
    SELECT EXISTS(
      SELECT 1 FROM user_brand_notification_throttle
      WHERE user_id = follower_record.user_id
        AND brand_id = NEW.brand_id
        AND notification_date = CURRENT_DATE
    ) INTO already_notified;

    IF NOT already_notified THEN
      -- First product today from this brand - send notification
      PERFORM send_push_notification(
        follower_record.user_id,
        'brand_products',
        'New from ' || COALESCE(brand_name_val, 'a brand you follow') || ' ✨',
        'Check out: ' || COALESCE(NEW.name, 'New product'),
        jsonb_build_object(
          'screen', 'product',
          'productId', NEW.id
        )
      );
      
      -- Record this notification to prevent more today
      INSERT INTO user_brand_notification_throttle 
        (user_id, brand_id, notification_date, product_count, first_product_id)
      VALUES 
        (follower_record.user_id, NEW.brand_id, CURRENT_DATE, 1, NEW.id);
        
    ELSE
      -- Already sent notification today - just increment count (no notification)
      UPDATE user_brand_notification_throttle
      SET product_count = product_count + 1
      WHERE user_id = follower_record.user_id
        AND brand_id = NEW.brand_id
        AND notification_date = CURRENT_DATE;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6: CREATE THE NEW TRIGGER
-- ============================================================================

CREATE TRIGGER on_brand_new_product_throttled
  AFTER INSERT ON products
  FOR EACH ROW
  WHEN (NEW.is_available = true)
  EXECUTE FUNCTION notify_brand_new_product_throttled();

-- ============================================================================
-- PART 7: CLEANUP FUNCTION FOR OLD THROTTLE RECORDS
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_notification_throttles()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_brand_notification_throttle
  WHERE notification_date < CURRENT_DATE - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 8: HELPER VIEW FOR MONITORING
-- ============================================================================

CREATE OR REPLACE VIEW notification_throttle_stats AS
SELECT 
  b.name as brand_name,
  t.notification_date,
  COUNT(DISTINCT t.user_id) as users_notified,
  SUM(t.product_count) as total_products_tracked,
  SUM(t.product_count) - COUNT(*) as notifications_saved
FROM user_brand_notification_throttle t
JOIN brands b ON b.id = t.brand_id
GROUP BY b.name, t.notification_date
ORDER BY t.notification_date DESC, total_products_tracked DESC;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ BRAND NOTIFICATION THROTTLING ACTIVATED!';
  RAISE NOTICE '';
  RAISE NOTICE '📱 HOW IT WORKS NOW:';
  RAISE NOTICE '   • User follows Brand X';
  RAISE NOTICE '   • Brand X adds Product 1 → User gets notification ✅';
  RAISE NOTICE '   • Brand X adds Product 2 → Tracked, no notification';
  RAISE NOTICE '   • Brand X adds Product 3 → Tracked, no notification';
  RAISE NOTICE '   • Next day resets → User can get 1 new notification';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 RLS PERFORMANCE FIXES APPLIED TO:';
  RAISE NOTICE '   • push_tokens (4 policies)';
  RAISE NOTICE '   • notifications (2 policies)';
  RAISE NOTICE '   • notification_preferences (3 policies)';
  RAISE NOTICE '   • user_brand_notification_throttle (1 policy)';
  RAISE NOTICE '';
  RAISE NOTICE '📊 TO MONITOR:';
  RAISE NOTICE '   SELECT * FROM notification_throttle_stats;';
  RAISE NOTICE '';
  RAISE NOTICE '🧹 TO CLEANUP OLD RECORDS:';
  RAISE NOTICE '   SELECT cleanup_old_notification_throttles();';
END $$;
