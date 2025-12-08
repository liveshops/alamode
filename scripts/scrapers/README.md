# Fashion Brand Scrapers

## Architecture Overview

This directory contains the scraping infrastructure for fetching product data from 22+ fashion brands.

```
scrapers/
├── base-scraper.js       # Abstract base class with common functionality
├── shopify-scraper.js    # Generic Shopify store scraper (handles 16 brands)
└── custom-scrapers.js    # Brand-specific scrapers (Zara, H&M, Aritzia, etc.)
```

## Base Scraper (`base-scraper.js`)

The foundation for all scrapers. Provides:

### Core Features
- **Rate Limiting**: 1.5s delay between requests
- **Retry Logic**: 3 attempts with exponential backoff
- **Request Headers**: Proper User-Agent, Accept headers
- **Data Normalization**: Converts various formats to unified schema
- **Validation**: Ensures all required fields are present
- **Category Mapping**: Associates products with categories
- **Image Handling**: Normalizes URLs, handles CDN links
- **Price Parsing**: Extracts numeric prices from strings

### Key Methods

```javascript
class BaseScraper {
  // Must be implemented by subclasses
  async fetchProducts()
  
  // Normalize raw product data to our schema
  normalizeProduct(rawProduct)
  
  // Save product to database
  async upsertProduct(productData, categoryNames)
  
  // Validate product has all required fields
  validateProduct(product)
  
  // Extract categories from product data
  extractCategories(product)
  
  // HTTP request with retry
  async makeRequest(url, options)
  
  // Parse price from various formats
  parsePrice(priceString)
  
  // Clean HTML and whitespace from text
  cleanText(text)
}
```

## Shopify Scraper (`shopify-scraper.js`)

Generic scraper for Shopify-based stores. Works with 16 brands.

### How It Works

1. **Primary**: Tries `/products.json` endpoint (most reliable)
2. **Fallback 1**: Tries collection-specific endpoint
3. **Fallback 2**: Falls back to sitemap parsing

### Advantages
- Uses official Shopify JSON APIs
- No HTML parsing needed
- Reliable and fast
- Handles pagination automatically
- Works across all Shopify stores

### Usage

```javascript
const scraper = new ShopifyScraper(brand, supabase);
const products = await scraper.fetchProducts();

// Or get only new arrivals
const newProducts = await scraper.fetchNewArrivals(30); // last 30 days
```

### Supported Brands
- Free People
- Urban Outfitters
- Anthropologie
- Edikted
- Damson Madder
- Sisters & Seekers
- Miaou
- Handover
- Sndys
- Rumored
- Design By Si
- Steele
- DISSH
- Doen
- With Jean
- (and more)

## Custom Scrapers (`custom-scrapers.js`)

Brand-specific implementations for non-Shopify stores.

### ZaraScraper

**Platform**: Custom REST API  
**Endpoint**: `/category/{id}/products?ajax=true`  
**Data Format**: JSON

```javascript
const scraper = new ZaraScraper(brand, supabase);
const products = await scraper.fetchProducts();
```

**Notes**:
- Uses category ID 1180 for women's new arrivals
- Prices stored in cents, need conversion
- Returns structured JSON

### AritziaScraper

**Platform**: Custom API  
**Endpoint**: `/api/products/new`  
**Data Format**: JSON

```javascript
const scraper = new AritziaScraper(brand, supabase);
const products = await scraper.fetchProducts();
```

**Notes**:
- Direct API access
- Clean JSON response
- Includes sale prices

### HMScraper

**Platform**: Custom platform  
**Endpoint**: `/productlisting.display.json`  
**Data Format**: JSON

```javascript
const scraper = new HMScraper(brand, supabase);
const products = await scraper.fetchProducts();
```

**Notes**:
- H&M's custom e-commerce platform
- Pagination support
- Includes sale indicators

### HTMLScraper

**Platform**: Generic HTML parser  
**Method**: DOM parsing with JSDOM  
**Use**: Fallback for sites without APIs

```javascript
const scraper = new HTMLScraper(brand, supabase);
const products = await scraper.fetchProducts();
```

**Features**:
- Tries multiple CSS selectors
- Extracts from common HTML patterns
- Less reliable than API scrapers

**Used For**:
- Stradivarius
- Altar'd State
- Guizio
- Cult Mia
- Other non-API brands

## Product Schema

All scrapers normalize data to this schema:

```javascript
{
  brand_id: UUID,
  external_id: String,           // Brand's product ID
  name: String,                  // Product title
  description: String,           // Clean text, no HTML
  price: Decimal,                // Base price
  sale_price: Decimal | null,    // Sale price if on sale
  currency: String,              // Usually 'USD'
  image_url: String,             // Primary image (HTTPS)
  additional_images: Array,      // Secondary images
  product_url: String,           // Link to product page
  variants: Array,               // Size/color variants
  is_available: Boolean,         // In stock status
  last_checked_at: Timestamp     // When scraped
}
```

