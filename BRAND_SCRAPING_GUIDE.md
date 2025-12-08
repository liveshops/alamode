# Brand Scraping System - Complete Guide

## 🎯 Overview

This is a comprehensive web scraping system that automatically fetches the latest products from 22 popular fashion brands. The system is designed to be:

- **Modular**: Easily add new brands
- **Scalable**: Handle multiple brands concurrently
- **Reliable**: Includes retry logic and error handling
- **Respectful**: Implements rate limiting and polite scraping practices

## 📋 Supported Brands

### Shopify Brands (16 brands)
These use the Shopify scraper which leverages Shopify's built-in JSON APIs:

1. **H&M** - Swedish fast-fashion giant
2. **Urban Outfitters** - Lifestyle and bohemian apparel
3. **Free People** - Bohemian women's fashion
4. **Anthropologie** - Lifestyle brand with clothing and home
5. **Edikted** - Gen Z trendy fashion
6. **Damson Madder** - Vintage-inspired contemporary wear
7. **Sisters & Seekers** - Australian bohemian brand
8. **Miaou** - Contemporary corsets and body-con
9. **Handover** - Minimalist contemporary fashion
10. **Sndys** - Australian feminine pieces
11. **Rumored** - Contemporary streetwear
12. **Design By Si** - Australian feminine designs
13. **Steele** - Australian contemporary brand
14. **DISSH** - Australian online boutique
15. **Doen** - Vintage-inspired feminine apparel
16. **With Jean** - Premium denim

### Custom Platform Brands (6 brands)
These have custom scrapers for their specific platforms:

1. **Zara** - REST API scraper
2. **Aritzia** - API scraper
3. **Stradivarius** - HTML scraper
4. **Altar'd State** - HTML scraper
5. **Guizio** - HTML scraper
6. **Cult Mia** - HTML scraper

## 🚀 Quick Start

### 1. Add Brands to Database

Run the seeding script in Supabase SQL Editor:

```bash
# View the SQL script
cat scripts/seed-fashion-brands.sql

# Execute in Supabase Dashboard → SQL Editor
```

This adds all 22 brands with their configurations.

### 2. Install Dependencies

```bash
npm install jsdom
# jsdom is needed for HTML parsing
```

### 3. Test Single Brand

```bash
# Sync a specific brand
node scripts/sync-all-brands.js free-people

# Sync only new arrivals (last 30 days)
node scripts/sync-all-brands.js free-people --new-only
```

### 4. Sync All Brands

```bash
# Sync all active brands
node scripts/sync-all-brands.js

# Sync only new arrivals from all brands
node scripts/sync-all-brands.js --new-only
```

## 📁 Architecture

```
scripts/
├── scrapers/
│   ├── base-scraper.js       # Base class with common functionality
│   ├── shopify-scraper.js    # Generic Shopify scraper
│   └── custom-scrapers.js    # Brand-specific scrapers (Zara, H&M, etc.)
├── sync-all-brands.js        # Main orchestration script
├── seed-fashion-brands.sql   # Database seeding
└── setup-brand-sync-cron.sql # Automated scheduling
```

## 🛠️ How It Works

### 1. Base Scraper (`base-scraper.js`)

Provides common functionality:
- **Rate limiting**: 1.5s delay between requests
- **Retry logic**: 3 attempts with exponential backoff
- **Data normalization**: Converts various formats to our schema
- **Image handling**: Ensures HTTPS, handles CDN URLs
- **Price parsing**: Extracts prices from various formats
- **Category mapping**: Assigns products to categories
- **Validation**: Ensures all required fields are present

### 2. Shopify Scraper (`shopify-scraper.js`)

Leverages Shopify's JSON endpoints:
- `/products.json` - Main product feed
- `/collections/{handle}/products.json` - Collection-specific
- `/sitemap_products_1.xml` - Fallback via sitemap
- Handles pagination automatically
- Filters by publish date for "new arrivals"

### 3. Custom Scrapers (`custom-scrapers.js`)

Brand-specific implementations:

**ZaraScraper**: Uses their REST API
- Endpoint: `/category/{id}/products?ajax=true`
- Returns JSON product data
- Handles Zara's price format (cents)

**AritziaScraper**: Uses their product API
- Endpoint: `/api/products/new`
- JSON response with product details

**HMScraper**: Uses their listing API
- Endpoint: `/productlisting.display.json`
- Pagination support

**HTMLScraper**: Generic HTML parser
- Uses JSDOM to parse HTML
- Tries multiple selectors to find products
- Extracts data from HTML attributes and text

### 4. Orchestration (`sync-all-brands.js`)

Main features:
- **Auto-detection**: Selects correct scraper for each brand
- **Parallel processing**: Can sync multiple brands
- **Progress tracking**: Logs to `product_scrape_logs` table
- **Summary reports**: Shows added/updated/failed counts
- **Error handling**: Continues on failure, logs errors

## 📊 Database Schema

### Products Table

