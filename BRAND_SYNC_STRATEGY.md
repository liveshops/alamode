# Brand Sync Strategy

## Overview
This document explains how different brands are synced and which method to use.

## Sync Methods

### 1. Shopify Brands (Database-Driven)
**Use:** `npm run sync-brands <brand-slug>`

Brands with `platform: 'shopify'` in the database automatically use the Shopify scraper.

**Requirements:**
- `platform: 'shopify'` in database
- Valid `website_url` 
- Optional: `scraper_config` with collections

**Examples:** Brandy Melville, Princess Polly, Peppermayo, Sisters & Seekers, Sndys, etc.

### 2. Apify Brands (Database-Driven)
**Use:** `node scripts/sync-products-from-apify.js <brand-slug>`

Brands with `apify_task_id` in their `scraper_config` use the Apify sync script.

**Requirements:**
- `apify_task_id` in `scraper_config`
- Apify task must exist and have been run at least once
- `APIFY_API_TOKEN` in `.env`

**Examples:** Aritzia, Hello Molly, Garage, Free People, Cult Mia, etc.

**Setup:**
```sql
UPDATE brands 
SET scraper_config = scraper_config || '{"apify_task_id": "tropical_infinity~task-name"}'::jsonb
WHERE slug = 'brand-slug';
```

### 3. Custom Scrapers (Hardcoded)
**Use:** `npm run sync-brands <brand-slug>`

Brands with unique APIs or scraping requirements have custom scraper implementations.

**Currently Supported:**
- **Zara** - Custom REST API scraper
- **Stradivarius** - Custom HTML scraper

**Note:** These are hardcoded in `scripts/sync-all-brands.js` because they require specialized logic that can't be configured via database alone.

## Decision Flow

```
Is it Shopify?
├─ YES → Use npm run sync-brands
└─ NO
   └─ Does it have apify_task_id?
      ├─ YES → Use sync-products-from-apify.js
      └─ NO → Needs custom scraper (contact dev)
```

## Adding New Brands

### For Shopify Sites
1. Add brand to database with `platform: 'shopify'`
2. Run: `npm run sync-brands <brand-slug>`

### For Non-Shopify Sites
1. Create Apify task in Apify console
2. Add brand to database with `apify_task_id` in config
3. Run: `node scripts/sync-products-from-apify.js <brand-slug>`

### Example SQL for Apify Brand
```sql
INSERT INTO brands (name, slug, website_url, platform, is_active, scraper_config)
VALUES (
  'Brand Name',
  'brand-slug',
  'https://www.brand.com',
  'custom',
  true,
  '{"type": "apify-ecommerce", "apify_task_id": "tropical_infinity~task-name", "max_products": 500}'::jsonb
);
```

## Bulk Syncing

### Sync All Shopify Brands (Free)
```bash
npm run sync-brands --shopify-only
```

### Sync All Active Brands
```bash
npm run sync-brands
```

### Sync Specific Brand
```bash
npm run sync-brands <brand-slug>
# or for Apify:
node scripts/sync-products-from-apify.js <brand-slug>
```

## Cost Optimization

- **Shopify scraping** = FREE (uses public API)
- **Apify scraping** = Costs Apify credits
- **Custom scrapers** = FREE (direct scraping)

**Recommendation:** Use Shopify method when possible, Apify for Cloudflare-protected or complex sites.

## Troubleshooting

### "Brand is inactive"
```sql
UPDATE brands SET is_active = true WHERE slug = 'brand-slug';
```

### "No Apify task ID configured"
```sql
UPDATE brands 
SET scraper_config = scraper_config || '{"apify_task_id": "your-task-id"}'::jsonb
WHERE slug = 'brand-slug';
```

### Shopify scraping fails
Check that:
1. Website URL is correct
2. Site is actually Shopify (test: `curl -I https://site.com | grep shopify`)
3. Brand is not hardcoded in `CUSTOM_SCRAPERS` list

### Wrong scraper being used
Check `scripts/sync-all-brands.js` - brand might be hardcoded in `CUSTOM_SCRAPERS`.
