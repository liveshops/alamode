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
const { prewarmRecentImages } = require('./prewarm-images');
const { printSyncReport } = require('./lib/print-sync-report');

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
  
  // Print final summary report (shared with `npm run sync-report`)
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  const { totalAdded } = printSyncReport(results, { elapsedSeconds });
  
  // Send notifications for brands that added new products
  if (totalAdded > 0) {
    console.log('📱 Sending brand notifications...');
    try {
      const { data: notifResult, error: notifError } = await supabase.rpc('trigger_brand_notifications_now', {
        approach: 'daily'
      });
      if (notifError) {
        console.error('⚠️  Notification error:', notifError.message);
      } else if (notifResult && notifResult.length > 0) {
        console.log(`✅ Sent notifications for ${notifResult[0].notifications_sent} brands (${notifResult[0].execution_time})`);
      } else {
        console.log('ℹ️  No pending notifications to send');
      }
    } catch (err) {
      console.error('⚠️  Notification error:', err.message);
    }
    console.log('');
  }

  // Pre-warm Cloudinary cache for newly added non-Shopify images so the first users
  // to open the New Today feed get instant CDN hits instead of cold transforms.
  // Shopify images are skipped inside prewarmRecentImages (already fast on Shopify CDN).
  if (totalAdded > 0) {
    try {
      const elapsedHours = Math.max(1, Math.ceil((Date.now() - startTime) / (60 * 60 * 1000)) + 1);
      await prewarmRecentImages({ hours: elapsedHours });
    } catch (err) {
      console.error('⚠️  Image pre-warm error:', err.message);
    }
  }
}

syncAllApifyBrands()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
