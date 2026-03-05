-- =====================================================
-- Fix: Supabase Security Warnings
-- 
-- 1. Set search_path on all 39 functions
-- 2. Move extensions out of public schema
-- 3. Scope notifications INSERT policy
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. FIX FUNCTION SEARCH PATH (39 functions)
-- Adding SET search_path = '' prevents search_path hijacking
-- =====================================================

ALTER FUNCTION public.get_products_by_category SET search_path = '';
ALTER FUNCTION public.update_notification_updated_at SET search_path = '';
ALTER FUNCTION public.get_user_push_tokens SET search_path = '';
ALTER FUNCTION public.mark_notification_read SET search_path = '';
ALTER FUNCTION public.mark_all_notifications_read SET search_path = '';
ALTER FUNCTION public.get_unread_notification_count SET search_path = '';
ALTER FUNCTION public.track_brand_new_product SET search_path = '';
ALTER FUNCTION public.send_batched_brand_notifications SET search_path = '';
ALTER FUNCTION public.cleanup_old_brand_additions SET search_path = '';
ALTER FUNCTION public.send_end_of_day_brand_notifications SET search_path = '';
ALTER FUNCTION public.get_shop_brands SET search_path = '';
ALTER FUNCTION public.notify_brand_new_product_throttled SET search_path = '';
ALTER FUNCTION public.notify_new_follower SET search_path = '';
ALTER FUNCTION public.upsert_product SET search_path = '';
ALTER FUNCTION public.cleanup_old_notification_throttles SET search_path = '';
ALTER FUNCTION public.compute_user_preferences SET search_path = '';
ALTER FUNCTION public.record_product_impressions SET search_path = '';
ALTER FUNCTION public.cleanup_old_impressions SET search_path = '';
ALTER FUNCTION public.get_recommendations SET search_path = '';
ALTER FUNCTION public.get_similar_products SET search_path = '';
ALTER FUNCTION public.get_new_today_feed SET search_path = '';
ALTER FUNCTION public.get_followed_brand_count SET search_path = '';
ALTER FUNCTION public.get_user_collections SET search_path = '';
ALTER FUNCTION public.get_user_feed SET search_path = '';
ALTER FUNCTION public.trigger_brand_notifications_now SET search_path = '';
ALTER FUNCTION public.get_user_liked_products SET search_path = '';
ALTER FUNCTION public.notify_brand_new_product SET search_path = '';
ALTER FUNCTION public.search_most_liked_products SET search_path = '';
ALTER FUNCTION public.notify_product_like_milestone SET search_path = '';
ALTER FUNCTION public.trigger_update_user_preferences SET search_path = '';
ALTER FUNCTION public.add_product_to_collection SET search_path = '';
ALTER FUNCTION public.remove_product_from_collection SET search_path = '';
ALTER FUNCTION public.get_collection_products SET search_path = '';
ALTER FUNCTION public.create_collection SET search_path = '';
ALTER FUNCTION public.update_collection SET search_path = '';
ALTER FUNCTION public.send_push_notification SET search_path = '';
ALTER FUNCTION public.delete_collection SET search_path = '';
ALTER FUNCTION public.handle_new_user SET search_path = '';

-- =====================================================
-- 2. MOVE EXTENSIONS OUT OF PUBLIC SCHEMA
-- =====================================================

-- Move pg_trgm to extensions schema
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- pg_net is managed by Supabase and cannot be moved — ignore that warning

-- =====================================================
-- 3. SCOPE NOTIFICATIONS INSERT POLICY
-- Restrict to service_role instead of allowing all
-- =====================================================

DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
CREATE POLICY "Service role can insert notifications" ON notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);
