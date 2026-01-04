-- Debug Notification System
-- Check if the new batched notification system is working

-- 1. Check if daily_brand_product_additions table exists and has data
SELECT 
  'daily_brand_product_additions table status' as check_type,
  COUNT(*) as total_records,
  COUNT(CASE WHEN notification_date = CURRENT_DATE THEN 1 END) as todays_records
FROM daily_brand_product_additions;

-- 2. Check today's brand activity
SELECT 
  'todays_brand_activity' as check_type,
  b.name as brand_name,
  dba.product_count,
  dba.notification_sent,
  dba.first_added_at,
  dba.last_added_at,
  dba.notification_sent_at
FROM daily_brand_product_additions dba
JOIN brands b ON b.id = dba.brand_id
WHERE dba.notification_date = CURRENT_DATE
ORDER BY dba.product_count DESC
LIMIT 10;

-- 3. Check if products were actually added today
SELECT 
  'products_added_today' as check_type,
  b.name as brand_name,
  COUNT(*) as products_added_today
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE p.created_at >= CURRENT_DATE
  AND p.is_available = true
GROUP BY b.id, b.name
ORDER BY COUNT(*) DESC
LIMIT 10;

-- 4. Check if the new trigger exists
SELECT 
  'triggers_check' as check_type,
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE '%track_brand%' OR trigger_name LIKE '%brand_new_product%'
ORDER BY trigger_name;

-- 5. Check if notification functions exist
SELECT 
  'functions_check' as check_type,
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name LIKE '%brand_notification%' OR routine_name LIKE '%batched%'
ORDER BY routine_name;

-- 6. Test if we can manually trigger notifications (preview only - won't send)
SELECT 
  'manual_trigger_preview' as check_type,
  brand_name,
  product_count,
  follower_count,
  hours_since_first_product,
  notification_title
FROM preview_pending_brand_notifications()
LIMIT 5;
