# a la Mode Database Schema

## Core Tables

### 1. profiles (extends Supabase Auth users)
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  phone_number TEXT,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  liked_items_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for username searches
CREATE INDEX idx_profiles_username ON profiles(username);
```

### 2. brands
```sql
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- for URLs like 'free-people'
  logo_url TEXT,
  website_url TEXT NOT NULL,
  follower_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for brand searches
CREATE INDEX idx_brands_name ON brands(name);
CREATE INDEX idx_brands_slug ON brands(slug);
```

### 3. products
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  external_id TEXT, -- ID from the brand's website
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  image_url TEXT NOT NULL,
  additional_images TEXT[], -- Array of additional image URLs
  product_url TEXT NOT NULL, -- Link to product on brand website
  like_count INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_products_brand_id ON products(brand_id);
CREATE INDEX idx_products_created_at ON products(created_at DESC);
CREATE INDEX idx_products_like_count ON products(like_count DESC);
-- Ensure we don't duplicate products from the same brand
CREATE UNIQUE INDEX idx_products_brand_external_id ON products(brand_id, external_id);
```

## Relationship Tables

### 4. user_follows_brands
```sql
CREATE TABLE user_follows_brands (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  followed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, brand_id)
);

-- Indexes for queries
CREATE INDEX idx_user_follows_brands_user ON user_follows_brands(user_id);
CREATE INDEX idx_user_follows_brands_brand ON user_follows_brands(brand_id);
```

### 5. user_follows_users
```sql
CREATE TABLE user_follows_users (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  followed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id) -- Can't follow yourself
);

-- Indexes for queries
CREATE INDEX idx_user_follows_users_follower ON user_follows_users(follower_id);
CREATE INDEX idx_user_follows_users_following ON user_follows_users(following_id);
```

### 6. user_likes_products
```sql
CREATE TABLE user_likes_products (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  liked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

-- Indexes for queries
CREATE INDEX idx_user_likes_products_user ON user_likes_products(user_id);
CREATE INDEX idx_user_likes_products_product ON user_likes_products(product_id);
CREATE INDEX idx_user_likes_products_liked_at ON user_likes_products(liked_at DESC);
```

## Helper Tables

### 7. product_scrape_logs
```sql
CREATE TABLE product_scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'success', 'failed', 'partial'
  products_added INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

## Functions & Triggers

### Update follower/following counts
```sql
-- Function to update follower counts when user follows/unfollows brand
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

CREATE TRIGGER trigger_update_brand_followers
AFTER INSERT OR DELETE ON user_follows_brands
FOR EACH ROW EXECUTE FUNCTION update_brand_follower_count();

-- Similar functions for user follower counts and product like counts
```

## Row Level Security (RLS) Policies

### Enable RLS on all tables
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_likes_products ENABLE ROW LEVEL SECURITY;
```

### Example policies for profiles table
```sql
-- Anyone can view profiles
CREATE POLICY "Profiles are viewable by everyone" 
ON profiles FOR SELECT 
USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);
```

## Views for Common Queries

### Feed view - Products from followed brands
```sql
CREATE VIEW user_feed AS
SELECT 
  p.*,
  b.name as brand_name,
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
```

## Initial Data Seeds

```sql
-- Insert popular brands
INSERT INTO brands (name, slug, website_url) VALUES
('Free People', 'free-people', 'https://www.freepeople.com'),
('REVOLVE', 'revolve', 'https://www.revolve.com'),
('Motel Rocks', 'motel', 'https://us.motelrocks.com'),
('ZARA', 'zara', 'https://www.zara.com'),
('Urban Outfitters', 'urban-outfitters', 'https://www.urbanoutfitters.com'),
('Anthropologie', 'anthropologie', 'https://www.anthropologie.com');
```
