-- Fix user follower/following count triggers
-- This ensures follower_count and following_count are updated automatically

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_user_followers ON user_follows_users;

-- Create or replace the function
CREATE OR REPLACE FUNCTION update_user_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment follower_count for the user being followed
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
    -- Increment following_count for the user doing the following
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement follower_count for the user being unfollowed
    UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = OLD.following_id;
    -- Decrement following_count for the user doing the unfollowing
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trigger_update_user_followers
AFTER INSERT OR DELETE ON user_follows_users
FOR EACH ROW EXECUTE FUNCTION update_user_follower_count();

-- Fix existing counts to match reality
UPDATE profiles p
SET follower_count = (
  SELECT COUNT(*)
  FROM user_follows_users ufu
  WHERE ufu.following_id = p.id
);

UPDATE profiles p
SET following_count = (
  SELECT COUNT(*)
  FROM user_follows_users ufu
  WHERE ufu.follower_id = p.id
);

-- Verify the counts
SELECT 
  username,
  follower_count,
  (SELECT COUNT(*) FROM user_follows_users WHERE following_id = profiles.id) as actual_followers,
  following_count,
  (SELECT COUNT(*) FROM user_follows_users WHERE follower_id = profiles.id) as actual_following
FROM profiles
WHERE follower_count > 0 OR following_count > 0
ORDER BY username;