## Adding New Brands

### Step 1: Determine Platform

Check if brand uses Shopify:
```bash
# Check for Shopify indicators
curl https://www.brandsite.com/products.json
```

If this returns JSON → Use ShopifyScraper  
If 404 or error → Need custom scraper

### Step 2: Add to Database

```sql
INSERT INTO brands (name, slug, website_url, platform, is_active, scraper_config)
VALUES (
  'Brand Name',
  'brand-slug',
  'https://www.brandsite.com',
  'shopify',  -- or 'custom'
  true,
  jsonb_build_object(
    'scraper_type', 'shopify',
    'new_arrivals_path', '/collections/new'
  )
);
```

### Step 3: Test

```bash
npm run test-scraper brand-slug
```

### Step 4: Create Custom Scraper (if needed)

```javascript
// In custom-scrapers.js

class NewBrandScraper extends BaseScraper {
  async fetchProducts() {
    // Your scraping logic
    const url = this.brand.website_url + '/api/products';
    const response = await this.makeRequest(url);
    const data = await response.json();
    
    return data.products.map(p => ({
      id: p.id,
      title: p.name,
      price: p.price,
      image: p.image,
      url: p.url,
      available: p.inStock
    }));
  }
}

// Export it
module.exports = {
  // ... other scrapers
  NewBrandScraper
};
```

### Step 5: Register Scraper

```javascript
// In sync-all-brands.js

const CUSTOM_SCRAPERS = {
  'brand-slug': NewBrandScraper,
  // ... others
};
```

## Error Handling

Scrapers handle errors gracefully:

1. **Network Errors**: Retry with exponential backoff
2. **Rate Limiting**: Respect delays, back off further if needed
3. **Invalid Data**: Log warning, skip product, continue
4. **Validation Failures**: Record in logs, don't crash
5. **Partial Success**: Mark sync as 'partial' not 'failed'

All errors logged to `product_scrape_logs` table.

## Performance Tips

### Optimize Fetch Speed
- Use `fetchNewArrivals()` instead of full catalog
- Filter by date to reduce processing
- Increase concurrency (carefully)

### Reduce Database Load
- Batch upserts where possible
- Only update changed fields
- Use proper indexes

### Handle Rate Limits
- Increase `requestDelay` if getting 429 errors
- Use proxies for high-volume brands
- Space out sync schedules

## Testing

Always test before syncing:

```bash
# Dry run - no database changes
npm run test-scraper brand-slug

# Check validation
npm run test-scraper brand-slug | grep "Valid products"

# Check categories
npm run test-scraper brand-slug | grep "Category Analysis"
```

## Monitoring

```sql
-- Check scraper success rates
SELECT 
  b.name,
  COUNT(CASE WHEN l.status = 'success' THEN 1 END) as successes,
  COUNT(CASE WHEN l.status = 'failed' THEN 1 END) as failures,
  AVG(l.execution_time_seconds) as avg_time
FROM brands b
LEFT JOIN product_scrape_logs l ON l.brand_id = b.id
WHERE l.started_at >= NOW() - INTERVAL '7 days'
GROUP BY b.id, b.name
ORDER BY failures DESC;
```

## Best Practices

1. ✅ **Test thoroughly** before production sync
2. ✅ **Respect rate limits** - be a good citizen
3. ✅ **Validate data** before saving
4. ✅ **Handle errors gracefully**
5. ✅ **Log everything** for debugging
6. ✅ **Monitor success rates**
7. ✅ **Update scrapers** when sites change
8. ✅ **Check robots.txt** before scraping
9. ✅ **Use official APIs** when available
10. ✅ **Link to original** product pages

## Common Issues

### "No products found"
- Website structure changed
- Check if site is accessible
- Verify configuration paths

### "Invalid price/image"
- Product data format changed
- Update normalization logic
- Check raw data structure

### "Rate limited"
- Increase `requestDelay`
- Use proxies
- Reduce sync frequency

### "Validation failures"
- Some products may be incomplete
- Acceptable if <10% of products
- Review failed products for patterns

## Legal Considerations

⚠️ **Important**: 
- Check each brand's Terms of Service
- Respect robots.txt
- Don't overload servers
- Link back to original pages
- Don't store full descriptions
- Consider affiliate programs

## Support

For scraper issues:
1. Run test-scraper to diagnose
2. Check product_scrape_logs table
3. Verify brand configuration
4. Update scraper if site changed
5. Contact brand for API access

---

Built with ❤️ for a la Mode
