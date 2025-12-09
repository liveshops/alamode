/**
 * Sync All Brands
 * 
 * Main orchestration script that syncs products from all active brands.
 * Automatically selects the appropriate scraper for each brand.
 * 
 * Usage:
 *   node scripts/sync-all-brands.js              # Sync all active brands
 *   node scripts/sync-all-brands.js <brand-slug> # Sync specific brand
 *   node scripts/sync-all-brands.js --new-only   # Only sync new arrivals
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ShopifyScraper = require('./scrapers/shopify-scraper');
const { ZaraScraper, AritziaScraper, HMScraper, HTMLScraper, FreePeopleScraper } = require('./scrapers/custom-scrapers');

// Initialize Supabase client
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map brand slugs to custom scrapers
const CUSTOM_SCRAPERS = {
  'zara': ZaraScraper,
  'aritzia': AritziaScraper,
  'hm': HMScraper,
  'free-people': FreePeopleScraper,
  'stradivarius': HTMLScraper,
  'cult-mia': HTMLScraper,
  'guizio': HTMLScraper,
  'altard-state': HTMLScraper
};

/**
 * Get the appropriate scraper for a brand
 */
function getScraperForBrand(brand) {
  // Check if there's a custom scraper for this brand
  if (CUSTOM_SCRAPERS[brand.slug]) {
    const ScraperClass = CUSTOM_SCRAPERS[brand.slug];
    return new ScraperClass(brand, supabase);
  }
  
  // Default to Shopify scraper for Shopify platforms
  if (brand.platform === 'shopify') {
    return new ShopifyScraper(brand, supabase);
  }
  
  // Fallback to HTML scraper
  return new HTMLScraper(brand, supabase);
}

/**
 * Sync products for a single brand
 */
async function syncBrand(brand, options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Syncing: ${brand.name} (${brand.slug})`);
  console.log(`${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  // Create scrape log
  const { data: logData } = await supabase
    .from('product_scrape_logs')
    .insert({
      brand_id: brand.id,
      status: 'running',
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  const logId = logData?.id;
  
  try {
    // Get the appropriate scraper
    const scraper = getScraperForBrand(brand);
    
    // Fetch products
    let rawProducts;
    if (options.newOnly) {
      rawProducts = await scraper.fetchNewArrivals?.(30) || await scraper.fetchProducts();
    } else {
      rawProducts = await scraper.fetchProducts();
    }
    
    if (!rawProducts || rawProducts.length === 0) {
      console.log('⚠️  No products found\n');
      
      if (logId) {
        await supabase
          .from('product_scrape_logs')
          .update({
            status: 'success',
            products_added: 0,
            products_updated: 0,
            completed_at: new Date().toISOString(),
            execution_time_seconds: Math.floor((Date.now() - startTime) / 1000)
          })
          .eq('id', logId);
      }
      
      return { success: true, added: 0, updated: 0, failed: 0 };
    }
    
    // Process and save products
    let productsAdded = 0;
    let productsUpdated = 0;
    let productsFailed = 0;
    
    console.log(`📦 Processing ${rawProducts.length} products...\n`);
    
    for (const rawProduct of rawProducts) {
      try {
        // Normalize product data
        const productData = scraper.normalizeProduct(rawProduct);
        
        // Extract categories
        const categories = scraper.extractCategories(rawProduct);
        
        // Save product
        const result = await scraper.upsertProduct(productData, categories);
        
        if (result.success) {
          if (result.isNew) {
            productsAdded++;
            console.log(`  ✅ Added: ${productData.name.substring(0, 60)}`);
          } else {
            productsUpdated++;
            console.log(`  🔄 Updated: ${productData.name.substring(0, 60)}`);
          }
        } else {
          productsFailed++;
          console.log(`  ❌ Failed: ${productData.name.substring(0, 60)}`);
        }
        
      } catch (error) {
        productsFailed++;
        console.log(`  ❌ Error processing product: ${error.message}`);
      }
    }
    
    // Update brand's last_synced_at
    await supabase
      .from('brands')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', brand.id);
    
    // Update scrape log
    const executionTime = Math.floor((Date.now() - startTime) / 1000);
    
    if (logId) {
      await supabase
        .from('product_scrape_logs')
        .update({
          status: productsFailed === 0 ? 'success' : 'partial',
          products_added: productsAdded,
          products_updated: productsUpdated,
          completed_at: new Date().toISOString(),
          execution_time_seconds: executionTime
        })
        .eq('id', logId);
    }
    
    // Print summary
    console.log(`\n📊 Summary for ${brand.name}`);
    console.log(`   ➕ Added: ${productsAdded}`);
    console.log(`   🔄 Updated: ${productsUpdated}`);
    console.log(`   ❌ Failed: ${productsFailed}`);
    console.log(`   ⏱️  Time: ${executionTime}s\n`);
    
    return {
      success: true,
      added: productsAdded,
      updated: productsUpdated,
      failed: productsFailed,
      time: executionTime
    };
    
  } catch (error) {
    console.error(`❌ Fatal error syncing ${brand.name}: ${error.message}\n`);
    
    if (logId) {
      await supabase
        .from('product_scrape_logs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
          execution_time_seconds: Math.floor((Date.now() - startTime) / 1000)
        })
        .eq('id', logId);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const specificBrand = args.find(arg => !arg.startsWith('--'));
  const newOnly = args.includes('--new-only');
  
  console.log('\n🌟 a la Mode - Brand Product Sync\n');
  
  if (newOnly) {
    console.log('📅 Mode: New arrivals only (last 30 days)\n');
  }
  
  try {
    let brandsToSync = [];
    
    if (specificBrand) {
      // Sync specific brand
      const { data: brand, error } = await supabase
        .from('brands')
        .select('*')
        .eq('slug', specificBrand)
        .single();
      
      if (error || !brand) {
        console.error(`❌ Brand not found: ${specificBrand}`);
        process.exit(1);
      }
      
      brandsToSync = [brand];
    } else {
      // Sync all active brands
      const { data: brands, error } = await supabase
        .from('brands')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        console.error('❌ Error fetching brands:', error.message);
        process.exit(1);
      }
      
      brandsToSync = brands || [];
      console.log(`📋 Found ${brandsToSync.length} active brands to sync\n`);
    }
    
    if (brandsToSync.length === 0) {
      console.log('⚠️  No brands to sync');
      process.exit(0);
    }
    
    // Sync each brand
    const results = [];
    const startTime = Date.now();
    
    for (const brand of brandsToSync) {
      const result = await syncBrand(brand, { newOnly });
      results.push({ brand: brand.name, ...result });
      
      // Small delay between brands
      if (brandsToSync.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Print overall summary
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const totalAdded = results.reduce((sum, r) => sum + (r.added || 0), 0);
    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
    const totalFailed = results.reduce((sum, r) => sum + (r.failed || 0), 0);
    const successCount = results.filter(r => r.success).length;
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 OVERALL SYNC SUMMARY');
    console.log('='.repeat(60));
    console.log(`Brands synced: ${successCount}/${brandsToSync.length}`);
    console.log(`Products added: ${totalAdded}`);
    console.log(`Products updated: ${totalUpdated}`);
    console.log(`Products failed: ${totalFailed}`);
    console.log(`Total time: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
    console.log('='.repeat(60) + '\n');
    
    // Show individual brand results
    console.log('📊 Brand-by-brand results:\n');
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.brand}: +${result.added || 0} ~${result.updated || 0} ✗${result.failed || 0}`);
    });
    console.log('');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();
