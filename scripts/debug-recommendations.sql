-- Debug query to see what's happening with recommendations
-- Replace YOUR_USER_ID with your actual user ID

-- 1. Check user preferences exist
SELECT * FROM user_preferences WHERE user_id = 'YOUR_USER_ID';

-- 2. Check total available products (not liked)
SELECT COUNT(*) as total_available
FROM products p 
WHERE p.is_available = true 
  AND NOT EXISTS(
    SELECT 1 FROM user_likes_products ulp 
    WHERE ulp.product_id = p.id AND ulp.user_id = 'YOUR_USER_ID'
  );

-- 3. Check recent impressions
SELECT 
  COUNT(*) as total_impressions,
  COUNT(CASE WHEN last_shown_at > NOW() - INTERVAL '30 days' THEN 1 END) as within_30_days,
  COUNT(CASE WHEN last_shown_at > NOW() - INTERVAL '7 days' THEN 1 END) as within_7_days,
  COUNT(CASE WHEN last_shown_at > NOW() - INTERVAL '1 day' THEN 1 END) as within_1_day
FROM user_product_impressions
WHERE user_id = 'YOUR_USER_ID';

-- 4. Test the function directly
SELECT * FROM get_recommendations('YOUR_USER_ID', 20, 0, 123)
LIMIT 5;

-- 5. Check for any errors in scoring (run a simplified version)
SELECT 
  p.id,
  p.name,
  p.brand_id,
  p.like_count,
  p.created_at,
  EXISTS(SELECT 1 FROM user_likes_products ulp WHERE ulp.product_id = p.id AND ulp.user_id = 'YOUR_USER_ID') as is_liked
FROM products p
WHERE p.is_available = true
LIMIT 10;
