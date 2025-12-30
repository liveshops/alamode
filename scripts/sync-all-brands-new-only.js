/**
 * Sync All Brands - NEW PRODUCTS ONLY (FAST!)
 * 
 * Rapid sync that ONLY adds new products, completely skips all updates.
 * Perfect for daily runs to catch new arrivals quickly.
 * 
 * Use this: Daily for fast new product syncs
 * Use sync-all-brands.js: 2x/week for full updates
 * 
 * Usage:
 *   node scripts/sync-all-brands-new-only.js                 # Sync all active brands (new only)
 *   node scripts/sync-all-brands-new-only.js <brand-slug>    # Sync specific brand (new only)
 *   node scripts/sync-all-brands-new-only.js --shopify-only  # Only Shopify brands (FREE!)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ShopifyScraperNewOnly = require('./scrapers/shopify-scraper-new-only');

// Initialize Supabase client
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Sync products for a single brand (new products only)
 */
async function syncBrand(brand) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Syncing NEW products: ${brand.name} (${brand.slug})`);
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
    // Only support Shopify for now (can extend later)
    if (brand.platform !== 'shopify') {
      console.log(`⚠️  Skipping ${brand.name} - only Shopify brands supported in new-only mode\n`);
      
      if (logId) {
        await supabase
          .from('product_scrape_logs')
          .update({
            status: 'skipped',
            completed_at: new Date().toISOString(),
            execution_time_seconds: Math.floor((Date.now() - startTime) / 1000)
          })
          .eq('id', logId);
      }
      
      return { success: true, added: 0, skipped: 0, failed: 0 };
    }
    
    // Create scraper
    const scraper = new ShopifyScraperNewOnly(brand, supabase);
    
    // Fetch products
    const rawProducts = await scraper.fetchProducts();
    
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
      
      return { success: true, added: 0, skipped: 0, failed: 0 };
    }
    
    // Process and save products
    let productsAdded = 0;
    let productsSkipped = 0;
    let productsFailed = 0;
    
    console.log(`📦 Processing ${rawProducts.length} products (new only)...\n`);
    
    for (const rawProduct of rawProducts) {
      try {
        // Normalize product data
        const productData = scraper.normalizeProduct(rawProduct);
        
        // Extract categories
        const categories = scraper.extractCategories(rawProduct);
        
        // Save product (will skip if exists)
        const result = await scraper.upsertProduct(productData, categories);
        
        if (result.success) {
          if (result.skipped) {
            productsSkipped++;
            // Don't log every skip (too verbose)
          } else if (result.isNew) {
            productsAdded++;
            console.log(`  ✅ Added: ${productData.name.substring(0, 60)}`);
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
          products_updated: 0, // We never update
          completed_at: new Date().toISOString(),
          execution_time_seconds: executionTime
        })
        .eq('id', logId);
    }
    
    // Print summary
    console.log(`\n📊 Summary for ${brand.name}`);
    console.log(`   ➕ Added: ${productsAdded}`);
    console.log(`   ⏭️  Skipped: ${productsSkipped}`);
    console.log(`   ❌ Failed: ${productsFailed}`);
    console.log(`   ⏱️  Time: ${executionTime}s\n`);
    
    return {
      success: true,
      added: productsAdded,
      skipped: productsSkipped,
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
  const shopifyOnly = args.includes('--shopify-only');
  
  console.log('\n🌟 a la Mode - FAST Brand Sync (New Products Only)\n');
  console.log('⚡ This script ONLY adds new products and skips all updates for speed!\n');
  
  if (shopifyOnly) {
    console.log('🛍️  Mode: Shopify brands only (FREE - no Apify costs!)\n');
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
      // Sync all active Shopify brands (new-only mode only supports Shopify)
      let query = supabase
        .from('brands')
        .select('*')
        .eq('is_active', true)
        .eq('platform', 'shopify')
        .order('name');
      
      const { data: brands, error } = await query;
      
      if (error) {
        console.error('❌ Error fetching brands:', error.message);
        process.exit(1);
      }
      
      brandsToSync = brands || [];
      console.log(`📋 Found ${brandsToSync.length} active Shopify brands to sync\n`);
    }
    
    if (brandsToSync.length === 0) {
      console.log('⚠️  No brands to sync');
      process.exit(0);
    }
    
    // Sync each brand
    const results = [];
    const startTime = Date.now();
    
    for (const brand of brandsToSync) {
      const result = await syncBrand(brand);
      
      // Get current product count for this brand
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('is_available', true);
      
      results.push({ brand: brand.name, total: productCount || 0, ...result });
      
      // Small delay between brands
      if (brandsToSync.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Print final summary report
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const totalAdded = results.reduce((sum, r) => sum + (r.added || 0), 0);
    const totalSkipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0);
    const totalFailed = results.reduce((sum, r) => sum + (r.failed || 0), 0);
    const grandTotal = results.reduce((sum, r) => sum + (r.total || 0), 0);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log('\n' + '='.repeat(95));
    console.log('🎉 FAST SHOPIFY SYNC COMPLETE - FINAL REPORT (NEW PRODUCTS ONLY)');
    console.log('='.repeat(95));
    
    console.log(`\n⏱️  Total time: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
    console.log(`\n📊 Overall Statistics:`);
    console.log(`   ✅ Brands successful: ${successCount}`);
    console.log(`   ❌ Brands failed: ${failedCount}`);
    console.log(`   ➕ Total products added: ${totalAdded}`);
    console.log(`   ⏭️  Total products skipped: ${totalSkipped}`);
    console.log(`   ⚠️  Total products failed: ${totalFailed}`);
    console.log(`   📦 Total products in database: ${grandTotal}`);
    
    console.log(`\n${'─'.repeat(95)}`);
    console.log('📋 Brand-by-Brand Breakdown:');
    console.log('─'.repeat(95));
    console.log(`${'Brand'.padEnd(25)} ${'Status'.padEnd(8)} ${'Added'.padEnd(7)} ${'Skipped'.padEnd(9)} ${'Failed'.padEnd(8)} ${'Total'.padEnd(8)} ${'Time'.padEnd(6)}`);
    console.log('─'.repeat(95));
    
    results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      const brandName = r.brand.length > 23 ? r.brand.substring(0, 20) + '...' : r.brand;
      console.log(
        `${brandName.padEnd(25)} ${status.padEnd(8)} ${String(r.added || 0).padEnd(7)} ${String(r.skipped || 0).padEnd(9)} ${String(r.failed || 0).padEnd(8)} ${String(r.total || 0).padEnd(8)} ${r.time || 0}s`
      );
    });
    
    console.log('─'.repeat(95));
    console.log(
      `${'TOTAL'.padEnd(25)} ${' '.padEnd(8)} ${String(totalAdded).padEnd(7)} ${String(totalSkipped).padEnd(9)} ${String(totalFailed).padEnd(8)} ${String(grandTotal).padEnd(8)}`
    );
    
    if (failedCount > 0) {
      console.log(`\n⚠️  Failed brands:`);
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.brand}: ${r.error || 'Unknown error'}`);
      });
    }
    
    console.log('\n💡 TIP: Run sync-all-brands.js 2x/week for full updates to existing products!');
    console.log('='.repeat(95) + '\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();
