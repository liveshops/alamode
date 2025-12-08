# Product Sync Strategy

## Overview
Products need to be fetched from brand websites and kept up-to-date. This requires a backend service separate from the mobile app.

## Architecture Options

### Option 1: Supabase Edge Functions (Recommended)
- Serverless functions that run on Deno
- Can be scheduled with pg_cron
- Direct database access
- Cost-effective for moderate traffic

### Option 2: External Service
- Node.js/Python service on AWS/Vercel
- More flexibility for complex scraping
- Better for handling rate limits
- Higher maintenance overhead

## Implementation Plan (Using Edge Functions)

### 1. Product Sync Function
```typescript
// supabase/functions/sync-products/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get brands to sync
  const { data: brands } = await supabase
    .from('brands')
    .select('*')
  
  for (const brand of brands) {
    try {
      const products = await fetchBrandProducts(brand)
      await updateProducts(supabase, brand.id, products)
    } catch (error) {
      await logError(supabase, brand.id, error)
    }
  }
})
```

### 2. Brand-Specific Scrapers

```typescript
// Free People Example
async function fetchFreePeopleProducts(brand) {
  // Option A: Use their API if available
  const response = await fetch('https://api.freepeople.com/products/new')
  
  // Option B: Parse HTML (using Cheerio/Puppeteer)
  const html = await fetch(brand.website_url + '/whats-new')
  const products = parseProductsFromHTML(html)
  
  return products.map(p => ({
    external_id: p.id,
    name: p.title,
    price: p.price,
    image_url: p.image,
    product_url: p.url
  }))
}
```

### 3. Product Update Logic
```typescript
async function updateProducts(supabase, brandId, newProducts) {
  for (const product of newProducts) {
    const { data: existing } = await supabase
      .from('products')
      .select('id, price')
      .eq('brand_id', brandId)
      .eq('external_id', product.external_id)
      .single()
    
    if (existing) {
      // Update price if changed
      if (existing.price !== product.price) {
        await supabase
          .from('products')
          .update({ 
            sale_price: product.price,
            last_checked_at: new Date()
          })
          .eq('id', existing.id)
      }
    } else {
      // Insert new product
      await supabase
        .from('products')
        .insert({
          brand_id: brandId,
          ...product,
          first_seen_at: new Date()
        })
    }
  }
}
```

### 4. Scheduling with pg_cron
```sql
-- Run every hour
SELECT cron.schedule(
  'sync-products',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/sync-products',
    headers:='{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

## Rate Limiting & Politeness

1. **Respect robots.txt**
2. **Add delays between requests** (1-2 seconds)
3. **Implement exponential backoff** for failures
4. **Set User-Agent header** identifying your bot
5. **Cache responses** to minimize requests

## Data Quality

1. **Validate prices** (ensure numeric, handle currency)
2. **Validate image URLs** (check if accessible)
3. **Handle out-of-stock** items (set is_available flag)
4. **Clean product names** (remove extra spaces, special chars)

## Monitoring

Create dashboard to track:
- Products added per sync
- Failed syncs per brand
- Average sync duration
- Product availability changes

## Legal Considerations

1. **Terms of Service**: Check each brand's ToS
2. **API Usage**: Prefer official APIs when available
3. **Copyright**: Don't store full product descriptions
4. **Attribution**: Link back to original product pages

## Fallback Strategy

If scraping becomes problematic:
1. **Affiliate APIs**: Many brands offer product feeds
2. **Manual curation**: Staff picks for initial launch
3. **User submissions**: Let users add products
4. **Brand partnerships**: Direct data sharing agreements

## Initial Development Approach

For MVP, consider:
1. Start with 3-5 brands that have APIs or easy-to-parse sites
2. Manual product entry for initial content
3. Build scraping infrastructure incrementally
4. Monitor what products users engage with most
