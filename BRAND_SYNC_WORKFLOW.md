# Brand Sync Workflow Guide

## Overview

This guide explains the automated brand sync workflow that fetches product data from Apify and syncs it to your Supabase database. The system automatically fetches the latest task run, eliminating the need to manually update dataset IDs.

## How It Works

### 1. Setup (One-time per brand)

Each brand needs an Apify task configured with the task ID stored in the database:

```sql
UPDATE brands 
SET scraper_config = '{
  "apify_task_id": "tropical_infinity~your-task-name"
}'
WHERE slug = 'brand-slug';
```

**Example for Aritzia:**
```sql
UPDATE brands 
SET scraper_config = '{
  "apify_task_id": "tropical_infinity~e-commerce-scraping-tool-aritzia"
}'
WHERE slug = 'aritzia';
```

### 2. Daily Sync Process

Run the sync script for any brand:

```bash
node scripts/sync-products-from-apify.js aritzia
```

**What happens:**
1. ✅ Fetches brand configuration from database
2. 📡 Calls Apify API to get latest task run
3. ✅ Validates the run succeeded
4. 📥 Fetches products from the dataset
5. 🏷️ Classifies products using Shopify taxonomy
6. 💾 Upserts products to database
7. 📊 Logs results

### 3. Sync All Brands

Create a script to sync all active brands:

```bash
# scripts/sync-all-brands.sh
#!/bin/bash

# Get all active brand slugs and sync them
BRANDS=("aritzia" "free-people" "rad-swim" "etc")

for brand in "${BRANDS[@]}"; do
  echo "🔄 Syncing $brand..."
  node scripts/sync-products-from-apify.js "$brand"
  echo "---"
done
```

## Benefits

### Scalability
- ✅ **No manual dataset ID updates** - automatically uses latest run
- ✅ **100+ brands ready** - just add task IDs to config
- ✅ **Schedule with cron** - automate daily syncs
- ✅ **Error handling** - detects running/failed tasks

### Data Quality
- ✅ **Automatic taxonomy classification** - products tagged by category
- ✅ **Deduplication** - uses `external_id` to avoid duplicates
- ✅ **Variant tracking** - stores all product variants
- ✅ **Availability tracking** - monitors stock status

### Monitoring
- ✅ **Scrape logs** - every sync logged in `product_scrape_logs`
- ✅ **Execution metrics** - timing, products added/updated
- ✅ **Error tracking** - failures recorded with messages

## Adding a New Brand

### Step 1: Create Apify Task
1. Go to Apify console
2. Create new task from the e-commerce scraper actor
3. Configure for the brand's website
4. Note the task ID (format: `username~task-name`)

### Step 2: Add Brand to Database
```sql
INSERT INTO brands (name, slug, website_url, is_active, scraper_config)
VALUES (
  'Brand Name',
  'brand-slug',
  'https://brandwebsite.com',
  true,
  '{"apify_task_id": "tropical_infinity~e-commerce-scraping-tool-brandname"}'
);
```

### Step 3: Run Initial Sync
```bash
# Make sure the Apify task has been run at least once
node scripts/sync-products-from-apify.js brand-slug
```

### Step 4: Schedule Daily Syncs
Add to your cron job or automation tool.

## Automation with Cron

Schedule daily syncs at 3 AM:

```cron
# Edit crontab
crontab -e

# Add line (replace path):
0 3 * * * cd /path/to/new1 && node scripts/sync-all-brands.js >> logs/sync.log 2>&1
```

## API Endpoints Used

### Get Latest Task Run
```
GET https://api.apify.com/v2/actor-tasks/{taskId}/runs/last?token={token}
```

Response includes:
- `status` - SUCCEEDED, RUNNING, FAILED
- `defaultDatasetId` - Dataset to fetch products from
- `startedAt` / `finishedAt` - Timing info

### Get Dataset Items
```
GET https://api.apify.com/v2/datasets/{datasetId}/items?token={token}
```

Returns array of product objects.

## Monitoring & Troubleshooting

### Check Sync Logs
```sql
SELECT 
  b.name,
  psl.status,
  psl.products_added,
  psl.products_updated,
  psl.started_at,
  psl.completed_at,
  psl.error_message
FROM product_scrape_logs psl
JOIN brands b ON psl.brand_id = b.id
ORDER BY psl.started_at DESC
LIMIT 20;
```

### Common Issues

**❌ "No Apify task ID configured"**
- Run the UPDATE brands SQL to add `apify_task_id`

**❌ "Latest task run status: RUNNING"**
- Wait for Apify task to complete
- Tasks typically take 1-5 minutes

**❌ "Latest task run status: FAILED"**
- Check Apify console for task failure details
- Fix task configuration and re-run

**❌ "APIFY_API_TOKEN not found"**
- Add token to `.env` file: `APIFY_API_TOKEN=your_token`

## Cost Optimization

### Apify Costs
- **Product scraping**: $0.0015 per product
- **Listing pages**: $0.00042 per page
- **Example**: 1,000 products ≈ $1.50 per run

### Best Practices
1. **Schedule wisely** - Daily syncs at off-peak hours
2. **Incremental updates** - Apify can detect changes
3. **Monitor usage** - Check Apify dashboard monthly
4. **Batch brands** - Group similar brands in one task if possible

## Performance

With current optimizations:
- **Sync time**: 30-60 seconds per brand (depends on product count)
- **Database impact**: Minimal (uses upserts, indexes)
- **API calls**: 2 per sync (task run + dataset fetch)
- **Bandwidth**: ~1-5 MB per 1,000 products

## Next Steps

1. ✅ Run `update-aritzia-task-config.sql` in Supabase
2. ✅ Test with: `node scripts/sync-products-from-apify.js aritzia`
3. 📝 Create similar configs for other brands
4. 🤖 Set up cron job for daily automation
5. 📊 Monitor `product_scrape_logs` table

## Questions?

Check the main README or individual script documentation for more details.
