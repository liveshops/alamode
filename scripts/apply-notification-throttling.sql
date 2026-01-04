-- Apply Brand Notification Throttling Migration
-- Run this in Supabase SQL Editor to implement daily notification limits

-- First, let's see current notification activity (optional check)
SELECT 
  b.name as brand_name,
  COUNT(*) as new_products_today
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE p.created_at >= CURRENT_DATE
  AND p.is_available = true
GROUP BY b.id, b.name
ORDER BY new_products_today DESC
LIMIT 10;

-- Apply the throttling system
\i migration-throttle-brand-notifications.sql

-- Optional: Check which users would have gotten multiple notifications today (before throttling)
WITH brand_activity_today AS (
  SELECT 
    p.brand_id,
    b.name as brand_name,
    COUNT(*) as products_added_today
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  WHERE p.created_at >= CURRENT_DATE
    AND p.is_available = true
  GROUP BY p.brand_id, b.name
  HAVING COUNT(*) > 1
)
SELECT 
  ba.brand_name,
  ba.products_added_today,
  COUNT(ufb.user_id) as followers_affected
FROM brand_activity_today ba
JOIN user_follows_brands ufb ON ufb.brand_id = ba.brand_id
GROUP BY ba.brand_name, ba.products_added_today
ORDER BY followers_affected DESC;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Brand notification throttling applied successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'BEFORE: Users got 1 notification per new product';
  RAISE NOTICE 'AFTER:  Users get max 1 notification per brand per day';
  RAISE NOTICE '';
  RAISE NOTICE 'The system will:';
  RAISE NOTICE '- Send notification for first product of the day from each brand';
  RAISE NOTICE '- Track additional products but not notify';
  RAISE NOTICE '- Reset daily at midnight';
  RAISE NOTICE '==============================================';
END $$;
