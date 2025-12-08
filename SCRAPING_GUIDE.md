# Brand Scraping System - Complete Guide

**Last Updated**: December 8, 2025  
**Current Status**: 7 working brands, 6,285+ products synced

---

## Quick Start (3 Steps)

### 1. Database Setup (One Time)
```bash
# Run in Supabase SQL Editor
# File: scripts/COMPLETE_SETUP.sql
```
This adds 22 brands and all necessary database columns.

### 2. Install Dependencies (One Time)
```bash
npm install
```

### 3. Test & Sync
```bash
# Test a scraper
npm run test-scraper edikted

# Sync products
npm run sync-brands edikted
```

---

## Working Brands (7 Total - 6,285 Products)

### 🔥 Best Performers
1. **Edikted** - 2,500 products - Gen Z fast fashion
2. **DISSH** - 1,690 products - Australian boutique
3. **Doen** - 714 products - Vintage-inspired

### ✅ Solid Options
4. **Damson Madder** - 394 products - Contemporary vintage
5. **With Jean** - 387 products - Premium denim
6. **Miaou** - 375 products - Contemporary corsets
7. **Rad Swim** - 225 products - Swimwear

### ❌ Not Working
- Steele, Rumored, Sisters & Seekers, Handover, Design By Si
- Free People, Urban Outfitters, Anthropologie (block scraping)
- H&M, Zara, Aritzia (need custom scrapers)

---

## Common Commands

### Testing (No Database Changes)
```bash
# Test scraper before syncing
npm run test-scraper <brand-slug>

# Examples:
npm run test-scraper edikted
npm run test-scraper dissh
npm run test-scraper doen
```

**What it shows:**
- Number of products found
- Validation results
- Sample product data
- Price ranges
- No database writes

### Syncing (Adds to Database)
```bash
# Sync one brand
npm run sync-brands <brand-slug>

# Sync all brands (takes ~10-15 min)
npm run sync-brands

# Sync only new arrivals (faster)
npm run sync-brands -- --new-only
```

**What it does:**
- Fetches products from brand website
- Normalizes data
- Adds to database
- Updates brand sync status
- Logs results

### Monitoring
```sql
-- See products per brand
SELECT 
  b.name,
  COUNT(p.id) as products,
  MAX(p.created_at) as last_added
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
GROUP BY b.name
ORDER BY products DESC;

-- See recent products
SELECT 
  b.name,
  p.name,
  p.price,
  p.created_at
FROM products p
JOIN brands b ON b.id = p.brand_id
ORDER BY p.created_at DESC
LIMIT 20;

-- Check sync status
SELECT * FROM brand_sync_stats;
```

---

## How It Works

### Architecture

```
sync-all-brands.js (orchestrator)
    ↓
Determines brand platform → Shopify or Custom
    ↓
Loads appropriate scraper:
- shopify-scraper.js → For Shopify stores
- custom-scrapers.js → For other platforms
    ↓
Both extend base-scraper.js (shared logic)
    ↓
Products normalized and saved to database
```

### Shopify Scraper
**Works with**: Most Shopify stores  
**Method**: Uses Shopify's JSON API (`/products.json`)  
**Success rate**: ~60% (some stores block it)

**Fallback chain:**
1. Try `/products.json` (most reliable)
2. Try collection endpoint
3. Try sitemap parsing

**Files:**
- `scripts/scrapers/shopify-scraper.js`
- `scripts/scrapers/base-scraper.js`

### Custom Scrapers
**For**: Non-Shopify brands (Zara, H&M, Aritzia)  
**Status**: Implemented but not tested yet  
**File**: `scripts/scrapers/custom-scrapers.js`

---

## Database Schema

### Key Tables

**brands**
- `id`, `name`, `slug`, `website_url`
- `platform` - 'shopify' or 'custom'
- `is_active` - enable/disable scraping
- `scraper_config` - JSONB config
- `last_synced_at` - timestamp
- `follower_count` - updated by trigger

**products**
- `id`, `name`, `description`, `price`
- `brand_id` - foreign key
- `external_id` - brand's product ID
- `external_url` - product page
- `image_url`, `category`
- `variants` - JSONB (sizes, colors, etc.)
- `like_count` - updated by trigger
- `is_available` - in stock status

**product_scrape_logs**
- Tracks each sync attempt
- `status` - 'success' or 'failed'
- `products_added`, `products_updated`
- `error_message` if failed

---

## Troubleshooting

### "Brand not found"
→ Run `scripts/COMPLETE_SETUP.sql` in Supabase

### Test shows 0 products / 404 errors
→ Brand may not be on Shopify or blocks scraping  
→ Try a different brand from the working list above

### "jsdom not found"
→ Run `npm install`

### Sync takes too long
→ Use `npm run sync-brands -- --new-only` for faster syncs

