#!/usr/bin/env node
/**
 * Sync All Apify Brands
 * 
 * Automatically syncs all active brands that have an apify_task_id configured.
 * 
 * Usage:
 *   node scripts/sync-all-apify-brands.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncAllApifyBrands() {
  console.log('🚀 Syncing All Apify Brands\n');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  // Fetch all active brands with apify_task_id
  const { data: brands, error } = await supabase
    .from('brands')
    .select('*')
    .eq('is_active', true);
  
  if (error) {
    console.error('❌ Error fetching brands:', error.message);
    return;
  }
  
  // Filter brands with apify_task_id
  const apifyBrands = brands.filter(brand => {
    const config = brand.scraper_config || {};
    return config.apify_task_id;
  });
  
  if (apifyBrands.length === 0) {
    console.log('⚠️  No brands with apify_task_id found');
    return;
  }
  
  console.log(`\n📋 Found ${apifyBrands.length} Apify brands to sync:\n`);
  apifyBrands.forEach((brand, i) => {
    console.log(`   ${i + 1}. ${brand.name} (${brand.slug})`);
  });
  console.log('\n' + '='.repeat(60) + '\n');
  
  const results = [];
  
  // Sync each brand
  for (let i = 0; i < apifyBrands.length; i++) {
    const brand = apifyBrands[i];
    console.log(`\n[${i + 1}/${apifyBrands.length}] Syncing: ${brand.name}`);
    console.log('-'.repeat(60));
    
    try {
      execSync(`node scripts/sync-products-from-apify.js ${brand.slug}`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      // Query the latest scrape log for this brand to get stats
      const { data: latestLog } = await supabase
        .from('product_scrape_logs')
        .select('*')
        .eq('brand_id', brand.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      
      // Get current product count for this brand
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('is_available', true);
      
      results.push({
        brand: brand.name,
        slug: brand.slug,
        success: true,
        added: latestLog?.products_added || 0,
        updated: latestLog?.products_updated || 0,
        deleted: latestLog?.products_deleted || 0,
        failed: 0,
        time: latestLog?.execution_time_seconds || 0,
        total: productCount || 0
      });
      
    } catch (error) {
      console.error(`\n❌ Failed to sync ${brand.name}`);
      
      // Still get current product count for failed brands
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('is_available', true);
      
      results.push({
        brand: brand.name,
        slug: brand.slug,
        success: false,
        added: 0,
        updated: 0,
        deleted: 0,
        failed: 0,
        time: 0,
        total: productCount || 0,
        error: error.message
      });
    }
  }
  
  // Print final summary report
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  const totalAdded = results.reduce((sum, r) => sum + (r.added || 0), 0);
  const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
  const totalDeleted = results.reduce((sum, r) => sum + (r.deleted || 0), 0);
  const grandTotal = results.reduce((sum, r) => sum + (r.total || 0), 0);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(90));
  console.log('🎉 APIFY SYNC COMPLETE - FINAL REPORT');
  console.log('='.repeat(90));
  
  console.log(`\n⏱️  Total time: ${minutes}m ${seconds}s`);
  console.log(`\n📊 Overall Statistics:`);
  console.log(`   ✅ Brands successful: ${successful}`);
  console.log(`   ❌ Brands failed: ${failed}`);
  console.log(`   ➕ Total products added: ${totalAdded}`);
  console.log(`   🔄 Total products updated: ${totalUpdated}`);
  console.log(`   🗑️  Total products deleted: ${totalDeleted}`);
  console.log(`   📦 Total products in database: ${grandTotal}`);
  
  console.log(`\n${'─'.repeat(90)}`);
  console.log('📋 Brand-by-Brand Breakdown:');
  console.log('─'.repeat(90));
  console.log(`${'Brand'.padEnd(25)} ${'Status'.padEnd(8)} ${'Added'.padEnd(7)} ${'Updated'.padEnd(9)} ${'Deleted'.padEnd(9)} ${'Total'.padEnd(8)} ${'Time'.padEnd(6)}`);
  console.log('─'.repeat(90));
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const brandName = r.brand.length > 23 ? r.brand.substring(0, 20) + '...' : r.brand;
    console.log(
      `${brandName.padEnd(25)} ${status.padEnd(8)} ${String(r.added || 0).padEnd(7)} ${String(r.updated || 0).padEnd(9)} ${String(r.deleted || 0).padEnd(9)} ${String(r.total || 0).padEnd(8)} ${r.time || 0}s`
    );
  });
  
  console.log('─'.repeat(90));
  console.log(
    `${'TOTAL'.padEnd(25)} ${' '.padEnd(8)} ${String(totalAdded).padEnd(7)} ${String(totalUpdated).padEnd(9)} ${String(totalDeleted).padEnd(9)} ${String(grandTotal).padEnd(8)}`
  );
  
  if (failed > 0) {
    console.log(`\n⚠️  Failed brands:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.brand} (${r.slug})`);
    });
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
}

syncAllApifyBrands()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
