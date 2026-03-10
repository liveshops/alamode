-- =====================================================
-- Migration: Unified Brand Notification System
--
-- Removes the duplicate real-time trigger and keeps only
-- the batched tracking system. Rewrites the notification
-- sender with new copy format and 3-per-user cap.
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. DROP the real-time notification trigger (source of duplicates)
DROP TRIGGER IF EXISTS on_brand_new_product_throttled ON products;
DROP TRIGGER IF EXISTS on_brand_new_product ON products;

-- 2. KEEP the tracking trigger (just counts products, no notifications)
-- Ensure it exists
DROP TRIGGER IF EXISTS on_track_brand_new_product ON products;
CREATE TRIGGER on_track_brand_new_product
  AFTER INSERT ON products
  FOR EACH ROW
  WHEN (NEW.is_available = true)
  EXECUTE FUNCTION track_brand_new_product();

-- 3. Rewrite the notification sender with new format + 3 cap per user
CREATE OR REPLACE FUNCTION send_end_of_day_brand_notifications()
RETURNS INTEGER AS $$
DECLARE
  brand_record RECORD;
  follower_record RECORD;
  notification_title TEXT;
  notification_body TEXT;
  first_product_name TEXT;
  notifications_sent INTEGER := 0;
  user_notification_counts JSONB := '{}'::JSONB;
  user_count INTEGER;
  MAX_NOTIFICATIONS_PER_USER CONSTANT INTEGER := 3;
BEGIN
  -- Find brands that added products today but haven't sent notifications yet
  -- Order by product_count DESC so the most active brands get priority
  FOR brand_record IN
    SELECT 
      dba.brand_id,
      dba.product_count,
      dba.first_product_id,
      dba.latest_product_id,
      b.name as brand_name,
      b.slug as brand_slug
    FROM daily_brand_product_additions dba
    JOIN brands b ON b.id = dba.brand_id
    WHERE dba.notification_date = CURRENT_DATE
      AND dba.notification_sent = FALSE
      AND dba.product_count > 0
    ORDER BY dba.product_count DESC
  LOOP
    -- Get the name of the first product added today for this brand
    SELECT p.name INTO first_product_name
    FROM products p
    WHERE p.id = brand_record.first_product_id;

    -- Build notification copy
    notification_title := 'New from ' || brand_record.brand_name || ' ✨';
    
    IF brand_record.product_count = 1 THEN
      notification_body := 'Check out ' || COALESCE(first_product_name, 'their latest arrival') || '!';
    ELSE
      notification_body := 'Check out ' || COALESCE(first_product_name, 'their latest')
        || ' plus ' || (brand_record.product_count - 1) || ' more items!!';
    END IF;

    -- Send to followers (with per-user cap)
    FOR follower_record IN
      SELECT user_id FROM user_follows_brands WHERE brand_id = brand_record.brand_id
    LOOP
      -- Check if this user has hit the cap
      user_count := COALESCE((user_notification_counts->>follower_record.user_id::TEXT)::INTEGER, 0);
      
      IF user_count >= MAX_NOTIFICATIONS_PER_USER THEN
        CONTINUE; -- Skip this user, they've had enough notifications this sync
      END IF;

      PERFORM send_push_notification(
        follower_record.user_id,
        'brand_products',
        notification_title,
        notification_body,
        jsonb_build_object(
          'screen', 'brand',
          'brandSlug', brand_record.brand_slug,
          'productCount', brand_record.product_count
        )
      );

      -- Increment this user's notification count
      user_notification_counts := jsonb_set(
        user_notification_counts,
        ARRAY[follower_record.user_id::TEXT],
        to_jsonb(user_count + 1)
      );
    END LOOP;

    -- Mark as sent
    UPDATE daily_brand_product_additions
    SET 
      notification_sent = TRUE,
      notification_sent_at = NOW()
    WHERE brand_id = brand_record.brand_id 
      AND notification_date = CURRENT_DATE;

    notifications_sent := notifications_sent + 1;
  END LOOP;

  RETURN notifications_sent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

-- 4. Update the manual trigger function too
CREATE OR REPLACE FUNCTION trigger_brand_notifications_now(
  approach TEXT DEFAULT 'daily'
)
RETURNS TABLE (
  notifications_sent INTEGER,
  approach_used TEXT,
  execution_time INTERVAL
) AS $$
DECLARE
  start_time TIMESTAMP := NOW();
  result_count INTEGER := 0;
BEGIN
  SELECT send_end_of_day_brand_notifications() INTO result_count;

  RETURN QUERY SELECT 
    result_count,
    approach,
    NOW() - start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION send_end_of_day_brand_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_brand_notifications_now TO authenticated;
