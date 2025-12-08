# 🚀 Quick Start Guide - Brand Scraping

## ⚡ TL;DR

```bash
# 1. Install dependencies
npm install

# 2. Add brands to database (run SQL in Supabase)
# Copy & paste scripts/seed-fashion-brands.sql into Supabase SQL Editor

# 3. Test a single brand
npm run test-scraper free-people

# 4. Sync all brands
npm run sync-brands

# 5. Sync specific brand
npm run sync-brands zara

# 6. Only fetch new arrivals
npm run sync-brands -- --new-only
```

## 📋 Commands Reference

### Testing (Dry Run - No Database Changes)

```bash
# Test a scraper without saving to database
npm run test-scraper <brand-slug>

# Examples:
npm run test-scraper free-people
npm run test-scraper zara
npm run test-scraper hm
```

**Output**: Shows sample products, validation stats, categories, price ranges

### Syncing (Saves to Database)

```bash
# Sync all active brands
npm run sync-brands

# Sync specific brand
npm run sync-brands <brand-slug>

# Sync only new arrivals (last 30 days)
npm run sync-brands -- --new-only

# Examples:
npm run sync-brands free-people
npm run sync-brands zara
npm run sync-brands -- --new-only
```

## 🎯 Recommended Workflow

### First Time Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add brands to database**
   - Open Supabase Dashboard → SQL Editor
   - Copy contents of `scripts/seed-fashion-brands.sql`
   - Execute

3. **Verify brands were added**
   ```sql
   SELECT name, slug, platform FROM brands ORDER BY name;
   ```

### Testing Individual Brands

Start with testing to ensure scrapers work:

```bash
# Test Shopify brands (usually most reliable)
npm run test-scraper free-people
npm run test-scraper urban-outfitters
npm run test-scraper edikted

# Test custom scrapers
npm run test-scraper zara
npm run test-scraper aritzia
npm run test-scraper hm
```

### Initial Data Population

Once testing looks good, sync your first brands:

```bash
# Start with reliable Shopify brands
npm run sync-brands free-people
npm run sync-brands urban-outfitters
npm run sync-brands anthropologie

# Then try custom platform brands
npm run sync-brands zara
npm run sync-brands hm
npm run sync-brands aritzia
```

### Full Sync

After individual brands work:

```bash
# Sync all brands at once
npm run sync-brands

# Or sync only new arrivals to save time
npm run sync-brands -- --new-only
```

## 📊 Monitoring

### Check Sync Results

```sql
-- View recent syncs
SELECT 
  b.name,
  l.status,
  l.products_added,
  l.products_updated,
  l.execution_time_seconds,
  l.started_at
FROM product_scrape_logs l
JOIN brands b ON b.id = l.brand_id
ORDER BY l.started_at DESC
LIMIT 20;

-- View brand stats
SELECT * FROM brand_sync_stats;

-- Products added today
SELECT 
  b.name,
  COUNT(*) as new_products
FROM products p
JOIN brands b ON p.brand_id = b.id
WHERE p.created_at >= CURRENT_DATE
GROUP BY b.name
ORDER BY new_products DESC;
```

### View Products in App

Make sure you're following brands to see their products in your feed:

```sql
-- Follow all brands (replace <your-user-id>)
INSERT INTO user_follows_brands (user_id, brand_id)
SELECT '<your-user-id>'::uuid, id FROM brands
ON CONFLICT DO NOTHING;
```

## 🔧 Troubleshooting

### "No products found"

**Possible causes:**
- Website structure changed
- Network issues
- Rate limiting/blocking
- Incorrect configuration

**Solutions:**
1. Check if website is accessible: `curl -I https://www.brandsite.com`
2. Test scraper: `npm run test-scraper brand-slug`
3. Check `scraper_config` in database
4. Review error in `product_scrape_logs` table

### "Invalid or missing name/price/image"

**Cause:** Product data doesn't match expected format

**Solutions:**
1. Run test-scraper to see validation errors
2. Check product structure in raw data
3. Update normalization logic in scraper
4. Some products may be invalid - acceptable if <10%

### "Brand not found"

**Cause:** Brand not in database or slug incorrect

**Solutions:**
1. Check slug: `SELECT slug FROM brands ORDER BY name;`
2. Add brand using SQL insert
3. Verify spelling of slug

### Slow Performance

**Causes:**
- Large number of products
- Rate limiting delays
- Network latency

**Solutions:**
1. Use `--new-only` flag for faster syncs
2. Sync brands individually instead of all at once
3. Increase concurrent requests (advanced)

### Rate Limiting / Blocked

**Signs:**
- 429 errors
- CAPTCHAs
- Empty responses

**Solutions:**
1. Increase delay in scraper (default 1.5s)
2. Use residential proxies
3. Consider using Apify actors instead
4. Space out sync times

## 💡 Pro Tips

1. **Test before syncing**: Always run `test-scraper` first
2. **Start small**: Sync 3-5 brands initially, expand later
3. **Monitor logs**: Check `product_scrape_logs` after each sync
4. **Use new-only mode**: Faster, fresher content
5. **Schedule wisely**: Run syncs during off-peak hours
6. **Check data quality**: Verify images, prices, URLs are valid

## 📅 Scheduling Recommendations

### Development Phase
```bash
# Manual syncs as needed
npm run sync-brands -- --new-only
```

### Production Phase

**Option 1: GitHub Actions** (Recommended)
- Runs every 6 hours
- Free on GitHub
- See `.github/workflows/sync-brands.yml` template

**Option 2: Supabase pg_cron**
- Runs inside database
- See `scripts/setup-brand-sync-cron.sql`

**Option 3: Server Cron**
```bash
# Add to crontab
0 */6 * * * cd /path/to/project && npm run sync-brands >> logs/sync.log 2>&1
```

## 🎯 Success Metrics

Good scraping performance:
- ✅ **90%+ valid products** after normalization
- ✅ **<5s per product** fetch time
- ✅ **Zero errors** for Shopify brands
- ✅ **Fresh data** (synced within 6 hours)
- ✅ **High availability** (99%+ uptime)

## 🆘 Getting Help

1. Check full guide: `BRAND_SCRAPING_GUIDE.md`
2. Review logs: `product_scrape_logs` table
3. Test individual scrapers
4. Check brand website manually
5. Update scraper code if website changed

## 📦 What's Included

- **22 popular fashion brands** pre-configured
- **3 scraper types**: Shopify, Custom API, HTML
- **Automatic scheduling** templates
- **Testing utilities** for validation
- **Monitoring views** for tracking
- **Error handling** with retry logic

Happy scraping! 🛍️✨

---

**Next Steps:**
1. Run `npm run test-scraper free-people`
2. If successful, run `npm run sync-brands free-people`
3. Check products in Supabase
4. Repeat for other brands
5. Set up automation
