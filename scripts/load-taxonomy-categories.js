#!/usr/bin/env node

/**
 * Load Shopify Product Taxonomy into Database
 * 
 * Reads the downloaded taxonomy JSON and loads the "Apparel & Accessories" 
 * vertical into the product_categories table.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

const TAXONOMY_FILE = path.join(__dirname, 'shopify-taxonomy.json');

async function loadTaxonomy() {
  console.log('🏷️  Loading Shopify Product Taxonomy...\n');

  // Check if file exists
  if (!fs.existsSync(TAXONOMY_FILE)) {
    console.error('❌ Taxonomy file not found:', TAXONOMY_FILE);
    console.log('\nDownload it first:');
    console.log('curl -o scripts/shopify-taxonomy.json \\');
    console.log('  https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.json');
    process.exit(1);
  }

  // Read taxonomy file
  console.log('📖 Reading taxonomy file...');
  const taxonomyData = JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf8'));
  console.log(`   Version: ${taxonomyData.version}\n`);

  // Find Apparel & Accessories vertical
  const apparelVertical = taxonomyData.verticals.find(
    v => v.name === 'Apparel & Accessories'
  );

  if (!apparelVertical) {
    console.error('❌ Could not find Apparel & Accessories vertical');
    process.exit(1);
  }

  console.log(`✅ Found vertical: ${apparelVertical.name} (${apparelVertical.prefix})`);
  console.log(`   Categories: ${apparelVertical.categories.length}\n`);

  // Transform categories for insertion
  const categories = apparelVertical.categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    full_name: cat.full_name,
    parent_id: cat.parent_id,
    level: cat.level,
    vertical: apparelVertical.name,
    attributes: cat.attributes || []
  }));

  console.log(`📦 Prepared ${categories.length} categories for insertion\n`);

  // Delete existing categories (fresh start)
  console.log('🗑️  Clearing existing taxonomy data...');
  const { error: deleteError } = await supabase
    .from('product_categories')
    .delete()
    .neq('id', ''); // Delete all

  if (deleteError && deleteError.code !== 'PGRST116') { // PGRST116 = no rows to delete
    console.error('❌ Error clearing data:', deleteError.message);
    // Continue anyway, might be first run
  }

  // Insert in batches (Supabase has a limit)
  const BATCH_SIZE = 100;
  let inserted = 0;
  let failed = 0;

  console.log('📥 Inserting categories...');
  
  for (let i = 0; i < categories.length; i += BATCH_SIZE) {
    const batch = categories.slice(i, i + BATCH_SIZE);
    
    const { data, error } = await supabase
      .from('product_categories')
      .insert(batch);

    if (error) {
      console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      failed += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`   ✅ Inserted ${inserted}/${categories.length} categories\r`);
    }
  }

  console.log('\n');

  // Verify insertion
  const { count, error: countError } = await supabase
    .from('product_categories')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error verifying:', countError.message);
  } else {
    console.log(`✅ Verification: ${count} categories in database\n`);
  }

  // Show summary stats
  console.log('📊 Category Breakdown:');
  
  const levels = categories.reduce((acc, cat) => {
    acc[cat.level] = (acc[cat.level] || 0) + 1;
    return acc;
  }, {});

  Object.entries(levels).forEach(([level, count]) => {
    const label = ['Top Level', 'Category', 'Subcategory', 'Sub-subcategory'][level] || `Level ${level}`;
    console.log(`   Level ${level} (${label}): ${count} categories`);
  });

  console.log('\n📋 Example Categories:');
  const examples = [
    'Dresses',
    'Tops',
    'Pants',
    'Swimwear & Beachwear',
    'Activewear'
  ];

  for (const exampleName of examples) {
    const category = categories.find(c => c.name === exampleName);
    if (category) {
      const children = categories.filter(c => c.parent_id === category.id);
      console.log(`   • ${category.name} (${category.id})`);
      console.log(`     → ${children.length} subcategories`);
    }
  }

  console.log('\n✅ Taxonomy loaded successfully!');
  console.log('\n🎯 Next Steps:');
  console.log('   1. New product syncs will auto-classify using taxonomy');
  console.log('   2. Run reclassification script for existing products:');
  console.log('      node scripts/reclassify-existing-products.js');
  console.log('   3. Query categories:');
  console.log('      SELECT * FROM category_product_counts;');
}

// Run
loadTaxonomy().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
