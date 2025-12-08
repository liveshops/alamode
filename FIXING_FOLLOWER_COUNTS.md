# Fixing Follower Count Updates

## The Problem

Follower counts aren't updating in the app even though your database has triggers set up. This happens because:

1. **Triggers may not be created** - Need to verify they exist in Supabase
2. **Triggers need SECURITY DEFINER** - RLS policies can block trigger operations
3. **Existing counts are out of sync** - Historical data may be incorrect

## The Solution (2 Steps)

### Step 1: Run the Fix Script in Supabase

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy and paste **ALL** of: `scripts/fix-follower-counts.sql`
3. Click **Run**

This will:
- ✅ Recreate all trigger functions with proper permissions (`SECURITY DEFINER`)
- ✅ Recreate all triggers
- ✅ Sync all existing counts with reality
- ✅ Verify everything is working

### Step 2: Test in Your App

1. **Follow a brand** in the app
2. **Pull to refresh** on the brand page or profile
3. **Check the count** - it should update immediately

---

## What the Fix Does

### Recreates 3 Triggers:

#### 1. Brand Follower Count Trigger
When you follow/unfollow a brand:
- Updates `brands.follower_count`

#### 2. User Follower Count Trigger  
When you follow/unfollow a user:
- Updates `profiles.follower_count` (followers)
- Updates `profiles.following_count` (following)

#### 3. Product Like Count Trigger
When you like/unlike a product:
- Updates `products.like_count`
- Updates `profiles.liked_items_count`

### Key Fix: `SECURITY DEFINER`

The original triggers may fail because of RLS policies. Adding `SECURITY DEFINER` allows the trigger function to bypass RLS and always update counts.

```sql
CREATE OR REPLACE FUNCTION update_brand_follower_count()
RETURNS TRIGGER 
SECURITY DEFINER  -- ← This is the key!
SET search_path = public
AS $$
...
```

### Syncs Existing Data

The script also fixes any incorrect counts by recalculating from actual data:

```sql
-- Fix brand follower counts
UPDATE brands b
SET follower_count = (
  SELECT COUNT(*) 
  FROM user_follows_brands ufb 
  WHERE ufb.brand_id = b.id
);
```

---

## How Your App Handles Counts

Your app does **optimistic updates** (good practice):

### Example: Following a Brand

```typescript
// 1. Update UI immediately (optimistic)
setIsFollowing(true);
setBrand({ ...brand, follower_count: brand.follower_count + 1 });

// 2. Send to database
await supabase
  .from('user_follows_brands')
  .insert({ user_id, brand_id });

// 3. Trigger fires in database (automatic)
// 4. Next refresh shows correct count
```

The problem was step 3 - triggers weren't firing or didn't have permission.

---

## Testing the Fix

### Test Brand Follows

1. Go to a brand page (e.g., Edikted)
2. Note the current follower count
3. **Tap Follow button**
4. Count should increase by 1 immediately
5. **Pull to refresh**
6. Count should still show the increased number
7. **Tap Unfollow button**
8. Count should decrease by 1

### Test User Follows (if implemented)

1. Go to another user's profile
2. **Tap Follow**
3. Their follower count increases
4. Your following count increases
5. Refresh to verify

### Test Product Likes

1. Heart a product
2. Check your profile
3. "Liked Products" count should increase
4. Un-heart the product
5. Count should decrease

---

## Verifying Triggers Are Active

Run this in Supabase SQL Editor:

```sql
-- Check triggers exist
SELECT 
  trigger_name,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'trigger_update_brand_followers',
  'trigger_update_user_followers',
  'trigger_update_product_likes'
);
```

Should return 3 rows:
- `trigger_update_brand_followers` on `user_follows_brands`
- `trigger_update_user_followers` on `user_follows_users`  
- `trigger_update_product_likes` on `user_likes_products`

---

## Debugging if Still Not Working

### Check if trigger fired:

```sql
-- Follow a brand, then check:
SELECT name, follower_count 
FROM brands 
WHERE slug = 'edikted';

-- Check your follows:
SELECT COUNT(*) as brands_following
FROM user_follows_brands
WHERE user_id = '<your-user-id>';
```

### Manual trigger test:

```sql
-- Get a brand ID and your user ID
SELECT id FROM brands WHERE slug = 'edikted';
SELECT id FROM profiles WHERE email = 'your-email@example.com';

-- Insert a follow (replace IDs)
INSERT INTO user_follows_brands (user_id, brand_id)
VALUES ('<your-user-id>', '<brand-id>')
ON CONFLICT DO NOTHING;

-- Check if brand follower_count increased
SELECT name, follower_count 
FROM brands 
WHERE id = '<brand-id>';
```

---

## Why This Happened

Your original `supabase-setup.sql` had the triggers, but they were missing:
1. `SECURITY DEFINER` clause
2. `SET search_path = public`
3. Proper `GREATEST(0, ...)` to prevent negative counts

The fix script addresses all of these issues.

---

## Additional Notes

### App Refresh Behavior

Your app already handles this well:
- **Profile screen** (`(tabs)/profile.tsx`): Fetches fresh counts on focus
- **Brand pages** (`brand/[slug].tsx`): Pull-to-refresh updates counts
- **User pages** (`user/[id].tsx`): Same pattern

### No App Changes Needed

The fix is **entirely database-side**. Your app code is correct - it just needs the database triggers to work properly.

---

## Success Checklist

- [ ] Ran `fix-follower-counts.sql` in Supabase
- [ ] Verified 3 triggers exist
- [ ] Tested following a brand - count increases
- [ ] Pulled to refresh - count persists
- [ ] Tested unfollowing - count decreases
- [ ] Tested liking a product - counts update
- [ ] All counts now update correctly!

---

**After running the fix, all follower/following/like counts should update instantly!** 🎉
