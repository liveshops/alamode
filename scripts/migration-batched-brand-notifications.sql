-- Migration: Batched Brand Notifications with Product Counts
-- Sends consolidated notifications like "Princess Polly added 15 new items today!"

-- 1. Create table to track daily brand product additions
CREATE TABLE IF NOT EXISTS daily_brand_product_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  notification_date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_count INTEGER DEFAULT 0,
  first_product_id UUID REFERENCES products(id),
  latest_product_id UUID REFERENCES products(id),
  first_added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per brand per date
  UNIQUE(brand_id, notification_date)
);

-- 2. Add RLS policies
ALTER TABLE daily_brand_product_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand product additions are viewable by all authenticated users"
ON daily_brand_product_additions
FOR SELECT
TO authenticated
USING (true);

-- 3. Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_daily_brand_additions_lookup 
ON daily_brand_product_additions(brand_id, notification_date);

CREATE INDEX IF NOT EXISTS idx_daily_brand_additions_pending 
ON daily_brand_product_additions(notification_sent, notification_date)
WHERE notification_sent = false;

-- 4. Updated trigger function - just tracks products, doesn't send notifications immediately
CREATE OR REPLACE FUNCTION track_brand_new_product()
RETURNS TRIGGER AS $$
BEGIN
  -- Track this product addition (no immediate notification)
  INSERT INTO daily_brand_product_additions 
    (brand_id, notification_date, product_count, first_product_id, latest_product_id, first_added_at, last_added_at)
  VALUES 
    (NEW.brand_id, CURRENT_DATE, 1, NEW.id, NEW.id, NOW(), NOW())
  ON CONFLICT (brand_id, notification_date) 
  DO UPDATE SET 
    product_count = daily_brand_product_additions.product_count + 1,
    latest_product_id = NEW.id,
    last_added_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Replace the trigger with the tracking version
DROP TRIGGER IF EXISTS on_brand_new_product_throttled ON products;
DROP TRIGGER IF EXISTS on_brand_new_product ON products;
CREATE TRIGGER on_track_brand_new_product
  AFTER INSERT ON products
  FOR EACH ROW
  WHEN (NEW.is_available = true)
  EXECUTE FUNCTION track_brand_new_product();

-- 6. Function to send batched brand notifications
CREATE OR REPLACE FUNCTION send_batched_brand_notifications(
  min_hours_after_first_product INTEGER DEFAULT 2
)
RETURNS INTEGER AS $$
DECLARE
  brand_record RECORD;
  follower_record RECORD;
  notification_title TEXT;
  notification_body TEXT;
  notifications_sent INTEGER := 0;
BEGIN
  -- Find brands that have added products and are ready for notification
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
      AND dba.first_added_at <= NOW() - INTERVAL '1 hour' * min_hours_after_first_product
  LOOP
    -- Create notification message based on count
    IF brand_record.product_count = 1 THEN
      notification_title := 'New from ' || brand_record.brand_name || ' ✨';
      notification_body := 'Check out their latest arrival!';
    ELSE
      notification_title := brand_record.brand_name || ' added ' || brand_record.product_count || ' new items today! ✨';
      notification_body := 'Check out their latest arrivals';
    END IF;

    -- Send notification to all followers of this brand
    FOR follower_record IN
      SELECT user_id FROM user_follows_brands WHERE brand_id = brand_record.brand_id
    LOOP
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
    END LOOP;

    -- Mark as notification sent
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to send end-of-day summary notifications (alternative approach)
CREATE OR REPLACE FUNCTION send_end_of_day_brand_notifications()
RETURNS INTEGER AS $$
DECLARE
  brand_record RECORD;
  follower_record RECORD;
  notification_title TEXT;
  notification_body TEXT;
  notifications_sent INTEGER := 0;
BEGIN
  -- Find brands that added products today but haven't sent notifications yet
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
  LOOP
    -- Create notification message
    IF brand_record.product_count = 1 THEN
      notification_title := 'New from ' || brand_record.brand_name || ' ✨';
      notification_body := 'Check out their latest arrival!';
    ELSE
      notification_title := brand_record.brand_name || ' added ' || brand_record.product_count || ' new items today! ✨';
      notification_body := 'Browse their ' || brand_record.product_count || ' new arrivals';
    END IF;

    -- Send to followers
    FOR follower_record IN
      SELECT user_id FROM user_follows_brands WHERE brand_id = brand_record.brand_id
    LOOP
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. View to see today's brand activity (for monitoring)
CREATE OR REPLACE VIEW todays_brand_activity AS
SELECT 
  b.name as brand_name,
  b.slug as brand_slug,
  dba.product_count,
  dba.notification_sent,
  dba.first_added_at,
  dba.last_added_at,
  dba.notification_sent_at,
  COUNT(ufb.user_id) as follower_count
FROM daily_brand_product_additions dba
JOIN brands b ON b.id = dba.brand_id
LEFT JOIN user_follows_brands ufb ON ufb.brand_id = dba.brand_id
WHERE dba.notification_date = CURRENT_DATE
GROUP BY b.id, b.name, b.slug, dba.product_count, dba.notification_sent, 
         dba.first_added_at, dba.last_added_at, dba.notification_sent_at
ORDER BY dba.product_count DESC;

-- 9. Cleanup function for old records
CREATE OR REPLACE FUNCTION cleanup_old_brand_additions()
RETURNS void AS $$
BEGIN
  -- Delete records older than 30 days
  DELETE FROM daily_brand_product_additions
  WHERE notification_date < CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Drop old throttle table if it exists (from previous approach)
DROP TABLE IF EXISTS user_brand_notification_throttle CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Batched brand notifications system created!';
  RAISE NOTICE '';
  RAISE NOTICE 'APPROACH: Count-based consolidated notifications';
  RAISE NOTICE 'EXAMPLES:';
  RAISE NOTICE '  • "Princess Polly added 15 new items today! ✨"';
  RAISE NOTICE '  • "ZARA added 8 new items today! ✨"';
  RAISE NOTICE '  • "New from Bohme ✨" (for single items)';
  RAISE NOTICE '';
  RAISE NOTICE 'TO SEND NOTIFICATIONS:';
  RAISE NOTICE '  • Delayed: SELECT send_batched_brand_notifications(2); -- 2hrs after first product';
  RAISE NOTICE '  • End of day: SELECT send_end_of_day_brand_notifications();';
  RAISE NOTICE '';
  RAISE NOTICE 'MONITORING:';
  RAISE NOTICE '  • SELECT * FROM todays_brand_activity;';
  RAISE NOTICE '==============================================';
END $$;
