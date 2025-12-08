# Product Sync Setup Guide

## Step 1: Add Your Apify API Token to .env

1. **Get your Apify API token:**
   - Go to https://console.apify.com/account/integrations
   - Copy your API token

2. **Add to your .env file:**
   ```bash
   # Add this line to your .env file (NOT .env.example)
   APIFY_API_TOKEN=your_apify_api_token_here
   ```

---

## Step 2: Configure Rad Swim in Supabase

Run this SQL in your Supabase SQL Editor to configure Rad Swim with the Apify dataset:

```sql
-- Configure Rad Swim with Apify dataset
UPDATE brands 
SET 
  scraper_config = jsonb_build_object(
    'apify_dataset_id', '2lcNqSZpvXJgZzrFn',
    'scraper_type', 'shopify',
    'category', 'swimwear'
  ),
  platform = 'shopify',
  sync_frequency = 'daily',
  is_active = true
WHERE slug = 'rad-swim';

-- Verify the configuration
SELECT 
  name, 
  slug, 
  platform, 
  sync_frequency,
  is_active,
  scraper_config
FROM brands 
WHERE slug = 'rad-swim';
```

Expected result:
```
name      | Rad Swim
slug      | rad-swim
platform  | shopify
sync_frequency | daily
is_active | true
scraper_config | {"apify_dataset_id": "2lcNqSZpvXJgZzrFn", "scraper_type": "shopify", "category": "swimwear"}
```

---

## Step 3: Test the Sync Script

Now you can run the sync script to import Rad Swim products:

```bash
# From your project root
node scripts/sync-products-from-apify.js rad-swim
```

### What to Expect:

```
🚀 Starting product sync for brand: rad-swim

✅ Found brand: Rad Swim
📥 Fetching products from Apify dataset: 2lcNqSZpvXJgZzrFn
✅ Fetched 68 products from Apify

  ✅ Added: Jenna - Royal Blue Zipper One-Piece Swimsuit *New*
  ✅ Added: Capri - Heart Back Black One-Piece
  ✅ Added: Lola - White Eyelet Tankini
  ... (more products)

📊 Sync Summary for Rad Swim
   ➕ Products added: 68
   🔄 Products updated: 0
   ❌ Products failed: 0
   ⏱️  Execution time: 12s

✅ Sync complete!
```

---

## Step 4: Verify Products Were Imported

Run this SQL in Supabase to check:

```sql
-- Check products imported for Rad Swim
SELECT 
  p.name,
  p.price,
  p.image_url,
  p.is_available,
  array_length(p.variants, 1) as variant_count,
  (SELECT string_agg(c.name, ', ') 
   FROM product_categories pc 
   JOIN categories c ON c.id = pc.category_id 
   WHERE pc.product_id = p.id) as categories
FROM products p
JOIN brands b ON p.brand_id = b.id
WHERE b.slug = 'rad-swim'
ORDER BY p.created_at DESC
LIMIT 10;
```

---

## Step 5: View Products in Your App

The products should now appear in your app's feed if:
1. You're logged in
2. You follow the Rad Swim brand

**To follow Rad Swim:**
```sql
-- Get your user ID (replace with your actual user email)
SELECT id FROM profiles WHERE username = 'your-username';

-- Follow Rad Swim (replace <your-user-id> with actual UUID)
INSERT INTO user_follows_brands (user_id, brand_id)
SELECT 
  '<your-user-id>'::uuid,
  b.id
FROM brands b
WHERE b.slug = 'rad-swim';
```

---

## Troubleshooting

### Error: "Brand not found"
- Make sure you ran the migration script
- Check that Rad Swim exists: `SELECT * FROM brands WHERE slug = 'rad-swim';`

### Error: "No Apify dataset ID configured"
- Run the UPDATE query from Step 2 again
- Verify with: `SELECT scraper_config FROM brands WHERE slug = 'rad-swim';`

### Error: "APIFY_API_TOKEN not found"
- Make sure you added it to your `.env` file (not `.env.example`)
- Restart your terminal if you just added it

### Products showing but no images
- Check that `image_url` is populated
- Shopify CDN URLs should work directly
- Run: `SELECT name, image_url FROM products LIMIT 5;`

### Products not appearing in app feed
- Make sure you're following the brand
- Check that products have `is_available = true`
- Verify categories are assigned

---

## Next Steps

Once Rad Swim sync works:
1. ✅ Add 19 more brands to the database
2. ✅ Configure their Apify datasets
3. ✅ Run sync for each brand
4. ✅ Set up automated daily cron job

---

## Adding More Brands

### For Shopify Brands:
1. Run the Shopify scraper actor on Apify
2. Get the dataset ID from the run
3. Add brand to database:
   ```sql
   INSERT INTO brands (name, slug, website_url, platform, is_active)
   VALUES ('Brand Name', 'brand-slug', 'https://brandsite.com', 'shopify', true);
   ```
4. Configure scraper:
   ```sql
   UPDATE brands 
   SET scraper_config = jsonb_build_object(
     'apify_dataset_id', 'your-dataset-id'
   )
   WHERE slug = 'brand-slug';
   ```
5. Run sync: `node scripts/sync-products-from-apify.js brand-slug`

### For Custom Site Brands (ZARA, Free People, etc.):
- Use specific Apify actors for those sites
- Same process as above, just different dataset IDs
- Set `platform = 'custom'`

---

## Script Reference

**Sync single brand:**
```bash
node scripts/sync-products-from-apify.js <brand-slug>
```

**Category mapping:**
The script automatically maps these source categories:
- 'swimwear', 'swim' → swimwear
- 'one-piece', 'tankini' → one-piece
- 'bikini', 'bikinis' → bikinis
- 'cover-up' → cover-ups
- 'rash guard' → rash-guards

You can customize this in the `CATEGORY_MAPPING` object in the script.

---

## Data Structure

**Product variants** are stored as JSON:
```json
[
  {
    "id": "45362877792412",
    "title": "XS",
    "options": ["XS"],
    "price": {
      "current": 7400,
      "previous": 0,
      "stockStatus": "InStock"
    }
  }
]
```

**Brand scraper config:**
```json
{
  "apify_dataset_id": "2lcNqSZpvXJgZzrFn",
  "scraper_type": "shopify",
  "category": "swimwear"
}
```
