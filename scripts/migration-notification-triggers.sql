-- Migration: Notification Triggers
-- Run this AFTER migration-notifications.sql and deploying the Edge Function

-- Enable the pg_net extension for HTTP requests (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Function to send notification via Edge Function
-- IMPORTANT: Replace YOUR_PROJECT_URL and YOUR_SERVICE_ROLE_KEY below with your actual values
CREATE OR REPLACE FUNCTION send_push_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
BEGIN
  -- REPLACE THESE WITH YOUR ACTUAL VALUES FROM SUPABASE DASHBOARD > SETTINGS > API
  edge_function_url := 'https://YOUR_PROJECT_URL.supabase.co/functions/v1/send-notification';
  service_role_key := 'YOUR_SERVICE_ROLE_KEY';

  -- Make async HTTP request to Edge Function
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'type', p_type,
      'title', p_title,
      'body', p_body,
      'data', p_data
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger function for new follower notifications
CREATE OR REPLACE FUNCTION notify_new_follower()
RETURNS TRIGGER AS $$
DECLARE
  follower_name TEXT;
  follower_username TEXT;
BEGIN
  -- Get the follower's display name
  SELECT display_name, username INTO follower_name, follower_username
  FROM profiles
  WHERE id = NEW.follower_id;

  -- Use username if display_name is null
  IF follower_name IS NULL OR follower_name = '' THEN
    follower_name := COALESCE(follower_username, 'Someone');
  END IF;

  -- Send notification to the user being followed
  PERFORM send_push_notification(
    NEW.following_id,  -- The user receiving the notification
    'new_followers',   -- Matches preference column name
    'New Follower! 🎉',
    follower_name || ' started following you',
    jsonb_build_object(
      'screen', 'user',
      'userId', NEW.follower_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger on user_follows_users
DROP TRIGGER IF EXISTS on_new_follower ON user_follows_users;
CREATE TRIGGER on_new_follower
  AFTER INSERT ON user_follows_users
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_follower();

-- 4. Trigger function for brand new products notification
CREATE OR REPLACE FUNCTION notify_brand_new_product()
RETURNS TRIGGER AS $$
DECLARE
  brand_name_val TEXT;
  follower_record RECORD;
BEGIN
  -- Get the brand name
  SELECT name INTO brand_name_val
  FROM brands
  WHERE id = NEW.brand_id;

  -- Notify all users who follow this brand
  FOR follower_record IN
    SELECT user_id FROM user_follows_brands WHERE brand_id = NEW.brand_id
  LOOP
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
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger on products for new product notifications
-- NOTE: Be careful with this - could send many notifications!
-- Consider batching or throttling in production
DROP TRIGGER IF EXISTS on_brand_new_product ON products;
CREATE TRIGGER on_brand_new_product
  AFTER INSERT ON products
  FOR EACH ROW
  WHEN (NEW.is_available = true)
  EXECUTE FUNCTION notify_brand_new_product();

-- 6. Trigger function for product like milestones
CREATE OR REPLACE FUNCTION notify_product_like_milestone()
RETURNS TRIGGER AS $$
DECLARE
  product_name TEXT;
  product_owner_id UUID;
  old_count INTEGER;
  new_count INTEGER;
  milestone INTEGER;
BEGIN
  old_count := COALESCE(OLD.like_count, 0);
  new_count := COALESCE(NEW.like_count, 0);

  -- Only notify on increases
  IF new_count <= old_count THEN
    RETURN NEW;
  END IF;

  -- Check for milestones: 5, 10, 25, 50, 100, 250, 500, 1000
  milestone := CASE
    WHEN old_count < 5 AND new_count >= 5 THEN 5
    WHEN old_count < 10 AND new_count >= 10 THEN 10
    WHEN old_count < 25 AND new_count >= 25 THEN 25
    WHEN old_count < 50 AND new_count >= 50 THEN 50
    WHEN old_count < 100 AND new_count >= 100 THEN 100
    WHEN old_count < 250 AND new_count >= 250 THEN 250
    WHEN old_count < 500 AND new_count >= 500 THEN 500
    WHEN old_count < 1000 AND new_count >= 1000 THEN 1000
    ELSE NULL
  END;

  IF milestone IS NOT NULL THEN
    -- Get product name
    product_name := NEW.name;

    -- Notify all users who have liked this product
    -- (they might want to know a product they liked is popular)
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT 
      ulp.user_id,
      'product_likes',
      'Trending! 🔥',
      COALESCE(product_name, 'A product you liked') || ' just hit ' || milestone || ' likes!',
      jsonb_build_object('screen', 'product', 'productId', NEW.id)
    FROM user_likes_products ulp
    WHERE ulp.product_id = NEW.id;
    
    -- Note: This only saves to DB, actual push would need separate handling
    -- to avoid sending too many push notifications at once
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create trigger on products for like milestones
DROP TRIGGER IF EXISTS on_product_like_milestone ON products;
CREATE TRIGGER on_product_like_milestone
  AFTER UPDATE OF like_count ON products
  FOR EACH ROW
  EXECUTE FUNCTION notify_product_like_milestone();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Notification triggers created successfully!';
END $$;
