-- ============================================================
-- Recommendations v2: Social signals + explore slots + restored exclusions
-- Date: July 8, 2026
--
-- What changed vs the live version (migration-optimize-recommendations.sql):
--   1. RESTORED: hard 7-day exclusion of recently shown products
--      (user_product_impressions — was dropped in the April rewrite)
--   2. RESTORED: hard exclusion of not-interested products (user_not_interested)
--   3. NEW: social signal — products liked by users you follow,
--      log-scaled (1 friend = strong nudge, 6+ = near-guaranteed placement)
--   4. NEW: social brand signal — brands followed by users you follow
--   5. NEW: 15% explore slots — every 7th feed position reserved for
--      products outside the user's known preferences
--   6. IMPROVED: candidate pool is now prioritized (social > followed
--      brands > recent > popular) instead of an arbitrary LIMIT 5000
--   7. IMPROVED: capped scoring components so no single signal dominates
--
-- Signature and return columns are IDENTICAL to the live version:
-- no app changes required.
-- ============================================================

DROP FUNCTION IF EXISTS get_recommendations(UUID, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_recommendations(
  target_user_id UUID,
  result_limit INTEGER DEFAULT 50,
  offset_val INTEGER DEFAULT 0,
  refresh_seed INTEGER DEFAULT 0
)
RETURNS TABLE (
  product_id UUID,
  name TEXT,
  price DECIMAL,
  sale_price DECIMAL,
  image_url TEXT,
  additional_images TEXT[],
  product_url TEXT,
  brand_id UUID,
  brand_name TEXT,
  brand_slug TEXT,
  taxonomy_category_name TEXT,
  like_count INTEGER,
  is_liked_by_user BOOLEAN,
  recommendation_score DECIMAL,
  recommendation_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  user_prefs user_preferences%ROWTYPE;
  has_preferences BOOLEAN;
  max_per_brand INTEGER := 3;
  prefs_age INTERVAL;
BEGIN
  -- Only refresh preferences if stale (> 1 hour old) or missing
  SELECT NOW() - up.updated_at INTO prefs_age
  FROM user_preferences up WHERE up.user_id = target_user_id;

  IF prefs_age IS NULL OR prefs_age > INTERVAL '1 hour' THEN
    PERFORM compute_user_preferences(target_user_id);
  END IF;

  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = target_user_id;
  has_preferences := user_prefs.total_likes > 0 OR user_prefs.total_follows > 0;

  RETURN QUERY
  WITH
  followed_brands AS (
    SELECT ufb.brand_id
    FROM user_follows_brands ufb
    WHERE ufb.user_id = target_user_id
  ),
  followed_users AS (
    SELECT ufu.following_id
    FROM user_follows_users ufu
    WHERE ufu.follower_id = target_user_id
  ),
  -- SOCIAL: products liked by people the user follows
  social_product_likes AS (
    SELECT ulp.product_id AS pid, COUNT(*)::int AS friend_likes
    FROM user_likes_products ulp
    JOIN followed_users fu ON fu.following_id = ulp.user_id
    GROUP BY ulp.product_id
  ),
  -- SOCIAL: brands followed by people the user follows
  social_brand_follows AS (
    SELECT ufb.brand_id AS bid, COUNT(*)::int AS friend_follows
    FROM user_follows_brands ufb
    JOIN followed_users fu ON fu.following_id = ufb.user_id
    GROUP BY ufb.brand_id
  ),
  -- PRIORITIZED candidate pool (each branch index-friendly and capped so
  -- high-value candidates are never crowded out by a full-table LIMIT)
  candidate_pool AS (
    SELECT DISTINCT ON (c.id) c.*
    FROM (
      -- 1. Products liked by followed users (small, highest value)
      (SELECT p.* FROM products p
        JOIN social_product_likes spl ON spl.pid = p.id
        WHERE p.is_available = true)
      UNION ALL
      -- 2. Recent products from brands the user follows
      (SELECT p.* FROM products p
        WHERE p.is_available = true
          AND p.brand_id IN (SELECT fb.brand_id FROM followed_brands fb)
        ORDER BY p.created_at DESC
        LIMIT 2000)
      UNION ALL
      -- 3. Recent products across the catalog (discovery / freshness)
      (SELECT p.* FROM products p
        WHERE p.is_available = true
          AND p.created_at > NOW() - INTERVAL '30 days'
        ORDER BY p.created_at DESC
        LIMIT 2000)
      UNION ALL
      -- 4. Popular products (discovery / proven winners)
      (SELECT p.* FROM products p
        WHERE p.is_available = true AND p.like_count >= 3
        ORDER BY p.like_count DESC
        LIMIT 1000)
    ) c
    -- HARD EXCLUSIONS
    WHERE NOT EXISTS (
        SELECT 1 FROM user_likes_products ul
        WHERE ul.user_id = target_user_id AND ul.product_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM user_not_interested uni
        WHERE uni.user_id = target_user_id AND uni.product_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM user_product_impressions upi
        WHERE upi.user_id = target_user_id
          AND upi.product_id = c.id
          AND upi.last_shown_at > NOW() - INTERVAL '7 days')
    ORDER BY c.id
  ),
  scored_products AS (
    SELECT
      cp.id,
      cp.name,
      cp.price,
      cp.sale_price,
      cp.image_url,
      cp.additional_images,
      cp.product_url,
      cp.brand_id,
      b.name AS b_name,
      b.slug AS b_slug,
      cp.taxonomy_category_name,
      cp.like_count,
      cp.created_at,
      COALESCE(spl.friend_likes, 0) AS friend_likes,

      -- BRAND AFFINITY from own likes (capped at 25)
      CASE WHEN has_preferences THEN
        LEAST(COALESCE((user_prefs.preferred_brands->>cp.brand_id::text)::numeric, 0) * 5.0, 25)
      ELSE 0 END AS brand_score,

      -- CATEGORY MATCH from own likes (capped at 25)
      CASE WHEN has_preferences AND cp.taxonomy_id IS NOT NULL THEN
        LEAST(COALESCE((user_prefs.preferred_categories->>cp.taxonomy_id)::numeric, 0) * 5.0, 25)
      ELSE 0 END AS category_score,

      -- FOLLOWED BRAND bonus (explicit follow = strong signal)
      CASE WHEN cp.brand_id IN (SELECT fb.brand_id FROM followed_brands fb)
        THEN 10 ELSE 0 END AS followed_brand_bonus,

      -- SOCIAL: log-scaled friend likes (1 friend ≈ 4.2, 3 ≈ 8.3, 6+ → cap 15)
      LEAST(LN(1 + COALESCE(spl.friend_likes, 0)) * 6.0, 15) AS social_score,

      -- SOCIAL: brands your friends follow (smaller bump, cap 8)
      LEAST(LN(1 + COALESCE(sbf.friend_follows, 0)) * 4.0, 8) AS social_brand_score,

      -- FRESHNESS + POPULARITY (max 20)
      (
        CASE
          WHEN cp.created_at > NOW() - INTERVAL '1 day' THEN 10
          WHEN cp.created_at > NOW() - INTERVAL '3 days' THEN 8
          WHEN cp.created_at > NOW() - INTERVAL '7 days' THEN 6
          WHEN cp.created_at > NOW() - INTERVAL '14 days' THEN 3
          WHEN cp.created_at > NOW() - INTERVAL '30 days' THEN 1
          ELSE 0
        END
        + LEAST(cp.like_count, 10)
      ) * 1.0 AS freshness_popularity_score,

      -- PRICE MATCH (max 2.5)
      CASE WHEN has_preferences AND user_prefs.avg_price IS NOT NULL THEN
        CASE
          WHEN cp.price BETWEEN user_prefs.price_range_min AND user_prefs.price_range_max THEN 2.5
          WHEN ABS(cp.price - user_prefs.avg_price) < user_prefs.avg_price * 0.3 THEN 1.5
          ELSE 0
        END
      ELSE 1 END AS price_score,

      -- Sale bonus
      CASE WHEN cp.sale_price IS NOT NULL AND cp.sale_price < cp.price THEN 2 ELSE 0 END AS sale_bonus,

      -- Variety jitter with refresh seed (0-5)
      ((EXTRACT(DOY FROM NOW())::int + refresh_seed + EXTRACT(EPOCH FROM cp.created_at)::bigint % 1000) % 6) AS variety_score

    FROM candidate_pool cp
    JOIN brands b ON b.id = cp.brand_id
    LEFT JOIN social_product_likes spl ON spl.pid = cp.id
    LEFT JOIN social_brand_follows sbf ON sbf.bid = cp.brand_id
  ),
  ranked_products AS (
    SELECT
      sp.*,
      (sp.brand_score + sp.category_score + sp.followed_brand_bonus + sp.social_score
        + sp.social_brand_score + sp.freshness_popularity_score + sp.price_score
        + sp.sale_bonus + sp.variety_score) AS total_score,
      -- EXPLORE = brand novelty: a brand the user has never liked or followed,
      -- and no friend directly liked this product. Category match deliberately
      -- does NOT disqualify (a user with 100+ likes has "seen" every category,
      -- which starved the explore pool to ~zero) — discovering a NEW BRAND in a
      -- familiar category is exactly the discovery we want for fashion.
      (sp.brand_score = 0 AND sp.followed_brand_bonus = 0
        AND sp.social_score = 0) AS is_explore,
      CASE
        WHEN sp.friend_likes = 1 THEN 'Liked by someone you follow'
        WHEN sp.friend_likes > 1 THEN 'Liked by ' || sp.friend_likes || ' people you follow'
        WHEN sp.brand_score > 0 AND sp.category_score > 0 THEN 'Perfect match'
        WHEN sp.followed_brand_bonus > 0 OR sp.brand_score > 0 THEN 'From brands you love'
        WHEN sp.category_score > 0 THEN 'Similar to items you liked'
        WHEN sp.social_brand_score > 0 THEN 'Popular with people you follow'
        WHEN sp.freshness_popularity_score > 10 THEN 'Trending now'
        WHEN sp.created_at > NOW() - INTERVAL '7 days' THEN 'New arrival'
        ELSE 'Discover something new'
      END AS reason,
      ROW_NUMBER() OVER (PARTITION BY sp.brand_id ORDER BY
        (sp.brand_score + sp.category_score + sp.followed_brand_bonus + sp.social_score
          + sp.social_brand_score + sp.freshness_popularity_score + sp.price_score
          + sp.sale_bonus + sp.variety_score) DESC,
        sp.created_at DESC
      ) AS brand_rank
    FROM scored_products sp
  ),
  -- Brand diversity: max 3 per brand, interleaved (all brands' best first)
  brand_limited AS (
    SELECT
      rp.*,
      (rp.brand_rank - 1) * 10000 + ROW_NUMBER() OVER (
        PARTITION BY rp.brand_rank
        ORDER BY rp.total_score DESC
      ) AS interleave_position
    FROM ranked_products rp
    WHERE rp.brand_rank <= max_per_brand
  ),
  -- EXPLORE SLOTTING: every 7th feed position (~15%) goes to an explore item
  positioned AS (
    SELECT
      bl.*,
      ROW_NUMBER() OVER (PARTITION BY bl.is_explore ORDER BY bl.interleave_position) AS grp_rn
    FROM brand_limited bl
  )
  SELECT
    p2.id,
    p2.name,
    p2.price,
    p2.sale_price,
    p2.image_url,
    p2.additional_images,
    p2.product_url,
    p2.brand_id,
    p2.b_name,
    p2.b_slug,
    p2.taxonomy_category_name,
    p2.like_count,
    false AS is_liked_by_user,  -- liked products are hard-excluded above
    p2.total_score::decimal,
    p2.reason,
    p2.created_at
  FROM positioned p2
  ORDER BY
    CASE WHEN p2.is_explore
      THEN p2.grp_rn * 7                        -- explore items land on slots 7, 14, 21…
      ELSE p2.grp_rn + ((p2.grp_rn - 1) / 6)    -- exploit items fill the rest, skipping every 7th
    END,
    p2.total_score DESC
  LIMIT result_limit
  OFFSET offset_val;
END;
$$;

-- ============================================================
-- Supporting indexes (no-ops if they already exist)
-- ============================================================

-- Social join: who does this user follow
CREATE INDEX IF NOT EXISTS idx_user_follows_users_follower
ON user_follows_users(follower_id);

-- Reverse lookup for social likes: likes by user (PK already covers user_id, product_id)
-- Impression cooldown lookups
CREATE INDEX IF NOT EXISTS idx_impressions_user_shown
ON user_product_impressions(user_id, last_shown_at DESC);

-- Not-interested exclusion
CREATE INDEX IF NOT EXISTS idx_user_not_interested_user
ON user_not_interested(user_id, product_id);

ANALYZE user_product_impressions;
ANALYZE user_follows_users;

-- ============================================================
-- Housekeeping: impressions older than 7 days are dead weight for the
-- cooldown. If pg_cron is enabled, schedule the existing cleanup:
--   SELECT cron.schedule('cleanup-impressions', '0 4 * * *',
--     'DELETE FROM user_product_impressions WHERE last_shown_at < NOW() - INTERVAL ''7 days''');
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Recommendations v2 applied:';
  RAISE NOTICE '  - Hard 7-day impression cooldown restored';
  RAISE NOTICE '  - Not-interested exclusion restored';
  RAISE NOTICE '  - Social signals: friend likes (log-scaled) + friend brand follows';
  RAISE NOTICE '  - 15%% explore slots (every 7th position)';
  RAISE NOTICE '  - Prioritized candidate pool (social > followed > recent > popular)';
END $$;
