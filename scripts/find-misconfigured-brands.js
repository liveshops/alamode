#!/usr/bin/env node
/**
 * Find brands with platform/config mismatches
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findMisconfigured() {
  console.log('🔍 Checking for misconfigured brands...\n');
  
  const { data: brands, error } = await supabase
    .from('brands')
    .select('*')
    .eq('is_active', true);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  const issues = [];
  
  brands.forEach(brand => {
    const config = brand.scraper_config || {};
    const hasApifyTaskId = !!config.apify_task_id;
    const isShopifyPlatform = brand.platform === 'shopify';
    
    // Issue 1: Shopify platform but has Apify task ID
    if (isShopifyPlatform && hasApifyTaskId) {
      issues.push({
        brand: brand.name,
        slug: brand.slug,
        issue: 'Marked as Shopify but has apify_task_id',
        fix: `UPDATE brands SET platform = 'custom' WHERE slug = '${brand.slug}';`
      });
    }
    
    // Issue 2: Custom platform but no Apify task ID and not in CUSTOM_SCRAPERS
    const customScrapers = ['zara', 'stradivarius'];
    if (brand.platform === 'custom' && !hasApifyTaskId && !customScrapers.includes(brand.slug)) {
      issues.push({
        brand: brand.name,
        slug: brand.slug,
        issue: 'Custom platform but no apify_task_id',
        fix: `Either add apify_task_id or change to shopify platform`
      });
    }
  });
  
  if (issues.length === 0) {
    console.log('✅ All brands are correctly configured!');
    return;
  }
  
  console.log(`⚠️  Found ${issues.length} misconfigured brands:\n`);
  
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue.brand} (${issue.slug})`);
    console.log(`   Issue: ${issue.issue}`);
    console.log(`   Fix: ${issue.fix}\n`);
  });
  
  // Generate fix script
  console.log('\n📝 SQL to fix all issues:\n');
  console.log('-- Run this in Supabase SQL Editor --\n');
  issues.forEach(issue => {
    if (issue.fix.startsWith('UPDATE')) {
      console.log(issue.fix);
    }
  });
}

findMisconfigured()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
