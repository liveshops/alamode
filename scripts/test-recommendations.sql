-- Test query to find the actual issue
-- Replace 'YOUR_USER_ID' with your actual user ID from Supabase Auth

-- Step 1: Verify basic product count
SELECT COUNT(*) as total_products FROM products WHERE is_available = true;

-- Step 2: Check user_preferences
SELECT * FROM user_preferences WHERE user_id = 'YOUR_USER_ID';

-- Step 3: Count available products (not liked)
SELECT COUNT(*) as available_not_liked
FROM products p 
WHERE p.is_available = true 
  AND NOT EXISTS(
    SELECT 1 FROM user_likes_products ulp 
    WHERE ulp.product_id = p.id AND ulp.user_id = 'YOUR_USER_ID'
  );

-- Step 4: Check impressions
SELECT COUNT(*) as total_impressions
FROM user_product_impressions
WHERE user_id = 'YOUR_USER_ID';

-- Step 5: Test get_recommendations directly
SELECT COUNT(*) as returned_products
FROM get_recommendations('YOUR_USER_ID', 20, 0, 123);

-- Step 6: See what's actually returned (if any)
SELECT * FROM get_recommendations('YOUR_USER_ID', 20, 0, 123) LIMIT 5;

-- Step 7: Check if compute_user_preferences works
SELECT compute_user_preferences('YOUR_USER_ID');
SELECT * FROM user_preferences WHERE user_id = 'YOUR_USER_ID';
