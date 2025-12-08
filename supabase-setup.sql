-- a la Mode Database Setup Script
-- Run this entire script in Supabase SQL Editor

-- 1. CREATE TABLES
-- ================

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  bio TEXT,
  avatar_url TEXT,
  phone_number TEXT,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  liked_items_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Brands table
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  website_url TEXT NOT NULL,
  follower_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands(slug);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  image_url TEXT NOT NULL,
  additional_images TEXT[],
  product_url TEXT NOT NULL,
  like_count INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_like_count ON products(like_count DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_brand_external_id ON products(brand_id, external_id);

-- User follows brands
CREATE TABLE IF NOT EXISTS user_follows_brands (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  followed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_brands_user ON user_follows_brands(user_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_brands_brand ON user_follows_brands(brand_id);

-- User follows users
CREATE TABLE IF NOT EXISTS user_follows_users (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  followed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_users_follower ON user_follows_users(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_users_following ON user_follows_users(following_id);

-- User likes products
CREATE TABLE IF NOT EXISTS user_likes_products (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  liked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_likes_products_user ON user_likes_products(user_id);
CREATE INDEX IF NOT EXISTS idx_user_likes_products_product ON user_likes_products(product_id);
CREATE INDEX IF NOT EXISTS idx_user_likes_products_liked_at ON user_likes_products(liked_at DESC);

-- Product scrape logs
CREATE TABLE IF NOT EXISTS product_scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  products_added INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 2. CREATE FUNCTIONS & TRIGGERS
-- ==============================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, email, phone_number)
  VALUES (
    new.id,
    LOWER(COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    COALESCE(new.raw_user_meta_data->>'phone_number', new.phone)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update brand follower count
CREATE OR REPLACE FUNCTION update_brand_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE brands SET follower_count = follower_count + 1 WHERE id = NEW.brand_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE brands SET follower_count = follower_count - 1 WHERE id = OLD.brand_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_brand_followers ON user_follows_brands;
CREATE TRIGGER trigger_update_brand_followers
AFTER INSERT OR DELETE ON user_follows_brands
FOR EACH ROW EXECUTE FUNCTION update_brand_follower_count();

-- Function to update user follower counts
CREATE OR REPLACE FUNCTION update_user_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET follower_count = follower_count - 1 WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = following_count - 1 WHERE id = OLD.follower_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_followers ON user_follows_users;
CREATE TRIGGER trigger_update_user_followers
AFTER INSERT OR DELETE ON user_follows_users
FOR EACH ROW EXECUTE FUNCTION update_user_follower_count();

-- Function to update product like count
CREATE OR REPLACE FUNCTION update_product_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products SET like_count = like_count + 1 WHERE id = NEW.product_id;
    UPDATE profiles SET liked_items_count = liked_items_count + 1 WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products SET like_count = like_count - 1 WHERE id = OLD.product_id;
    UPDATE profiles SET liked_items_count = liked_items_count - 1 WHERE id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_likes ON user_likes_products;
CREATE TRIGGER trigger_update_product_likes
AFTER INSERT OR DELETE ON user_likes_products
FOR EACH ROW EXECUTE FUNCTION update_product_like_count();

-- 3. ENABLE ROW LEVEL SECURITY
-- ============================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_likes_products ENABLE ROW LEVEL SECURITY;

-- 4. CREATE RLS POLICIES
-- ======================

-- Profiles policies
CREATE POLICY "Public profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Brands policies
CREATE POLICY "Public brands" ON brands
  FOR SELECT USING (true);

-- Products policies
CREATE POLICY "Public products" ON products
  FOR SELECT USING (true);

-- User follows brands policies
CREATE POLICY "Users can see all brand follows" ON user_follows_brands
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own brand follows" ON user_follows_brands
  FOR ALL USING (auth.uid() = user_id);

-- User follows users policies
CREATE POLICY "Users can see all user follows" ON user_follows_users
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own user follows" ON user_follows_users
  FOR ALL USING (auth.uid() = follower_id);

-- User likes products policies
CREATE POLICY "Users can see all product likes" ON user_likes_products
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own product likes" ON user_likes_products
  FOR ALL USING (auth.uid() = user_id);

-- 5. CREATE VIEWS
-- ===============

-- User feed view
CREATE OR REPLACE VIEW user_feed AS
SELECT 
  p.*,
  b.name as brand_name,
  b.slug as brand_slug,
  b.logo_url as brand_logo,
  EXISTS(
    SELECT 1 FROM user_likes_products ulp 
    WHERE ulp.product_id = p.id 
    AND ulp.user_id = auth.uid()
  ) as is_liked_by_user
FROM products p
JOIN brands b ON p.brand_id = b.id
JOIN user_follows_brands ufb ON ufb.brand_id = b.id
WHERE ufb.user_id = auth.uid()
AND p.is_available = true
ORDER BY p.created_at DESC;

-- 6. INSERT INITIAL DATA
-- ======================

-- Insert brands
INSERT INTO brands (name, slug, website_url) VALUES
('Free People', 'free-people', 'https://www.freepeople.com'),
('REVOLVE', 'revolve', 'https://www.revolve.com'),
('Motel Rocks', 'motel', 'https://us.motelrocks.com'),
('ZARA', 'zara', 'https://www.zara.com'),
('Urban Outfitters', 'urban-outfitters', 'https://www.urbanoutfitters.com'),
('Anthropologie', 'anthropologie', 'https://www.anthropologie.com'),
('ASOS', 'asos', 'https://www.asos.com'),
('Nordstrom', 'nordstrom', 'https://www.nordstrom.com')
ON CONFLICT (slug) DO NOTHING;

-- Sample products (optional - remove if you'll be syncing real data immediately)
INSERT INTO products (brand_id, name, price, image_url, product_url, external_id) 
SELECT 
  b.id,
  'Sample ' || b.name || ' Product',
  89.99,
  'https://via.placeholder.com/400x600',
  b.website_url || '/sample-product',
  'sample-' || b.slug
FROM brands b
ON CONFLICT (brand_id, external_id) DO NOTHING;
