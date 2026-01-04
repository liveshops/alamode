-- Debug Empty Feed Issue
-- Let's find out what's going wrong step by step

-- 1. Check if get_recommendations function exists
SELECT 
  'function_exists' as check_type,
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name = 'get_recommendations'
ORDER BY routine_name;

-- 2. Count total available products
SELECT 
  'total_products' as check_type,
  COUNT(*) as total_count,
  COUNT(CASE WHEN is_available = true THEN 1 END) as available_count
FROM products;

-- 3. Check if user has liked too many products (replace USER_ID with actual user ID)
-- You'll need to replace 'YOUR_USER_ID_HERE' with your actual user ID
SELECT 
  'user_likes' as check_type,
  COUNT(*) as total_likes,
  (SELECT COUNT(*) FROM products WHERE is_available = true) as total_available,
  ROUND(COUNT(*)::decimal / (SELECT COUNT(*) FROM products WHERE is_available = true) * 100, 2) as liked_percentage
FROM user_likes_products 
WHERE user_id = 'YOUR_USER_ID_HERE';

-- 4. Test very simple product query (no filters)
SELECT 
  'simple_test' as check_type,
  COUNT(*) as count_no_filters
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE p.is_available = true
LIMIT 10;

-- 5. Test if user_preferences table has data
SELECT 
  'user_preferences' as check_type,
  COUNT(*) as total_users_with_prefs,
  COUNT(CASE WHEN total_likes > 0 THEN 1 END) as users_with_likes,
  COUNT(CASE WHEN total_follows > 0 THEN 1 END) as users_with_follows
FROM user_preferences;

-- 6. Test a minimal version of recommendations function call
-- (This will error if function doesn't exist)
-- Replace 'YOUR_USER_ID_HERE' with actual user ID
SELECT 
  'function_test' as check_type,
  COUNT(*) as result_count
FROM get_recommendations('YOUR_USER_ID_HERE', 10, 0, 0);

-- 7. Check recent user_product_impressions
SELECT 
  'impressions_check' as check_type,
  COUNT(*) as total_impressions,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT product_id) as unique_products,
  MAX(last_shown_at) as latest_impression
FROM user_product_impressions
WHERE last_shown_at > NOW() - INTERVAL '7 days';

-- Instructions for user:
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID from auth.users
-- To find your user ID, run: SELECT id, email FROM auth.users WHERE email = 'your.email@domain.com';
