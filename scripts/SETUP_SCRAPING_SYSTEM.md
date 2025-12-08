# Setup Scraping System - Step by Step

Follow these steps in order to set up the brand scraping system.

## Step 1: Run Database Migrations

Run these SQL scripts **IN ORDER** in your Supabase SQL Editor:

### A. Add Brand Scraping Columns

```bash
# Copy and run: scripts/migration-add-brand-scraping-columns.sql
```

This adds:
- `platform` (shopify/custom)
- `is_active` (boolean)
- `description` (text)
- `scraper_config` (jsonb)
- `last_synced_at` (timestamp)
- `sync_frequency` (text)

### B. Add Product Variants Column

```bash
# Copy and run: scripts/migration-add-product-variants.sql
```

This adds:
- `variants` (jsonb) to products table
- Additional fields to `product_scrape_logs`

## Step 2: Seed Fashion Brands

After migrations are complete, run:

```bash
# Copy and run: scripts/seed-fashion-brands.sql
```

This adds all 22 fashion brands with their configurations.

## Step 3: Install Node Dependencies

```bash
npm install
```

This installs `jsdom` needed for HTML parsing.

## Step 4: Test a Scraper

```bash
# Test with a reliable Shopify brand first
npm run test-scraper free-people
```

Expected output:
```
✅ Found brand: Free People
🔧 Using scraper: ShopifyScraper
✅ Fetched 247 products in 12.3s
📦 Sample Products (first 5):
...
✅ Valid products: 245 (99.2%)
```

## Step 5: Sync Your First Brand

```bash
# Sync Free People products to database
npm run sync-brands free-people
```

Expected output:
```
🚀 Syncing: Free People (free-people)
✅ Fetched 247 products from Shopify API
  ✅ Added: Bella Dress
  ✅ Added: Sunset Sweater
  ...
📊 Summary
   ➕ Added: 247
   🔄 Updated: 0
   ❌ Failed: 0
```

## Step 6: Verify Products in Database

Run this SQL to check:

```sql
-- Check products were added
SELECT 
  b.name,
  COUNT(p.id) as product_count,
  MAX(p.created_at) as latest_product
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
GROUP BY b.name
ORDER BY product_count DESC;
```

## Step 7: Follow Brands in Your App

To see products in your feed, follow the brands:

```sql
-- Follow all brands (replace with your user ID)
INSERT INTO user_follows_brands (user_id, brand_id)
SELECT '<YOUR-USER-ID>'::uuid, id FROM brands
ON CONFLICT DO NOTHING;

-- OR follow specific brands
INSERT INTO user_follows_brands (user_id, brand_id)
SELECT '<YOUR-USER-ID>'::uuid, id FROM brands 
WHERE slug IN ('free-people', 'zara', 'urban-outfitters')
ON CONFLICT DO NOTHING;
```

## Step 8: Test More Brands

Once Free People works, test other brands:

```bash
# Shopify brands (most reliable)
npm run test-scraper urban-outfitters
npm run test-scraper anthropologie
npm run test-scraper edikted

# Custom platform brands
npm run test-scraper zara
npm run test-scraper hm
npm run test-scraper aritzia
```

## Step 9: Sync All Brands

When individual brands work:

```bash
# Sync all active brands
npm run sync-brands

# OR sync only new arrivals (faster)
npm run sync-brands -- --new-only
```

## Step 10: Set Up Automation (Optional)

Choose one method:

### Option A: GitHub Actions
Create `.github/workflows/sync-brands.yml`:

```yaml
name: Sync Brand Products
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run sync-brands
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### Option B: Supabase pg_cron
Run: `scripts/setup-brand-sync-cron.sql`

### Option C: Server Cron Job
```bash
# Add to crontab
0 */6 * * * cd /path/to/project && npm run sync-brands >> logs/sync.log 2>&1
```

## Troubleshooting

### Migration Issues
If migrations fail, check if columns already exist:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'brands';
```

### Scraper Test Fails
- Check network connectivity
- Verify brand website is accessible
- Review error message in output
- Try a different brand

### No Products After Sync
- Check `product_scrape_logs` table for errors
- Verify brand `is_active = true`
- Check `scraper_config` is set correctly

### Products Not in Feed
- Ensure you're following the brand
- Check products have `is_available = true`
- Verify RLS policies are correct

## Quick Commands Reference

```bash
# Testing (no database changes)
npm run test-scraper <brand-slug>

# Syncing (saves to database)
npm run sync-brands                    # All brands
npm run sync-brands <brand-slug>       # Single brand
npm run sync-brands -- --new-only      # Only new arrivals

# Monitoring
# Run SQL: SELECT * FROM brand_sync_stats;
```

## Success Checklist

- [ ] Migrations completed successfully
- [ ] All 22 brands seeded to database
- [ ] `jsdom` npm package installed
- [ ] Free People scraper test passes
- [ ] Free People sync completes successfully
- [ ] Products visible in Supabase products table
- [ ] Following brands in app
- [ ] Products appear in app feed
- [ ] Additional brands tested and synced
- [ ] Automation set up (optional)

---

**Need Help?**
- Check `BRAND_SCRAPING_GUIDE.md` for detailed docs
- Review `product_scrape_logs` for sync errors
- Test scrapers individually before full sync
- Verify database schema matches migrations
