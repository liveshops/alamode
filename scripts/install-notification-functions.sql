-- Install Missing Notification Functions
-- Run this to enable manual triggering of batched notifications

-- 1. Function to send batched brand notifications
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

-- 2. Manual trigger function
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
  IF approach = 'daily' THEN
    -- Send all pending notifications (end of day summary)
    SELECT send_end_of_day_brand_notifications() INTO result_count;
  ELSE
    RAISE EXCEPTION 'Invalid approach. Use "daily"';
  END IF;

  RETURN QUERY SELECT 
    result_count,
    approach,
    NOW() - start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Preview function to see what would be sent
CREATE OR REPLACE FUNCTION preview_pending_brand_notifications()
RETURNS TABLE (
  brand_name TEXT,
  brand_slug TEXT,
  product_count INTEGER,
  follower_count BIGINT,
  notification_title TEXT,
  notification_body TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.name as brand_name,
    b.slug as brand_slug,
    dba.product_count,
    COUNT(ufb.user_id) as follower_count,
    CASE 
      WHEN dba.product_count = 1 THEN 'New from ' || b.name || ' ✨'
      ELSE b.name || ' added ' || dba.product_count || ' new items today! ✨'
    END as notification_title,
    CASE 
      WHEN dba.product_count = 1 THEN 'Check out their latest arrival!'
      ELSE 'Browse their ' || dba.product_count || ' new arrivals'
    END as notification_body
  FROM daily_brand_product_additions dba
  JOIN brands b ON b.id = dba.brand_id
  LEFT JOIN user_follows_brands ufb ON ufb.brand_id = dba.brand_id
  WHERE dba.notification_date = CURRENT_DATE
    AND dba.notification_sent = FALSE
    AND dba.product_count > 0
  GROUP BY b.id, b.name, b.slug, dba.product_count
  ORDER BY dba.product_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ NOTIFICATION FUNCTIONS INSTALLED!';
  RAISE NOTICE '';
  RAISE NOTICE '📱 TO SEND ALL PENDING NOTIFICATIONS:';
  RAISE NOTICE '   SELECT * FROM trigger_brand_notifications_now(''daily'');';
  RAISE NOTICE '';
  RAISE NOTICE '👀 TO PREVIEW WHAT WILL BE SENT:';
  RAISE NOTICE '   SELECT * FROM preview_pending_brand_notifications();';
END $$;
