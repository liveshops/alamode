-- Setup Scheduled Brand Notifications with Product Counts
-- Creates a system to send consolidated count-based notifications

-- First, apply the batched notification system
\i migration-batched-brand-notifications.sql

-- Option 1: Create a scheduled function using pg_cron (if available)
-- This would run every 2 hours to send notifications for brands that added products

-- Check if pg_cron is available
DO $$
BEGIN
  -- Try to create a scheduled job (will fail gracefully if pg_cron not available)
  BEGIN
    -- Send batched notifications every 2 hours during business hours (9 AM to 9 PM)
    PERFORM cron.schedule(
      'send-brand-notifications-batched',
      '0 9,11,13,15,17,19,21 * * *',  -- Every 2 hours from 9am to 9pm
      'SELECT send_batched_brand_notifications(2);'  -- Wait 2 hours after first product
    );
    RAISE NOTICE 'Scheduled job created: Brand notifications every 2 hours (9am-9pm)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available - you''ll need to manually trigger notifications';
  END;
END $$;

-- Option 2: End-of-day summary (alternative approach)
-- Send all pending notifications at 8 PM daily
DO $$
BEGIN
  BEGIN
    PERFORM cron.schedule(
      'send-brand-notifications-daily',
      '0 20 * * *',  -- 8 PM daily
      'SELECT send_end_of_day_brand_notifications();'
    );
    RAISE NOTICE 'Scheduled job created: Daily brand summary at 8 PM';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available for daily summary job';
  END;
END $$;

-- Option 3: Manual trigger function for testing/backup
CREATE OR REPLACE FUNCTION trigger_brand_notifications_now(
  approach TEXT DEFAULT 'batched'  -- 'batched' or 'daily'
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
  IF approach = 'batched' THEN
    -- Send notifications for brands that added products 2+ hours ago
    SELECT send_batched_brand_notifications(2) INTO result_count;
  ELSIF approach = 'daily' THEN
    -- Send all pending notifications (end of day summary)
    SELECT send_end_of_day_brand_notifications() INTO result_count;
  ELSE
    RAISE EXCEPTION 'Invalid approach. Use "batched" or "daily"';
  END IF;

  RETURN QUERY SELECT 
    result_count,
    approach,
    NOW() - start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to preview what notifications would be sent
CREATE OR REPLACE FUNCTION preview_pending_brand_notifications()
RETURNS TABLE (
  brand_name TEXT,
  brand_slug TEXT,
  product_count INTEGER,
  follower_count BIGINT,
  hours_since_first_product NUMERIC,
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
    EXTRACT(EPOCH FROM (NOW() - dba.first_added_at)) / 3600 as hours_since_first_product,
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
  GROUP BY b.id, b.name, b.slug, dba.product_count, dba.first_added_at, dba.last_added_at
  ORDER BY dba.product_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example notification messages function
CREATE OR REPLACE FUNCTION get_sample_notification_messages()
RETURNS TABLE (
  scenario TEXT,
  notification_title TEXT,
  notification_body TEXT
) AS $$
BEGIN
  RETURN QUERY VALUES 
    ('Single product', 'New from Princess Polly ✨', 'Check out their latest arrival!'),
    ('Multiple products', 'Princess Polly added 15 new items today! ✨', 'Browse their 15 new arrivals'),
    ('High volume brand', 'ZARA added 23 new items today! ✨', 'Browse their 23 new arrivals'),
    ('Boutique brand', 'Bohme added 3 new items today! ✨', 'Browse their 3 new arrivals');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success and setup instructions
DO $$
BEGIN
  RAISE NOTICE '🎉 SCHEDULED BRAND NOTIFICATIONS SETUP COMPLETE!';
  RAISE NOTICE '';
  RAISE NOTICE '📱 NOTIFICATION EXAMPLES:';
  RAISE NOTICE '   • "Princess Polly added 15 new items today! ✨"';
  RAISE NOTICE '   • "ZARA added 23 new items today! ✨"';
  RAISE NOTICE '   • "New from Bohme ✨" (single items)';
  RAISE NOTICE '';
  RAISE NOTICE '⚡ MANUAL TRIGGERS:';
  RAISE NOTICE '   • Test now: SELECT * FROM trigger_brand_notifications_now(''batched'');';
  RAISE NOTICE '   • Preview: SELECT * FROM preview_pending_brand_notifications();';
  RAISE NOTICE '   • Daily: SELECT * FROM trigger_brand_notifications_now(''daily'');';
  RAISE NOTICE '';
  RAISE NOTICE '📊 MONITORING:';
  RAISE NOTICE '   • SELECT * FROM todays_brand_activity;';
  RAISE NOTICE '   • SELECT * FROM get_sample_notification_messages();';
  RAISE NOTICE '';
  RAISE NOTICE '🕐 SCHEDULED JOBS (if pg_cron available):';
  RAISE NOTICE '   • Every 2 hours (9am-9pm): Batched notifications';
  RAISE NOTICE '   • Daily at 8pm: End-of-day summary';
  RAISE NOTICE '';
  RAISE NOTICE '💡 HOW IT WORKS:';
  RAISE NOTICE '   1. Products added → Tracked in daily_brand_product_additions';
  RAISE NOTICE '   2. Scheduler runs → Counts products per brand';
  RAISE NOTICE '   3. Sends notification → "Brand added X new items today!"';
  RAISE NOTICE '   4. Users get consolidated info instead of spam';
END $$;
