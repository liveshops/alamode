#!/usr/bin/env node
/**
 * Check why recently synced Aritzia products are unavailable
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUnavailableProducts() {
  console.log('🔍 Checking unavailable Aritzia products...\n');

  // Get Aritzia brand
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name')
    .eq('slug', 'aritzia')
    .single();

  if (!brand) {
    console.error('❌ Aritzia not found');
    return;
  }

  // Get all products
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name, is_available, variants, created_at')
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false });

  const available = allProducts?.filter(p => p.is_available) || [];
  const unavailable = allProducts?.filter(p => !p.is_available) || [];

  console.log(`📦 Total products: ${allProducts?.length || 0}`);
  console.log(`   ✅ Available: ${available.length}`);
  console.log(`   ❌ Unavailable: ${unavailable.length}\n`);

  // Check recent unavailable products
  console.log('🔎 Recent unavailable products (first 5):\n');
  
  unavailable.slice(0, 5).forEach((product, idx) => {
    console.log(`${idx + 1}. ${product.name}`);
    console.log(`   Created: ${new Date(product.created_at).toLocaleString()}`);
    console.log(`   Variants: ${JSON.stringify(product.variants, null, 2)}`);
    
    // Analyze variants
    if (Array.isArray(product.variants)) {
      const hasStockStatus = product.variants.some(v => v.price?.stockStatus);
      const inStockCount = product.variants.filter(v => v.price?.stockStatus === 'InStock').length;
      console.log(`   Has stock status: ${hasStockStatus}`);
      console.log(`   In stock variants: ${inStockCount}/${product.variants.length}`);
    } else {
      console.log(`   ⚠️  Variants is not an array: ${typeof product.variants}`);
    }
    console.log('');
  });

  // Check one available product for comparison
  if (available.length > 0) {
    console.log('✅ Sample available product for comparison:\n');
    const sample = available[0];
    console.log(`   Name: ${sample.name}`);
    console.log(`   Variants: ${JSON.stringify(sample.variants, null, 2)}`);
  }
}

checkUnavailableProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
