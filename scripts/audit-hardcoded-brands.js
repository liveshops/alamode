#!/usr/bin/env node
/**
 * Audit hardcoded brands in sync-all-brands.js
 * Check if they should use database configuration instead
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Brands currently hardcoded in CUSTOM_SCRAPERS
const hardcodedBrands = [
  'zara',
  'aritzia',
  'hm',
  'free-people',
  'stradivarius',
  'cult-mia',
  'altard-state'
];

async function auditBrands() {
  console.log('🔍 Auditing hardcoded brands...\n');

  for (const slug of hardcodedBrands) {
    const { data: brand } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', slug)
      .single();

    if (!brand) {
      console.log(`❌ ${slug}: NOT FOUND IN DATABASE\n`);
      continue;
    }

    console.log(`📋 ${brand.name} (${slug}):`);
    console.log(`   Platform: ${brand.platform}`);
    console.log(`   Active: ${brand.is_active}`);
    console.log(`   Config: ${JSON.stringify(brand.scraper_config, null, 2)}`);
    
    // Determine if it needs custom scraper
    const needsCustom = brand.platform === 'custom' || 
                        brand.scraper_config?.type === 'custom' ||
                        brand.scraper_config?.apify_task_id;
    
    if (needsCustom) {
      console.log(`   ✅ Needs custom scraper (non-standard platform)\n`);
    } else if (brand.platform === 'shopify') {
      console.log(`   ⚠️  Could use ShopifyScraper (remove from hardcoded list)\n`);
    } else {
      console.log(`   ⚠️  Check if can use standard scraper\n`);
    }
  }
}

auditBrands()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
