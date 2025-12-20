-- Migration: Collections Feature
-- Date: December 19, 2025
-- Purpose: Allow users to create collections and add products to them

-- 1. Create collections table
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  is_public BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,
  product_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user collection lookups
CREATE INDEX IF NOT EXISTS idx_collections_user_id 
ON collections(user_id);

CREATE INDEX IF NOT EXISTS idx_collections_user_public 
ON collections(user_id, is_public);

-- 2. Create collection_products junction table
CREATE TABLE IF NOT EXISTS collection_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, product_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_collection_products_collection 
ON collection_products(collection_id);

CREATE INDEX IF NOT EXISTS idx_collection_products_product 
ON collection_products(product_id);

-- 3. Function to add product to collection (auto-likes if not already liked)
CREATE OR REPLACE FUNCTION add_product_to_collection(
  p_user_id UUID,
  p_collection_id UUID,
  p_product_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_collection_owner UUID;
  v_result JSON;
BEGIN
  -- Verify collection belongs to user
  SELECT user_id INTO v_collection_owner
  FROM collections
  WHERE id = p_collection_id;
  
  IF v_collection_owner IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Collection not found');
  END IF;
  
  IF v_collection_owner != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Auto-like the product if not already liked
  INSERT INTO user_likes_products (user_id, product_id)
  VALUES (p_user_id, p_product_id)
  ON CONFLICT (user_id, product_id) DO NOTHING;
  
  -- Update like count on product
  UPDATE products 
  SET like_count = like_count + 1 
  WHERE id = p_product_id 
    AND NOT EXISTS (
      SELECT 1 FROM user_likes_products 
      WHERE user_id = p_user_id AND product_id = p_product_id
    );
  
  -- Add product to collection
  INSERT INTO collection_products (collection_id, product_id, position)
  SELECT p_collection_id, p_product_id, COALESCE(MAX(position), 0) + 1
  FROM collection_products
  WHERE collection_id = p_collection_id
  ON CONFLICT (collection_id, product_id) DO NOTHING;
  
  -- Update collection product count and cover image if first product
  UPDATE collections
  SET 
    product_count = (SELECT COUNT(*) FROM collection_products WHERE collection_id = p_collection_id),
    cover_image_url = COALESCE(
      cover_image_url,
      (SELECT p.image_url FROM products p WHERE p.id = p_product_id)
    ),
    updated_at = NOW()
  WHERE id = p_collection_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- 4. Function to remove product from collection
CREATE OR REPLACE FUNCTION remove_product_from_collection(
  p_user_id UUID,
  p_collection_id UUID,
  p_product_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_collection_owner UUID;
BEGIN
  -- Verify collection belongs to user
  SELECT user_id INTO v_collection_owner
  FROM collections
  WHERE id = p_collection_id;
  
  IF v_collection_owner != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Remove product from collection
  DELETE FROM collection_products
  WHERE collection_id = p_collection_id AND product_id = p_product_id;
  
  -- Update collection product count
  UPDATE collections
  SET 
    product_count = (SELECT COUNT(*) FROM collection_products WHERE collection_id = p_collection_id),
    updated_at = NOW()
  WHERE id = p_collection_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- 5. Function to get user collections with preview products
CREATE OR REPLACE FUNCTION get_user_collections(
  p_user_id UUID,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  cover_image_url TEXT,
  is_public BOOLEAN,
  product_count INTEGER,
  created_at TIMESTAMPTZ,
  preview_products JSON
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.description,
    c.cover_image_url,
    c.is_public,
    c.product_count,
    c.created_at,
    (
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'image_url', p.image_url,
          'price', p.price,
          'sale_price', p.sale_price,
          'brand_name', b.name,
          'brand_slug', b.slug
        )
        ORDER BY cp.position
      )
      FROM collection_products cp
      JOIN products p ON p.id = cp.product_id
      JOIN brands b ON b.id = p.brand_id
      WHERE cp.collection_id = c.id
      LIMIT 10
    ) as preview_products
  FROM collections c
  WHERE c.user_id = p_user_id
    AND (c.is_public = true OR c.user_id = p_viewer_id)
  ORDER BY c.position, c.created_at DESC;
END;
$$;

-- 6. Function to get collection details with all products
CREATE OR REPLACE FUNCTION get_collection_products(
  p_collection_id UUID,
  p_viewer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  product_id UUID,
  name TEXT,
  price DECIMAL,
  sale_price DECIMAL,
  image_url TEXT,
  additional_images TEXT[],
  brand_id UUID,
  brand_name TEXT,
  brand_slug TEXT,
  like_count INTEGER,
  is_liked BOOLEAN,
  added_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_collection_owner UUID;
  v_is_public BOOLEAN;
BEGIN
  -- Get collection info
  SELECT user_id, collections.is_public INTO v_collection_owner, v_is_public
  FROM collections
  WHERE collections.id = p_collection_id;
  
  -- Check access
  IF NOT v_is_public AND v_collection_owner != p_viewer_id THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id as product_id,
    p.name,
    p.price,
    p.sale_price,
    p.image_url,
    p.additional_images,
    p.brand_id,
    b.name as brand_name,
    b.slug as brand_slug,
    p.like_count,
    EXISTS(
      SELECT 1 FROM user_likes_products ulp
      WHERE ulp.product_id = p.id AND ulp.user_id = p_viewer_id
    ) as is_liked,
    cp.added_at
  FROM collection_products cp
  JOIN products p ON p.id = cp.product_id
  JOIN brands b ON b.id = p.brand_id
  WHERE cp.collection_id = p_collection_id
  ORDER BY cp.position, cp.added_at DESC;
END;
$$;

-- 7. Function to create a new collection
CREATE OR REPLACE FUNCTION create_collection(
  p_user_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_collection_id UUID;
  v_position INTEGER;
BEGIN
  -- Get next position
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
  FROM collections
  WHERE user_id = p_user_id;
  
  -- Create collection
  INSERT INTO collections (user_id, name, description, position)
  VALUES (p_user_id, p_name, p_description, v_position)
  RETURNING id INTO v_collection_id;
  
  RETURN v_collection_id;
END;
$$;

-- 8. Function to update collection
CREATE OR REPLACE FUNCTION update_collection(
  p_user_id UUID,
  p_collection_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_cover_image_url TEXT DEFAULT NULL,
  p_is_public BOOLEAN DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_collection_owner UUID;
BEGIN
  -- Verify ownership
  SELECT user_id INTO v_collection_owner
  FROM collections
  WHERE id = p_collection_id;
  
  IF v_collection_owner != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Update fields that are provided
  UPDATE collections
  SET 
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    cover_image_url = COALESCE(p_cover_image_url, cover_image_url),
    is_public = COALESCE(p_is_public, is_public),
    updated_at = NOW()
  WHERE id = p_collection_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- 9. Function to delete collection
CREATE OR REPLACE FUNCTION delete_collection(
  p_user_id UUID,
  p_collection_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_collection_owner UUID;
BEGIN
  -- Verify ownership
  SELECT user_id INTO v_collection_owner
  FROM collections
  WHERE id = p_collection_id;
  
  IF v_collection_owner != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Delete collection (cascade will remove collection_products)
  DELETE FROM collections WHERE id = p_collection_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- 10. Enable RLS
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for collections
DROP POLICY IF EXISTS "Users can view public collections" ON collections;
CREATE POLICY "Users can view public collections" ON collections
  FOR SELECT USING (is_public = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own collections" ON collections;
CREATE POLICY "Users can create own collections" ON collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own collections" ON collections;
CREATE POLICY "Users can update own collections" ON collections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own collections" ON collections;
CREATE POLICY "Users can delete own collections" ON collections
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for collection_products
DROP POLICY IF EXISTS "Users can view collection products" ON collection_products;
CREATE POLICY "Users can view collection products" ON collection_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_id
        AND (c.is_public = true OR c.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own collection products" ON collection_products;
CREATE POLICY "Users can manage own collection products" ON collection_products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    )
  );

-- Verification
DO $$
BEGIN
  RAISE NOTICE '=== Collections Migration Complete ===';
  RAISE NOTICE 'Created tables: collections, collection_products';
  RAISE NOTICE 'Created functions:';
  RAISE NOTICE '  - add_product_to_collection (auto-likes product)';
  RAISE NOTICE '  - remove_product_from_collection';
  RAISE NOTICE '  - get_user_collections (with preview products)';
  RAISE NOTICE '  - get_collection_products';
  RAISE NOTICE '  - create_collection';
  RAISE NOTICE '  - update_collection';
  RAISE NOTICE '  - delete_collection';
  RAISE NOTICE 'RLS policies enabled';
END $$;
