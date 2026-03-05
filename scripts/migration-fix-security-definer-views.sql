-- =====================================================
-- Fix: Security Definer Views
-- 
-- Recreates 4 views with security_invoker = true
-- so they respect the querying user's RLS policies
-- instead of bypassing them.
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. category_product_counts
DROP VIEW IF EXISTS category_product_counts;
CREATE VIEW category_product_counts
WITH (security_invoker = true) AS
SELECT 
  pc.id,
  pc.name,
  pc.full_name,
  pc.level,
  pc.vertical,
  COUNT(p.id) as product_count,
  COUNT(DISTINCT p.brand_id) as brand_count
FROM product_categories pc
LEFT JOIN products p ON p.taxonomy_id = pc.id
GROUP BY pc.id, pc.name, pc.full_name, pc.level, pc.vertical
ORDER BY product_count DESC;

-- 2. todays_brand_activity
DROP VIEW IF EXISTS todays_brand_activity;
CREATE VIEW todays_brand_activity
WITH (security_invoker = true) AS
SELECT 
  b.name as brand_name,
  b.slug as brand_slug,
  dba.product_count,
  dba.notification_sent,
  dba.first_added_at,
  dba.last_added_at,
  dba.notification_sent_at,
  COUNT(ufb.user_id) as follower_count
FROM daily_brand_product_additions dba
JOIN brands b ON b.id = dba.brand_id
LEFT JOIN user_follows_brands ufb ON ufb.brand_id = dba.brand_id
WHERE dba.notification_date = CURRENT_DATE
GROUP BY b.id, b.name, b.slug, dba.product_count, dba.notification_sent, 
         dba.first_added_at, dba.last_added_at, dba.notification_sent_at
ORDER BY dba.product_count DESC;

-- 3. notification_throttle_stats
DROP VIEW IF EXISTS notification_throttle_stats;
CREATE VIEW notification_throttle_stats
WITH (security_invoker = true) AS
SELECT 
  b.name as brand_name,
  t.notification_date,
  COUNT(DISTINCT t.user_id) as users_notified,
  SUM(t.product_count) as total_products_tracked,
  SUM(t.product_count) - COUNT(*) as notifications_saved
FROM user_brand_notification_throttle t
JOIN brands b ON b.id = t.brand_id
GROUP BY b.name, t.notification_date
ORDER BY t.notification_date DESC, total_products_tracked DESC;

-- 4. brand_sync_stats
DROP VIEW IF EXISTS brand_sync_stats;
CREATE VIEW brand_sync_stats
WITH (security_invoker = true) AS
SELECT 
  b.name,
  b.slug,
  b.last_synced_at,
  COUNT(DISTINCT p.id) as total_products,
  COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN p.id END) as products_last_7_days,
  COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '1 day' THEN p.id END) as products_last_24h,
  (SELECT COUNT(*) FROM product_scrape_logs WHERE brand_id = b.id AND status = 'success') as successful_syncs,
  (SELECT COUNT(*) FROM product_scrape_logs WHERE brand_id = b.id AND status = 'failed') as failed_syncs,
  (SELECT MAX(completed_at) FROM product_scrape_logs WHERE brand_id = b.id) as last_sync_completed
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
WHERE b.is_active = true
GROUP BY b.id, b.name, b.slug, b.last_synced_at
ORDER BY b.name;
