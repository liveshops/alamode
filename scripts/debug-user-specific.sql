-- Debug with the EXACT user ID from the app logs
-- User ID from logs: 8d218535-6ad9-44bd-8956-fb79220f1c2d

-- 1. Test the function with the exact user ID from the app
SELECT * FROM get_recommendations('8d218535-6ad9-44bd-8956-fb79220f1c2d', 5, 0, 0);

-- 2. Check if user preferences exist for this user
SELECT * FROM user_preferences WHERE user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d';

-- 3. Check how many products this user has liked (might be filtering out everything)
SELECT COUNT(*) as liked_count 
FROM user_likes_products 
WHERE user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d';

-- 4. Check total available products (not liked by this user)
SELECT COUNT(*) as available_count 
FROM products p 
WHERE p.is_available = true 
  AND NOT EXISTS(
    SELECT 1 FROM user_likes_products ulp 
    WHERE ulp.product_id = p.id AND ulp.user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d'
  );

-- 5. Test a simpler version - just get any available products for this user
SELECT p.id, p.name, p.created_at, b.name as brand_name
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE p.is_available = true
  AND NOT EXISTS(
    SELECT 1 FROM user_likes_products ulp 
    WHERE ulp.product_id = p.id AND ulp.user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d'
  )
ORDER BY p.created_at DESC
LIMIT 5;
