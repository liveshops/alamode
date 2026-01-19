-- Diagnose Notification Triggers
-- Run this in Supabase SQL Editor to see current state

-- 1. Check which triggers are active on products table
SELECT 
  '🔍 ACTIVE TRIGGERS ON PRODUCTS TABLE' as section;

SELECT 
  trigger_name,
  event_manipulation as event,
  action_timing as timing,
  action_statement as function_called
FROM information_schema.triggers
WHERE event_object_table = 'products'
  AND event_object_schema = 'public'
ORDER BY trigger_name;

-- 2. Check if throttle/batched tables exist and have data
SELECT 
  '🔍 NOTIFICATION TRACKING TABLES' as section;

SELECT 
  'user_brand_notification_throttle' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN notification_date = CURRENT_DATE THEN 1 END) as todays_records
FROM user_brand_notification_throttle
UNION ALL
SELECT 
  'daily_brand_product_additions' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN notification_date = CURRENT_DATE THEN 1 END) as todays_records
FROM daily_brand_product_additions;

-- 3. Check which notification functions exist
SELECT 
  '🔍 NOTIFICATION FUNCTIONS' as section;

SELECT 
  routine_name as function_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name LIKE '%notification%' 
    OR routine_name LIKE '%push%'
    OR routine_name LIKE '%brand_new_product%'
  )
ORDER BY routine_name;

-- 4. Check recent notifications sent (last 24 hours)
SELECT 
  '🔍 RECENT NOTIFICATIONS (last 24h)' as section;

SELECT 
  type,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM notifications
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY type
ORDER BY count DESC;

-- 5. Check RLS policies on notification-related tables
SELECT 
  '🔍 RLS POLICIES (checking for auth.uid() performance issue)' as section;

SELECT 
  schemaname,
  tablename,
  policyname,
  CASE 
    WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(select auth.uid())%' 
    THEN '⚠️  NEEDS FIX: auth.uid() without select wrapper'
    ELSE '✅ OK'
  END as rls_status
FROM pg_policies
WHERE tablename IN (
  'push_tokens', 
  'notifications', 
  'notification_preferences',
  'user_brand_notification_throttle'
)
ORDER BY tablename, policyname;

-- Summary
SELECT 
  '📊 DIAGNOSIS COMPLETE' as section,
  'Check the results above to see current state' as next_step;
