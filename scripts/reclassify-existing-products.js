#!/usr/bin/env node

/**
 * Reclassify Existing Products with Shopify Taxonomy
 * 
 * Updates all existing products in the database with proper taxonomy classifications.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { classifyProduct } = require('./scrapers/taxonomy-classifier');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

async function reclassifyProducts() {
  console.log('🔄 Reclassifying Existing Products...\n');

  // Get all products
  console.log('📥 Fetching products from database...');
  const { data: products, error: fetchError } = await supabase
    .from('products')
    .select('id, name, description')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('❌ Error fetching products:', fetchError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${products.length} products\n`);

  if (products.length === 0) {
    console.log('No products to classify!');
    return;
  }

  // Classify each product
  console.log('🏷️  Classifying products...');
  let classified = 0;
  let unclassified = 0;
  const updates = [];

  for (const product of products) {
    const classification = classifyProduct({
      name: product.name,
      product_type: '',
      description: product.description
    });

    if (classification) {
      updates.push({
        id: product.id,
        ...classification
      });
      classified++;
    } else {
      unclassified++;
    }

    // Progress indicator
    const total = classified + unclassified;
    if (total % 100 === 0) {
      process.stdout.write(`   Processed ${total}/${products.length} products\r`);
    }
  }

  console.log(`   Processed ${products.length}/${products.length} products\n`);

  // Show classification summary
  console.log('📊 Classification Summary:');
  console.log(`   ✅ Classified: ${classified} products (${Math.round(classified / products.length * 100)}%)`);
  console.log(`   ❌ Unclassified: ${unclassified} products (${Math.round(unclassified / products.length * 100)}%)\n`);

  if (updates.length === 0) {
    console.log('⚠️  No products could be classified. Check your product names.');
    return;
  }

  // Show sample classifications
  console.log('📋 Sample Classifications:');
  const samples = updates.slice(0, 5);
  for (const sample of samples) {
    const product = products.find(p => p.id === sample.id);
    console.log(`   • "${product.name}"`);
    console.log(`     → ${sample.taxonomy_category_name}`);
  }
  console.log('');

  // Ask for confirmation
  console.log(`📝 Ready to update ${updates.length} products in database.`);
  console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Update in batches
  console.log('💾 Updating database...');
  const BATCH_SIZE = 100;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    for (const update of batch) {
      const { id, ...fields } = update;
      
      const { error } = await supabase
        .from('products')
        .update(fields)
        .eq('id', id);

      if (error) {
        console.error(`   ❌ Failed to update product ${id}:`, error.message);
        failed++;
      } else {
        updated++;
      }
    }

    process.stdout.write(`   Updated ${updated}/${updates.length} products\r`);
  }

  console.log('\n');

  // Final summary
  if (failed > 0) {
    console.log(`⚠️  ${failed} products failed to update`);
  }

  console.log(`✅ Successfully updated ${updated} products!\n`);

  // Show category breakdown
  console.log('📊 Category Breakdown:');
  const categoryCount = {};
  for (const update of updates) {
    const cat = update.taxonomy_category_name;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  }

  const sortedCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  for (const [category, count] of sortedCategories) {
    console.log(`   • ${category}: ${count} products`);
  }

  console.log('\n✅ Reclassification complete!');
  console.log('\n🎯 Next Steps:');
  console.log('   1. Verify: SELECT taxonomy_category_name, COUNT(*) FROM products GROUP BY taxonomy_category_name;');
  console.log('   2. View: SELECT * FROM category_product_counts;');
  console.log('   3. Test filtering in your app');

  // Handle unclassified products
  if (unclassified > 0) {
    console.log(`\n💡 ${unclassified} products remain unclassified.`);
    console.log('   These may need manual review or additional classification rules.');
    console.log('   Query them with: SELECT * FROM products WHERE taxonomy_id IS NULL;');
  }
}

// Run
reclassifyProducts().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
