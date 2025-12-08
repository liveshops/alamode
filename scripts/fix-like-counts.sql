-- Fix existing like counts to match actual data
-- Run this AFTER adding the trigger

-- Update product like counts based on actual likes
UPDATE products p
SET like_count = (
  SELECT COUNT(*)
  FROM user_likes_products ulp
  WHERE ulp.product_id = p.id
);

-- Update profile liked items counts
UPDATE profiles pr
SET liked_items_count = (
  SELECT COUNT(*)
  FROM user_likes_products ulp
  WHERE ulp.user_id = pr.id
);

-- Verify the counts
SELECT 
  p.name,
  p.like_count,
  COUNT(ulp.user_id) as actual_likes
FROM products p
LEFT JOIN user_likes_products ulp ON ulp.product_id = p.id
GROUP BY p.id, p.name, p.like_count
ORDER BY p.name;
