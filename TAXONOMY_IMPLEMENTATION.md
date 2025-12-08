# Shopify Product Taxonomy Integration

## Overview

We're integrating [Shopify's Standard Product Taxonomy](https://github.com/Shopify/product-taxonomy) into the app for professional, standardized product categorization.

**Benefits:**
- ✅ Industry-standard categories recognized across platforms
- ✅ Better search and filtering
- ✅ Consistent categorization across all brands
- ✅ 1,000+ specific categories for fashion & accessories
- ✅ Future-proof (maintained by Shopify)

---

## Taxonomy Structure for Fashion

### Main Vertical: `Apparel & Accessories` (aa)

**Key Categories for Your Brands:**

```
Apparel & Accessories (aa)
├── Clothing (aa-1)
│   ├── Activewear (aa-1-1)
│   │   ├── Activewear Pants (aa-1-1-1)
│   │   │   ├── Leggings
│   │   │   ├── Joggers
│   │   │   └── Shorts
│   │   ├── Activewear Tops (aa-1-1-2)
│   │   └── Sports Bras
│   ├── Dresses (aa-1-4)
│   │   ├── Mini Dresses
│   │   ├── Midi Dresses
│   │   ├── Maxi Dresses
│   │   └── Casual Dresses
│   ├── One-Pieces (aa-1-5)
│   │   ├── Jumpsuits
│   │   └── Rompers
│   ├── Outerwear (aa-1-6)
│   │   ├── Coats
│   │   ├── Jackets
│   │   └── Vests
│   ├── Pants (aa-1-7)
│   │   ├── Jeans
│   │   ├── Trousers
│   │   └── Cargo Pants
│   ├── Shorts (aa-1-8)
│   ├── Skirts (aa-1-9)
│   ├── Sleepwear & Loungewear (aa-1-10)
│   ├── Suits (aa-1-11)
│   ├── Swimwear & Beachwear (aa-1-12)
│   │   ├── Bikinis
│   │   ├── One-Piece Swimsuits
│   │   ├── Cover-Ups
│   │   └── Swim Bottoms
│   ├── Tops (aa-1-13)
│   │   ├── Blouses
│   │   ├── Camisoles
│   │   ├── Crop Tops
│   │   ├── Tank Tops
│   │   ├── T-Shirts
│   │   └── Sweaters
│   └── Underwear & Socks (aa-1-14)
└── Accessories (aa-2)
    ├── Bags (aa-2-1)
    ├── Belts (aa-2-2)
    ├── Hats (aa-2-3)
    ├── Jewelry (aa-2-4)
    └── Sunglasses (aa-2-5)
```

---

## Database Schema Changes

### 1. Add Taxonomy Columns to `products` Table

```sql
ALTER TABLE products
ADD COLUMN IF NOT EXISTS taxonomy_id TEXT,
ADD COLUMN IF NOT EXISTS taxonomy_category_name TEXT,
ADD COLUMN IF NOT EXISTS taxonomy_full_path TEXT,
ADD COLUMN IF NOT EXISTS taxonomy_level INTEGER,
ADD COLUMN IF NOT EXISTS taxonomy_attributes JSONB DEFAULT '[]'::jsonb;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_products_taxonomy_id ON products(taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_products_taxonomy_category_name ON products(taxonomy_category_name);
```

### 2. Create `product_categories` Lookup Table

```sql
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,  -- gid://shopify/TaxonomyCategory/aa-1-4-1
  name TEXT NOT NULL,  -- Mini Dresses
  full_name TEXT NOT NULL,  -- Apparel & Accessories > Clothing > Dresses > Mini Dresses
  parent_id TEXT,
  level INTEGER NOT NULL,
  vertical TEXT NOT NULL,  -- Apparel & Accessories
  attributes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_name ON product_categories(name);
CREATE INDEX IF NOT EXISTS idx_product_categories_vertical ON product_categories(vertical);
```

---

## Implementation Steps

### Step 1: Run Database Migration

File: `scripts/migration-add-taxonomy-support.sql`

```bash
# In Supabase SQL Editor, run:
scripts/migration-add-taxonomy-support.sql
```

### Step 2: Load Taxonomy Data

File: `scripts/load-taxonomy-categories.js`

```bash
# Load Shopify taxonomy into database
node scripts/load-taxonomy-categories.js
```

This will:
- Parse `scripts/shopify-taxonomy.json`
- Extract "Apparel & Accessories" vertical
- Load ~1,000 categories into `product_categories` table

### Step 3: Update Scrapers to Use Taxonomy

File: `scripts/scrapers/taxonomy-classifier.js`

The classifier uses:
- **Keywords matching** - "dress" → Dresses category
- **Product type hints** - from brand data
- **Title analysis** - "Mini Black Dress" → Mini Dresses
- **Fallback categories** - when unclear

### Step 4: Reclassify Existing Products (Optional)

```bash
# Update existing 6,285 products with taxonomy
node scripts/reclassify-existing-products.js
```

---

## How Classification Works

### Example 1: "Lola Cream Slip Midi Dress"

```javascript
Input: "Lola Cream Slip Midi Dress"

Analysis:
- Contains "midi dress" → Dresses category
- Specific: "midi" → Midi Dresses subcategory

Result:
taxonomy_id: "gid://shopify/TaxonomyCategory/aa-1-4-2"
taxonomy_category_name: "Midi Dresses"
taxonomy_full_path: "Apparel & Accessories > Clothing > Dresses > Midi Dresses"
taxonomy_level: 3
```

### Example 2: "High-Waisted Wide Leg Jeans"

```javascript
Input: "High-Waisted Wide Leg Jeans"

Analysis:
- Contains "jeans" → Pants category
- Specific: "jeans" → Jeans subcategory

Result:
taxonomy_id: "gid://shopify/TaxonomyCategory/aa-1-7-2"
taxonomy_category_name: "Jeans"
taxonomy_full_path: "Apparel & Accessories > Clothing > Pants > Jeans"
taxonomy_level: 3
```

### Example 3: "Ribbed Crop Tank Top"

```javascript
Input: "Ribbed Crop Tank Top"

Analysis:
- Contains "tank top" → Tops category
- Specific: "tank top" → Tank Tops subcategory

Result:
taxonomy_id: "gid://shopify/TaxonomyCategory/aa-1-13-11"
taxonomy_category_name: "Tank Tops"
taxonomy_full_path: "Apparel & Accessories > Clothing > Tops > Tank Tops"
taxonomy_level: 3
```

---

## Filtering & Search with Taxonomy

### In Your App

```typescript
// Filter by category
const dresses = await supabase
  .from('products')
  .select('*')
  .eq('taxonomy_category_name', 'Dresses');

// Filter by subcategory
const midiDresses = await supabase
  .from('products')
  .select('*')
  .eq('taxonomy_id', 'gid://shopify/TaxonomyCategory/aa-1-4-2');

// Get all tops (any subcategory)
const tops = await supabase
  .from('products')
  .select('*')
  .like('taxonomy_full_path', '%> Tops%');
```

### Category Browse UI

```
Shop by Category
├── Dresses (714 items)
│   ├── Mini Dresses (245)
│   ├── Midi Dresses (321)
│   └── Maxi Dresses (148)
├── Tops (1,234 items)
│   ├── T-Shirts (432)
│   ├── Tank Tops (289)
│   └── Blouses (156)
└── Pants (892 items)
    ├── Jeans (567)
    └── Trousers (234)
```

---

## Attributes (Future Enhancement)

Shopify taxonomy also includes attributes per category:

**For Dresses:**
- `neckline` - v-neck, scoop, off-shoulder
- `sleeve_length` - sleeveless, short, long
- `dress_length` - mini, midi, maxi
- `color` - black, white, floral
- `pattern` - solid, striped, floral
- `material` - cotton, silk, polyester

**For Swimwear:**
- `swimwear_coverage` - full, moderate, minimal
- `swimwear_style` - bikini, one-piece, tankini
- `color`
- `pattern`

These can be added later for advanced filtering.

---

## Migration Plan

### Phase 1: Database Setup (Today)
- ✅ Run migration SQL
- ✅ Load taxonomy data
- ⏳ Verify categories loaded

### Phase 2: Scraper Integration (This Week)
- Update `base-scraper.js` to classify products
- Test with new syncs
- Products get auto-classified on import

### Phase 3: Reclassify Existing (Optional)
- Run reclassification script on 6,285 existing products
- Review and fix any misclassifications
- Update `category` column to match taxonomy

### Phase 4: App UI (Later)
- Add category browse screen
- Update filters to use taxonomy
- Show category breadcrumbs on product pages

---

## Files Created

1. `scripts/migration-add-taxonomy-support.sql` - Database changes
2. `scripts/load-taxonomy-categories.js` - Load taxonomy into DB
3. `scripts/scrapers/taxonomy-classifier.js` - Classification logic
4. `scripts/reclassify-existing-products.js` - Update existing products
5. `scripts/shopify-taxonomy.json` - Taxonomy data (downloaded)

---

## Commands

```bash
# 1. Download taxonomy
curl -o scripts/shopify-taxonomy.json \
  https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.json

# 2. Run migration in Supabase
# (Run scripts/migration-add-taxonomy-support.sql in SQL Editor)

# 3. Load taxonomy
node scripts/load-taxonomy-categories.js

# 4. Future syncs will auto-classify
npm run sync-brands edikted

# 5. Reclassify existing products (optional)
node scripts/reclassify-existing-products.js
```

---

## Testing

### Verify Taxonomy Loaded

```sql
-- Check categories loaded
SELECT COUNT(*) FROM product_categories;
-- Should return ~1,000 categories

-- See top-level categories
SELECT * FROM product_categories WHERE level = 1;

-- See dress subcategories
SELECT * FROM product_categories WHERE parent_id = 'gid://shopify/TaxonomyCategory/aa-1-4';
```

### Test Classification

```bash
# Sync a brand and check taxonomy
npm run sync-brands doen

# Check results
SELECT 
  name,
  taxonomy_category_name,
  taxonomy_full_path
FROM products
WHERE brand_id = (SELECT id FROM brands WHERE slug = 'doen')
LIMIT 10;
```

---

## Benefits for Your App

### Better Discovery
- Users browse by specific categories
- "Show me all Mini Dresses" works instantly
- Consistent categorization across brands

### Better Filtering
- Filter by multiple categories at once
- Category + color + price range
- "Midi Dresses under $100 in black"

### Professional Standards
- Same categories as Shopify, Amazon, Google Shopping
- Ready for marketplace integrations
- Better for SEO and product feeds

### Scalable
- Add more verticals later (Shoes, Beauty, Home)
- Taxonomy updates from Shopify automatically
- No manual category management needed

---

Ready to implement? Let me know and I'll create all the files!