### Products not showing in app
→ Make sure you're following brands:
```sql
-- Get your user ID
SELECT id FROM profiles WHERE email = 'your-email@example.com';

-- Follow a brand (replace IDs)
INSERT INTO user_follows_brands (user_id, brand_id)
SELECT '<your-user-id>', id FROM brands WHERE slug = 'edikted';
```

### Follower counts not updating
→ Run `scripts/fix-follower-counts.sql` in Supabase

---

## Brand Configuration

### Adding a New Brand (Shopify)

1. **Add to database:**
```sql
INSERT INTO brands (name, slug, website_url, platform, is_active, scraper_config)
VALUES (
  'Brand Name',
  'brand-slug',
  'https://brandname.com',
  'shopify',
  true,
  jsonb_build_object(
    'scraper_type', 'shopify',
    'new_arrivals_path', '/collections/new-arrivals'
  )
);
```

2. **Test it:**
```bash
npm run test-scraper brand-slug
```

3. **If it works, sync it:**
```bash
npm run sync-brands brand-slug
```

### Checking if a Site is Shopify
```bash
curl -I https://brandname.com/products.json

# If you get 200 OK with JSON → It's Shopify
# If you get 404 Not Found → Not Shopify or blocks API
# If you get 403 Forbidden → Shopify but blocks scraping
```

---

## Product Taxonomy

**New Feature**: All products are automatically classified using [Shopify's Standard Product Taxonomy](https://github.com/Shopify/product-taxonomy).

### Benefits
- ✅ Industry-standard categories (same as Shopify, Amazon, Google Shopping)
- ✅ Better filtering & search ("Show me all Midi Dresses")
- ✅ Consistent categorization across all brands
- ✅ 1,000+ specific categories for fashion

### Auto-Classification
Products are automatically categorized when synced:
- "Lola Cream Slip Midi Dress" → **Midi Dresses**
- "High-Waisted Wide Leg Jeans" → **Jeans**
- "Ribbed Crop Tank Top" → **Tank Tops**

### Filtering by Category
```sql
-- Get all dresses
SELECT * FROM products WHERE taxonomy_category_name = 'Dresses';

-- Get specific subcategory
SELECT * FROM products WHERE taxonomy_id = 'gid://shopify/TaxonomyCategory/aa-1-4-2';

-- Count products per category
SELECT * FROM category_product_counts;
```

**Full implementation details**: See [TAXONOMY_IMPLEMENTATION.md](TAXONOMY_IMPLEMENTATION.md)

---

## File Structure

### Main Files (Keep These)
```
/scripts/
  scrapers/
    base-scraper.js       # Shared logic
    shopify-scraper.js    # Shopify stores
    custom-scrapers.js    # Custom platforms
  sync-all-brands.js      # Main orchestrator
  test-scraper.js         # Testing utility
  COMPLETE_SETUP.sql      # Database setup
  seed-fashion-brands.sql # Brand data
  fix-follower-counts.sql # Fix triggers
```

### Documentation (This File)
```
SCRAPING_GUIDE.md         # ← YOU ARE HERE (main guide)
FIXING_FOLLOWER_COUNTS.md # Specific troubleshooting
```

---

## Performance Tips

### Faster Syncing
```bash
# Only sync products from last 30 days
npm run sync-brands -- --new-only

# Sync one brand at a time during testing
npm run sync-brands edikted
```

### Rate Limiting
The scrapers include automatic delays:
- 1-2 seconds between requests
- 3 retry attempts with exponential backoff
- Prevents getting blocked

### Database Performance
```sql
-- Indexes already created by setup script:
- idx_brands_is_active
- idx_brands_platform  
- idx_products_brand_id
- idx_products_external_id
```

---

## Next Steps

### If You Want More Brands
1. Test failed brands individually to debug
2. Implement custom scrapers for non-Shopify brands
3. Use Apify actors for blocked brands (Free People, etc.)

### If You're Happy With Current Brands
1. Set up automated syncing (GitHub Actions or cron)
2. Monitor sync logs weekly
3. Add new brands as needed

### Automation (Optional)
See `scripts/setup-brand-sync-cron.sql` for:
- Daily full syncs
- 6-hourly priority brand syncs
- 2-hourly new arrival checks

---

## Support & Resources

**Test before syncing**: Always run `test-scraper` first  
**Start small**: Test one brand at a time  
**Check logs**: Query `product_scrape_logs` for errors  
**Commit often**: Keep Git history clean

**Having issues?** Check:
1. Is the brand actually on Shopify? (curl test above)
2. Does test-scraper find products?
3. Are database migrations applied?
4. Are node_modules installed?

---

## Summary

**Current Status:**
- ✅ 7 working brands
- ✅ 6,285+ products
- ✅ Database properly configured
- ✅ Backed up to GitHub

**What Works:**
- Shopify scraping for most stores
- Testing without database changes
- Automatic product normalization
- Duplicate prevention (by external_id)

**What's Next:**
- Add more brands as needed
- Set up automation (optional)
- Monitor and maintain

---

Last updated: Dec 8, 2025 | 7 brands working | 6,285 products synced 🎉
