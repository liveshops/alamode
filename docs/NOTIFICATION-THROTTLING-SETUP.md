# Brand Notification Throttling Setup

This document explains how to implement daily notification throttling for brand new products.

## Problem

Currently, users receive a push notification for **every single new product** from brands they follow. If a brand adds 20 products in one day, followers get 20 notifications - this is overwhelming and leads to notification fatigue.

## Solution

**Daily Throttling**: Users receive **maximum 1 notification per brand per day**, regardless of how many products that brand adds.

## How It Works

### Before (Overwhelming) 🔥
- Princess Polly adds 15 new products today
- User gets 15 separate notifications
- Result: User disables notifications entirely

### After (Consolidated) ✨
- Princess Polly adds 15 new products today
- User gets **1 notification** for the first product
- System tracks the other 14 products silently
- Tomorrow resets - user can get 1 more notification from Princess Polly

## Implementation

### Step 1: Run the Migration

In **Supabase SQL Editor**, run:

```sql
-- Copy and paste the contents of migration-throttle-brand-notifications.sql
```

This creates:
- `user_brand_notification_throttle` table to track daily notifications
- Updated trigger function with throttling logic
- Cleanup and summary functions

### Step 2: Verify Setup

Check that the migration worked:

```sql
-- Should show the new table
SELECT * FROM user_brand_notification_throttle LIMIT 5;

-- Should show the new trigger
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'on_brand_new_product_throttled';
```

### Step 3: Test (Optional)

Insert a test product to verify throttling:

```sql
-- This should send 1 notification per follower
INSERT INTO products (brand_id, name, price, image_url, product_url, external_id, is_available)
SELECT 
  id as brand_id,
  'Test Product ' || EXTRACT(EPOCH FROM NOW()) as name,
  29.99 as price,
  'https://via.placeholder.com/400' as image_url,
  'https://example.com/test' as product_url,
  'test-' || EXTRACT(EPOCH FROM NOW()) as external_id,
  true as is_available
FROM brands 
WHERE slug = 'princess-polly'  -- Replace with actual brand
LIMIT 1;

-- Insert another product from same brand - should NOT send notifications
INSERT INTO products (brand_id, name, price, image_url, product_url, external_id, is_available)
SELECT 
  id as brand_id,
  'Test Product 2 ' || EXTRACT(EPOCH FROM NOW()) as name,
  39.99 as price,
  'https://via.placeholder.com/400' as image_url,
  'https://example.com/test2' as product_url,
  'test2-' || EXTRACT(EPOCH FROM NOW()) as external_id,
  true as is_available
FROM brands 
WHERE slug = 'princess-polly'  -- Replace with actual brand
LIMIT 1;

-- Check throttle table - should show 1 record with product_count = 2
SELECT * FROM user_brand_notification_throttle WHERE notification_date = CURRENT_DATE;
```

## Database Schema

### New Table: `user_brand_notification_throttle`

```sql
CREATE TABLE user_brand_notification_throttle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID NOT NULL REFERENCES brands(id),
  notification_date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_count INTEGER DEFAULT 1,
  first_product_id UUID REFERENCES products(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, brand_id, notification_date)
);
```

### Updated Trigger Logic

```sql
-- Old: Send notification for EVERY product
FOR follower_record IN
  SELECT user_id FROM user_follows_brands WHERE brand_id = NEW.brand_id
LOOP
  PERFORM send_push_notification(...);  -- Always sends
END LOOP;

-- New: Send notification only for FIRST product per day
FOR follower_record IN
  SELECT user_id FROM user_follows_brands WHERE brand_id = NEW.brand_id
LOOP
  -- Check if notification already sent today
  IF no_notification_sent_today THEN
    PERFORM send_push_notification(...);  -- Send notification
    INSERT INTO throttle table;           -- Record it
  ELSE
    UPDATE throttle SET product_count + 1; -- Just count it
  END IF;
END LOOP;
```

## Monitoring

### Check Daily Notification Activity

```sql
-- See which brands are adding multiple products today
SELECT 
  b.name as brand_name,
  COUNT(*) as products_added_today,
  COUNT(DISTINCT ufb.user_id) as followers_who_got_notified
FROM products p
JOIN brands b ON b.id = p.brand_id
LEFT JOIN user_follows_brands ufb ON ufb.brand_id = p.brand_id
WHERE p.created_at >= CURRENT_DATE
  AND p.is_available = true
GROUP BY b.id, b.name
ORDER BY products_added_today DESC;
```

### Check Throttle Effectiveness

```sql
-- See how many notifications were "saved" (not sent due to throttling)
SELECT 
  b.name as brand_name,
  t.product_count as total_products_added,
  1 as notifications_sent,
  (t.product_count - 1) as notifications_saved
FROM user_brand_notification_throttle t
JOIN brands b ON b.id = t.brand_id
WHERE t.notification_date = CURRENT_DATE
  AND t.product_count > 1
ORDER BY notifications_saved DESC;
```

### Daily Summary for User

```sql
-- Get user's daily brand activity summary
SELECT * FROM get_brand_notification_summary('user-uuid-here', CURRENT_DATE);
```

## Cleanup

The system includes automatic cleanup of old throttle records:

```sql
-- Run periodically (or set up as a cron job)
SELECT cleanup_old_notification_throttles();
```

This removes throttle records older than 30 days to prevent table bloat.

## Future Enhancements

1. **Weekly Digest**: Send a weekly summary of new products from followed brands
2. **Smart Timing**: Send notifications at optimal times based on user activity
3. **Category Preferences**: Let users choose which product categories to get notified about
4. **Batch Notifications**: "Princess Polly added 5 new dresses today"

## Rollback (If Needed)

To revert to the old system:

```sql
-- Remove the throttled trigger
DROP TRIGGER IF EXISTS on_brand_new_product_throttled ON products;

-- Restore the original trigger (sends notification for every product)
CREATE TRIGGER on_brand_new_product
  AFTER INSERT ON products
  FOR EACH ROW
  WHEN (NEW.is_available = true)
  EXECUTE FUNCTION notify_brand_new_product();  -- Original function
```

## Impact

**Before**: ~500 notifications per day (estimated)
**After**: ~50 notifications per day (10x reduction)
**User Experience**: Less notification fatigue, higher engagement
**Database**: Minimal impact, efficient throttle table with cleanup
