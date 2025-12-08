# Database Migration Instructions

## Step 1: Run the Migration Script

### Option A: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `oeztavlkbkxhcpjkdxry`

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "+ New Query"

3. **Copy & Paste Migration**
   - Open: `/Users/imacpro/new1/scripts/migration-add-categories-and-platform-support.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Run the Migration**
   - Click "Run" (or press Cmd+Enter)
   - Wait for success message
   - You should see: "Categories created: 18" (or similar)

5. **Verify Success**
   - Check the output shows counts of categories and brands
   - No error messages appear

### Option B: Supabase CLI (If you have it installed)

```bash
# From project root
supabase db push
```

---

## Step 2: Verify the Migration

Run this query in SQL Editor to verify everything worked:

```sql
-- Check new tables exist
SELECT 
  table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('categories', 'product_categories')
ORDER BY table_name;

-- Check new brand columns exist
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'brands' 
  AND column_name IN ('platform', 'scraper_config', 'sync_frequency', 'is_active', 'last_synced_at')
ORDER BY column_name;

-- Check categories were created
SELECT 
  name, 
  slug, 
  (SELECT name FROM categories p WHERE p.id = c.parent_id) as parent
FROM categories c
ORDER BY parent NULLS FIRST, name;

-- Check products table has variants column
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name = 'variants';
```

Expected results:
- ✅ 2 tables: `categories`, `product_categories`
- ✅ 5 new brand columns
- ✅ ~18 categories (5 top-level + 13 sub-categories)
- ✅ 1 variants column in products

---

## Step 3: Understanding What Changed

### New Tables

**`categories`**
- Stores your normalized category taxonomy
- Supports parent/child relationships
- 18 categories pre-populated (clothing, swimwear, etc.)

**`product_categories`**
- Junction table linking products to categories
- A product can have multiple categories

### Updated Tables

**`brands`** - New columns:
- `platform` → 'shopify', 'custom', 'woocommerce', etc.
- `scraper_config` → JSON with Apify actor IDs, dataset IDs
- `sync_frequency` → 'daily', 'weekly', 'hourly'
- `is_active` → Enable/disable syncing without deleting brand
- `last_synced_at` → Track when last scraped

**`products`** - New column:
- `variants` → JSON array of size/color options with prices

**`product_scrape_logs`** - New columns:
- `category` → Which category was scraped
- `apify_dataset_id` → Link back to Apify dataset
- `apify_run_id` → Link to specific Apify run
- `products_removed` → Track discontinued items
- `execution_time_seconds` → Performance monitoring

---

## Troubleshooting

### Error: "relation already exists"
This is OK! It means you already ran part of the migration. The `IF NOT EXISTS` clauses prevent errors.

### Error: "column already exists"
This is OK! Same as above - the `IF NOT EXISTS` prevents duplication.

### Error: "permission denied"
Make sure you're logged into the correct Supabase project and have admin access.

---

## Next Steps

After successful migration:
1. ✅ Categories and platform support are ready
2. ⏭️ Next: Build the Apify → Supabase transformation script
3. ⏭️ Then: Configure your first brand (Rad Swim) with Apify credentials

Let me know when the migration is complete and we'll move to the next step!