```sql
products (
  id                UUID PRIMARY KEY,
  brand_id          UUID REFERENCES brands(id),
  external_id       TEXT,  -- Brand's product ID
  name              TEXT NOT NULL,
  description       TEXT,
  price             DECIMAL(10,2) NOT NULL,
  sale_price        DECIMAL(10,2),
  currency          TEXT DEFAULT 'USD',
  image_url         TEXT NOT NULL,
  additional_images TEXT[],
  product_url       TEXT NOT NULL,
  variants          JSONB,  -- Size, color options
  like_count        INTEGER DEFAULT 0,
  is_available      BOOLEAN DEFAULT true,
  first_seen_at     TIMESTAMP,
  last_checked_at   TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
)
```

### Scrape Logs Table

```sql
product_scrape_logs (
  id                      UUID PRIMARY KEY,
  brand_id                UUID REFERENCES brands(id),
  status                  TEXT,  -- 'running', 'success', 'failed', 'partial'
  products_added          INTEGER,
  products_updated        INTEGER,
  error_message           TEXT,
  started_at              TIMESTAMP,
  completed_at            TIMESTAMP,
  execution_time_seconds  INTEGER
)
```

## ⏰ Automated Scheduling

### Option 1: Supabase pg_cron (Recommended)

```bash
# Run the cron setup script in Supabase SQL Editor
cat scripts/setup-brand-sync-cron.sql
```

This sets up:
- **Daily sync** at 2 AM UTC (all brands)
- **6-hour sync** for priority brands (Zara, H&M, etc.)
- **2-hour new arrivals check** for popular brands

### Option 2: GitHub Actions

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
      - run: node scripts/sync-all-brands.js
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### Option 3: Server Cron Job

```bash
# Add to your server's crontab
0 */6 * * * cd /path/to/project && node scripts/sync-all-brands.js >> logs/sync.log 2>&1
```

## 📈 Monitoring

### View Sync Stats

```sql
-- See comprehensive stats for all brands
SELECT * FROM brand_sync_stats;

-- See recent sync logs
SELECT 
  b.name,
  l.status,
  l.products_added,
  l.products_updated,
  l.execution_time_seconds,
  l.started_at,
  l.error_message
FROM product_scrape_logs l
JOIN brands b ON b.id = l.brand_id
ORDER BY l.started_at DESC
LIMIT 20;
```

### Check Products Added

```sql
-- Products added in last 24 hours
SELECT 
  b.name,
  COUNT(*) as new_products
FROM products p
JOIN brands b ON p.brand_id = b.id
WHERE p.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY b.name
ORDER BY new_products DESC;
```

## 🔧 Adding New Brands

### 1. Add to Database

```sql
INSERT INTO brands (name, slug, website_url, platform, is_active, scraper_config)
VALUES (
  'New Brand',
  'new-brand',
  'https://www.newbrand.com',
  'shopify',  -- or 'custom'
  true,
  jsonb_build_object(
    'scraper_type', 'shopify',
    'new_arrivals_path', '/collections/new'
  )
);
```

### 2. Test Scraping

```bash
node scripts/sync-all-brands.js new-brand
```

### 3. Create Custom Scraper (if needed)

If the brand doesn't work with existing scrapers:

```javascript
// In scripts/scrapers/custom-scrapers.js

class NewBrandScraper extends BaseScraper {
  async fetchProducts() {
    // Your custom scraping logic
    const response = await this.makeRequest(this.brand.website_url + '/api/products');
    const data = await response.json();
    
    return data.products.map(p => ({
      id: p.id,
      title: p.name,
      price: p.price,
      image: p.image,
      url: p.url,
      // ... other fields
    }));
  }
}

// Add to CUSTOM_SCRAPERS in sync-all-brands.js
const CUSTOM_SCRAPERS = {
  'new-brand': NewBrandScraper,
  // ...
};
```

## ⚠️ Important Notes

### Legal & Ethical Considerations

1. **Respect robots.txt**: Check each brand's robots.txt file
2. **Rate limiting**: Our scrapers wait 1.5s between requests
3. **Terms of Service**: Review each brand's ToS
4. **Attribution**: Always link back to original product pages
5. **No data hoarding**: Only store essential product info

### Best Practices

1. **Test individually first**: Before syncing all brands
2. **Monitor error logs**: Check `product_scrape_logs` regularly
3. **Update scrapers**: Websites change, scrapers need updates
4. **Handle failures gracefully**: Don't let one brand break all
5. **Validate data**: Check prices, images, URLs are valid

### Troubleshooting

**No products found**:
- Check brand website is accessible
- Verify `new_arrivals_path` in `scraper_config`
- Try different selectors for HTML scrapers

**Authentication errors**:
- Some sites require cookies/sessions
- May need to use Apify or other service

**Rate limiting**:
- Increase delay in scraper: `this.requestDelay = 3000`
- Use proxies if needed

**Cloudflare protection**:
- Use Apify actors which handle Cloudflare
- Set up proxy rotation

## 🎯 Next Steps

1. **Run initial sync**: `node scripts/sync-all-brands.js`
2. **Set up automation**: Execute `setup-brand-sync-cron.sql`
3. **Monitor performance**: Check `brand_sync_stats` view
4. **Fine-tune scrapers**: Adjust based on results
5. **Add more brands**: As your app grows

## 📞 Support

If a scraper breaks:
1. Check the brand's website for changes
2. Review error logs in `product_scrape_logs`
3. Update selectors/endpoints in scraper code
4. Test with single brand before running full sync

Happy scraping! 🛍️✨
