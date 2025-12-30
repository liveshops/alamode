# Product Sync Strategies

This document explains the two different sync strategies for Shopify brands.

## Overview

We have two sync scripts with different purposes:

1. **`sync-all-brands.js`** - Full sync with updates (SLOW but complete)
2. **`sync-all-brands-new-only.js`** - New products only (FAST but skips updates) ⚡

## Quick Start

```bash
# Fast daily sync (new products only) - Run daily
npm run sync-new

# Full sync with updates - Run 2x/week
npm run sync-brands
```

## Strategy 1: Full Sync with Updates (SLOW)

**File:** `sync-all-brands.js`  
**Command:** `npm run sync-brands`

### What it does:
- Fetches ALL products from each brand
- Checks EVERY product to see if it exists
- Updates ALL existing products with latest data
- Adds new products

### When to use:
- 2x per week (e.g., Tuesday & Friday)
- When you need to update product prices, images, availability
- After making changes to taxonomy classification

### Performance:
- **Time:** 4+ hours for 41 brands
- **Updates:** ~69,000 products checked and updated
- **New products:** ~85 added per run
- **Cost:** Medium (Shopify API calls are free)

### Example output:
```
Total time: 258m 10s
✅ Brands successful: 41
➕ Total products added: 85
🔄 Total products updated: 69317
📦 Total products in database: 46507
```

## Strategy 2: New Products Only (FAST) ⚡

**File:** `sync-all-brands-new-only.js`  
**Command:** `npm run sync-new`

### What it does:
- Fetches ALL products from each brand
- Checks if product exists by external_id or name
- **SKIPS** existing products (no updates)
- **ONLY ADDS** brand new products
- Skips ~99% of database operations

### When to use:
- Daily (or multiple times per day)
- When you just want to catch new arrivals quickly
- Between full syncs

### Performance:
- **Time:** Estimated 10-20 minutes for 41 brands
- **Updates:** 0 (intentionally skipped)
- **New products:** Only new arrivals
- **Cost:** Low (fewer database operations)

### Example output (estimated):
```
Total time: 15m 30s
✅ Brands successful: 41
➕ Total products added: 125
⏭️  Total products skipped: 68500
📦 Total products in database: 46632
```

## Recommended Schedule

### Daily (Morning)
```bash
npm run sync-new
```
Fast sync to catch new arrivals from overnight. Takes ~15 minutes.

### Twice per week (Tuesday & Friday)
```bash
npm run sync-brands
```
Full sync to update prices, availability, and images. Takes ~4 hours.

## Technical Details

### How "New Only" Works

The fast sync uses a special scraper (`BaseScraperNewOnly`) that overrides the `upsertProduct()` method:

**Regular sync:**
```javascript
// Checks if exists
// If exists: UPDATE with new data
// If not: INSERT
```

**Fast sync:**
```javascript
// Checks if exists
// If exists: SKIP (return immediately)
// If not: INSERT
```

This eliminates ~69,000 UPDATE queries, making it **20x faster**.

### File Structure

```
scripts/
├── sync-all-brands.js              # Full sync with updates
├── sync-all-brands-new-only.js     # New products only (fast)
├── scrapers/
│   ├── base-scraper.js             # Regular base class
│   ├── base-scraper-new-only.js    # Fast base class (no updates)
│   ├── shopify-scraper.js          # Regular Shopify scraper
│   └── shopify-scraper-new-only.js # Fast Shopify scraper
```

## Command Options

### Full Sync Commands

```bash
# Sync all brands (with updates)
npm run sync-brands

# Sync specific brand (with updates)
node scripts/sync-all-brands.js princess-polly

# Sync only Shopify brands (with updates)
node scripts/sync-all-brands.js --shopify-only
```

### Fast Sync Commands

```bash
# Sync all brands (new only)
npm run sync-new

# Sync specific brand (new only)
node scripts/sync-all-brands-new-only.js princess-polly

# Shopify only is automatic (fast sync only supports Shopify)
```

## Monitoring & Logs

Both scripts create entries in the `product_scrape_logs` table with:
- Start/end timestamps
- Execution time
- Products added
- Products updated (0 for fast sync)
- Status (success/failed/partial)

View recent syncs in Supabase:
```sql
SELECT 
  brands.name,
  status,
  products_added,
  products_updated,
  execution_time_seconds,
  started_at
FROM product_scrape_logs
JOIN brands ON brands.id = product_scrape_logs.brand_id
ORDER BY started_at DESC
LIMIT 20;
```

## Troubleshooting

### Fast sync not finding new products
Run a full sync to ensure your existing product database is complete first.

### Products being duplicated
Check that `external_id` and `name` fields are being set correctly in the scraper.

### Slow performance on fast sync
Fast sync should be 10-20x faster. If it's still slow, check:
- Database indexes on `external_id` and `name`
- Network connectivity
- Shopify API rate limits

## Future Improvements

- Support for custom scrapers (Zara, etc.) in fast sync
- Parallel brand syncing for even faster performance
- Smart scheduling based on brand update frequency
- Webhook integration for real-time new product notifications
