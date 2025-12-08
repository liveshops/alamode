-- Add trigger to automatically update product like_count
-- Run this in Supabase SQL Editor

-- Function to update product like count
CREATE OR REPLACE FUNCTION update_product_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products SET like_count = like_count + 1 WHERE id = NEW.product_id;
    UPDATE profiles SET liked_items_count = liked_items_count + 1 WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.product_id;
    UPDATE profiles SET liked_items_count = GREATEST(liked_items_count - 1, 0) WHERE id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_product_likes ON user_likes_products;

-- Create the trigger
CREATE TRIGGER trigger_update_product_likes
AFTER INSERT OR DELETE ON user_likes_products
FOR EACH ROW EXECUTE FUNCTION update_product_like_count();

-- Verify the trigger was created
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table 
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_product_likes';
