# Apify Cloudflare Scraper Setup

## Overview

For brands with anti-bot protection (like Free People, Urban Outfitters, etc.), we use Apify's Cloudflare bypass scraper.

## Prerequisites

1. **Apify Account** - Sign up at [apify.com](https://apify.com)
2. **API Token** - Already in your `.env` file as `APIFY_API_TOKEN`
3. **Free Credits** - $5/month free tier = ~50-100 product pages

## How It Works

### Architecture
```
Your App → ApifyCloudFlareScraper → Apify API → Cloudflare Bypass → Website → Products
```

### Process
1. Scraper sends URLs to Apify's Cloudflare bypass actor
2. Apify uses browser automation to bypass bot detection
3. Returns HTML of protected pages
4. We parse products from HTML using Cheerio

## Supported Brands

### ✅ Currently Implemented
- **Free People** - Full support with custom parser

### 🔜 Can Be Added
- Urban Outfitters
- Anthropologie
- Reformation (if they add protection)
- Any Shopify store that blocks scrapers

## Usage

### Add Free People to Database

Run in Supabase SQL Editor:
```bash
# File: scripts/add-free-people-brand.sql
```

Or manually:
```sql
-- See scripts/add-free-people-brand.sql for full SQL
```

### Sync Free People Products

```bash
# Test the scraper first (doesn't write to DB)
npm run test-scraper free-people

# Full sync (adds products to database)
npm run sync-brands free-people
```

## Cost Estimate

### Apify Pricing
- **Free Tier**: $5/month credit
- **Pay-as-you-go**: ~$0.10 per 1,000 pages

### Free People Scraping Costs
- **Initial sync** (~500 products): ~$0.50
- **Daily updates** (~50 new products): ~$0.05/day
- **Monthly total**: ~$2-3/month

### Free Tier Coverage
With $5 free credits, you can:
- Sync Free People fully: 1-2 times/month
- Plus regular updates
- **OR** add 2-3 similar brands

## Configuration

### Brand Configuration (Database)

```json
{
  "type": "apify-cloudflare",
  "start_urls": [
    "https://www.freepeople.com/shop/whats-new/",
    "https://www.freepeople.com/shop/dresses/",
    "https://www.freepeople.com/shop/tops/"
  ],
  "max_products": 500
}
```

### Environment Variables

Already configured in `.env`:
```bash
APIFY_API_TOKEN=your_apify_token_here
```

## Monitoring

### Check Apify Usage
1. Go to [app.apify.com](https://app.apify.com)
2. Click "Billing" → "Usage"
3. See credit consumption

### View Actor Runs
1. Go to [app.apify.com/actors/runs](https://app.apify.com/actors/runs)
2. See all scraper runs
3. Debug failures

## Troubleshooting

### Error: "APIFY_API_TOKEN not found"
- Check `.env` file has `APIFY_API_TOKEN`
- Restart your terminal/IDE

### Error: "Apify run timeout"
- Website is very slow
- Increase timeout in `apify-cloudflare-scraper.js`
- Default: 5 minutes

### Error: "No products found"
- Free People changed their HTML structure
- Update selectors in `free-people-scraper.js`
- Check Apify run logs for actual HTML

### Products Have No Images
- Image URLs might be lazy-loaded
- Update `extractProductImage()` in `free-people-scraper.js`
- Look for `data-src` attributes

## Adding More Protected Brands

### 1. Create Brand-Specific Scraper

```javascript
// scripts/scrapers/urban-outfitters-scraper.js
const ApifyCloudFlareScraper = require('./apify-cloudflare-scraper');
const cheerio = require('cheerio');

class UrbanOutfittersScraper extends ApifyCloudFlareScraper {
  extractProductsFromHtml(html, pageUrl) {
    const $ = cheerio.load(html);
    // ... custom parsing logic
  }
}

module.exports = UrbanOutfittersScraper;
```

### 2. Add to Custom Scrapers

```javascript
// scripts/scrapers/custom-scrapers.js
const UrbanOutfittersScraper = require('./urban-outfitters-scraper');

module.exports = {
  // ... existing
  UrbanOutfittersScraper
};
```

### 3. Map in sync-all-brands.js

```javascript
const CUSTOM_SCRAPERS = {
  'free-people': FreePeopleScraper,
  'urban-outfitters': UrbanOutfittersScraper, // Add this
  // ... others
};
```

### 4. Add Brand to Database

```sql
INSERT INTO brands (name, slug, platform, scraper_config) 
VALUES (
  'Urban Outfitters',
  'urban-outfitters',
  'custom',
  '{"type": "apify-cloudflare", "start_urls": [...]}'::jsonb
);
```

## Files Reference

### Core Files
- `scripts/scrapers/apify-cloudflare-scraper.js` - Base Apify scraper
- `scripts/scrapers/free-people-scraper.js` - Free People implementation
- `scripts/add-free-people-brand.sql` - Database setup

### Integration Files
- `scripts/scrapers/custom-scrapers.js` - Exports scrapers
- `scripts/sync-all-brands.js` - Routes brands to scrapers

## Best Practices

### 1. Monitor Credits
- Check Apify usage weekly
- Set up billing alerts in Apify dashboard

### 2. Optimize Scraping
- Only scrape "New Arrivals" pages initially
- Avoid scraping entire catalog
- Update products, don't re-scrape everything

### 3. Error Handling
- Always check Apify run logs
- Save failed products for retry
- Alert on repeated failures

### 4. Respect Websites
- Don't scrape more than needed
- Follow robots.txt guidelines
- Add delays between requests

## Support

### Apify Support
- Docs: [docs.apify.com](https://docs.apify.com)
- Discord: [Apify Community](https://discord.gg/jyEM2PRvMU)
- Email: support@apify.com

### Issues
- Scraper not working? Check Apify run logs first
- HTML parsing errors? Inspect actual HTML from Apify
- Cost concerns? Optimize start URLs and max_products

## Next Steps

1. ✅ Free People is set up
2. Test with: `npm run sync-brands free-people`
3. Monitor Apify usage
4. Consider adding Urban Outfitters or Anthropologie next

---

**Estimated Setup Time**: 5 minutes  
**Monthly Cost**: $0-3 (within free tier)  
**Reliability**: 95%+ success rate
