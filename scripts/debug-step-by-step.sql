-- Step-by-step debug for empty feed
-- Replace with your user_id: 8d218535-6ad9-44bd-8956-fb79220f1c2d

-- Step 1: Count total available products
SELECT COUNT(*) as total_products 
FROM products 
WHERE is_available = true;

-- Step 2: Count products NOT liked by you
SELECT COUNT(*) as not_liked_products
FROM products p
WHERE p.is_available = true 
  AND NOT EXISTS(
    SELECT 1 FROM user_likes_products ulp 
    WHERE ulp.product_id = p.id 
    AND ulp.user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d'
  );

-- Step 3: Check if products have brands
SELECT COUNT(*) as products_with_brands
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE p.is_available = true;

-- Step 4: Test the scored_products CTE directly
WITH scored_products AS (
  SELECT 
    p.id,
    p.name,
    p.brand_id,
    b.name as brand_name,
    EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id 
      AND ulp.user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d'
    ) as is_liked
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  WHERE p.is_available = true
)
SELECT 
  COUNT(*) as total_in_scored,
  COUNT(CASE WHEN is_liked = false THEN 1 END) as not_liked_count
FROM scored_products;

-- Step 5: Test ranked_products (with brand_rank)
WITH scored_products AS (
  SELECT 
    p.id,
    p.name,
    p.brand_id,
    b.name as brand_name,
    p.like_count,
    p.created_at,
    EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id 
      AND ulp.user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d'
    ) as is_liked,
    -- Simple score
    p.like_count as total_score
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  WHERE p.is_available = true
),
ranked_products AS (
  SELECT 
    sp.*,
    ROW_NUMBER() OVER (
      PARTITION BY sp.brand_id 
      ORDER BY sp.total_score DESC, sp.created_at DESC
    ) as brand_rank
  FROM scored_products sp
  WHERE sp.is_liked = false
)
SELECT COUNT(*) as products_after_ranking
FROM ranked_products;

-- Step 6: Test brand_limited (top 3 per brand)
WITH scored_products AS (
  SELECT 
    p.id,
    p.name,
    p.brand_id,
    b.name as brand_name,
    p.like_count,
    p.created_at,
    EXISTS(
      SELECT 1 FROM user_likes_products ulp 
      WHERE ulp.product_id = p.id 
      AND ulp.user_id = '8d218535-6ad9-44bd-8956-fb79220f1c2d'
    ) as is_liked,
    p.like_count as total_score
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  WHERE p.is_available = true
),
ranked_products AS (
  SELECT 
    sp.*,
    ROW_NUMBER() OVER (
      PARTITION BY sp.brand_id 
      ORDER BY sp.total_score DESC, sp.created_at DESC
    ) as brand_rank
  FROM scored_products sp
  WHERE sp.is_liked = false
),
brand_limited AS (
  SELECT *
  FROM ranked_products rp
  WHERE rp.brand_rank <= 3
)
SELECT COUNT(*) as products_after_brand_limit
FROM brand_limited;
