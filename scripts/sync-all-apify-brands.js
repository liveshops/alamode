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
    console.log(`\n[${ i + 1}/${apifyBrands.length}] Syncing: ${brand.name}`);
    console.log('-'.repeat(60));
    
    try {
      execSync(`node scripts/sync-products-from-apify.js ${brand.slug}`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      results.push({
        brand: brand.name,
        slug: brand.slug,
        success: true
      });
      
    } catch (error) {
      console.error(`\n❌ Failed to sync ${brand.name}`);
      results.push({
        brand: brand.name,
        slug: brand.slug,
        success: false,
        error: error.message
      });
    }
  }
  
  // Print summary
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 SYNC COMPLETE');
  console.log('='.repeat(60));
  console.log(`\n⏱️  Total time: ${minutes}m ${seconds}s`);
  console.log(`📊 Results:\n`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log(`\n❌ Failed brands:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.brand} (${r.slug})`);
    });
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

syncAllApifyBrands()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
