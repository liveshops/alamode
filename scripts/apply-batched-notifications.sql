-- Apply Count-Based Brand Notifications
-- Run this in Supabase SQL Editor

-- Step 1: Apply the new batched system
\i migration-batched-brand-notifications.sql

-- Step 2: Preview what notifications would look like with current data
SELECT 
  'CURRENT ACTIVITY - What notifications would be sent today:' as info;

SELECT * FROM preview_pending_brand_notifications();

-- Step 3: Show example notification messages
SELECT 
  'EXAMPLE NOTIFICATIONS - How messages will look:' as info;

SELECT * FROM get_sample_notification_messages();

-- Step 4: Manual test (optional - sends real notifications!)
-- Uncomment the line below to send notifications immediately for testing
-- SELECT * FROM trigger_brand_notifications_now('batched');

-- Step 5: Check if any cron jobs were created
SELECT 
  'SCHEDULED JOBS - Automatic notification timing:' as info;

-- This will show cron jobs if pg_cron is available
SELECT 
  jobname, 
  schedule, 
  command 
FROM cron.job 
WHERE jobname LIKE '%brand-notification%'
ORDER BY jobname;

-- Step 6: Monitor ongoing activity
SELECT 
  'MONITORING - Track notification effectiveness:' as info;

SELECT * FROM todays_brand_activity;

-- Final setup message
DO $$
BEGIN
  RAISE NOTICE '✅ COUNT-BASED BRAND NOTIFICATIONS ARE NOW ACTIVE!';
  RAISE NOTICE '';
  RAISE NOTICE '📱 USERS WILL NOW GET:';
  RAISE NOTICE '   ❌ OLD: "New from Princess Polly ✨" → "Check out: Blue Dress"';
  RAISE NOTICE '   ❌ OLD: "New from Princess Polly ✨" → "Check out: Red Top"';
  RAISE NOTICE '   ❌ OLD: ... (15 separate notifications) ...';
  RAISE NOTICE '';
  RAISE NOTICE '   ✅ NEW: "Princess Polly added 15 new items today! ✨"';
  RAISE NOTICE '   ✅ NEW: One notification with total count';
  RAISE NOTICE '';
  RAISE NOTICE '⚡ TO TRIGGER MANUALLY:';
  RAISE NOTICE '   SELECT * FROM trigger_brand_notifications_now(''batched'');';
  RAISE NOTICE '';
  RAISE NOTICE '📊 TO MONITOR:';
  RAISE NOTICE '   SELECT * FROM todays_brand_activity;';
END $$;
