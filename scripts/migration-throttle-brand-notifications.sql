-- Migration: Throttle Brand New Product Notifications
-- Limits brand notifications to 1 per day per brand per user

-- 1. Create table to track daily brand notifications
CREATE TABLE IF NOT EXISTS user_brand_notification_throttle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  notification_date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_count INTEGER DEFAULT 1,
  first_product_id UUID REFERENCES products(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per user/brand/date
  UNIQUE(user_id, brand_id, notification_date)
);

-- 2. Add RLS policies for the throttle table
ALTER TABLE user_brand_notification_throttle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own notification throttle records"
ON user_brand_notification_throttle
FOR ALL
USING (auth.uid() = user_id);

-- 3. Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_brand_notification_throttle_lookup 
ON user_brand_notification_throttle(user_id, brand_id, notification_date);

-- 4. Updated trigger function with daily throttling
CREATE OR REPLACE FUNCTION notify_brand_new_product_throttled()
RETURNS TRIGGER AS $$
DECLARE
  brand_name_val TEXT;
  follower_record RECORD;
  throttle_record RECORD;
  product_count INTEGER;
BEGIN
  -- Get the brand name
  SELECT name INTO brand_name_val
  FROM brands
  WHERE id = NEW.brand_id;

  -- Notify all users who follow this brand (with throttling)
  FOR follower_record IN
    SELECT user_id FROM user_follows_brands WHERE brand_id = NEW.brand_id
  LOOP
    -- Check if we've already sent a notification today for this brand to this user
    SELECT product_count, first_product_id INTO throttle_record
    FROM user_brand_notification_throttle
    WHERE user_id = follower_record.user_id
      AND brand_id = NEW.brand_id
      AND notification_date = CURRENT_DATE;

    IF throttle_record IS NULL THEN
      -- First product today - send notification and create throttle record
      PERFORM send_push_notification(
        follower_record.user_id,
        'brand_products',
        'New from ' || COALESCE(brand_name_val, 'a brand you follow') || ' ✨',
        'Check out: ' || COALESCE(NEW.name, 'New product'),
        jsonb_build_object(
          'screen', 'product',
          'productId', NEW.id
        )
      );
      
      -- Record this notification to prevent more today
      INSERT INTO user_brand_notification_throttle 
        (user_id, brand_id, notification_date, product_count, first_product_id)
      VALUES 
        (follower_record.user_id, NEW.brand_id, CURRENT_DATE, 1, NEW.id)
      ON CONFLICT (user_id, brand_id, notification_date) 
      DO UPDATE SET 
        product_count = user_brand_notification_throttle.product_count + 1;
        
    ELSE
      -- We already sent a notification today for this brand to this user
      -- Just update the count (no notification sent)
      UPDATE user_brand_notification_throttle
      SET product_count = product_count + 1
      WHERE user_id = follower_record.user_id
        AND brand_id = NEW.brand_id
        AND notification_date = CURRENT_DATE;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Replace the existing trigger with the throttled version
DROP TRIGGER IF EXISTS on_brand_new_product ON products;
CREATE TRIGGER on_brand_new_product_throttled
  AFTER INSERT ON products
  FOR EACH ROW
  WHEN (NEW.is_available = true)
  EXECUTE FUNCTION notify_brand_new_product_throttled();

-- 6. Optional: Create a cleanup function to remove old throttle records
CREATE OR REPLACE FUNCTION cleanup_old_notification_throttles()
RETURNS void AS $$
BEGIN
  -- Delete throttle records older than 30 days
  DELETE FROM user_brand_notification_throttle
  WHERE notification_date < CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Optional: Create a daily summary function (for future use)
CREATE OR REPLACE FUNCTION get_brand_notification_summary(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  brand_name TEXT,
  brand_slug TEXT,
  product_count INTEGER,
  first_product_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.name as brand_name,
    b.slug as brand_slug,
    t.product_count,
    p.name as first_product_name
  FROM user_brand_notification_throttle t
  JOIN brands b ON b.id = t.brand_id
  LEFT JOIN products p ON p.id = t.first_product_id
  WHERE t.user_id = p_user_id 
    AND t.notification_date = p_date
  ORDER BY t.product_count DESC, b.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Brand notification throttling system created successfully!';
  RAISE NOTICE 'Users will now receive max 1 notification per brand per day.';
END $$;
