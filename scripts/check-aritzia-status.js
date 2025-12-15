#!/usr/bin/env node
/**
 * Quick diagnostic to check Aritzia products in database
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAritzia() {
  console.log('🔍 Checking Aritzia products...\n');

  // Check brand
  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', 'aritzia')
    .single();

  if (!brand) {
    console.error('❌ Aritzia brand not found!');
    return;
  }

  console.log('✅ Brand:', brand.name);
  console.log('   Active:', brand.is_active);
  console.log('   Last synced:', brand.last_synced_at);
  console.log('');

  // Check products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('brand_id', brand.id)
    .limit(10);

  console.log(`📦 Total products: ${products?.length || 0}`);
  
  if (products && products.length > 0) {
    // Count by availability
    const available = products.filter(p => p.is_available).length;
    const unavailable = products.filter(p => !p.is_available).length;
    
    console.log(`   ✅ Available: ${available}`);
    console.log(`   ❌ Unavailable: ${unavailable}`);
    console.log('');

    // Show first product details
    const firstProduct = products[0];
    console.log('📋 Sample product:');
    console.log('   Name:', firstProduct.name);
    console.log('   Price:', firstProduct.price);
    console.log('   Available:', firstProduct.is_available);
    console.log('   Image URL:', firstProduct.image_url ? '✅ Has image' : '❌ No image');
    console.log('   Variants:', JSON.stringify(firstProduct.variants, null, 2));
  }

  // Test get_shop_brands function
  console.log('\n🔬 Testing get_shop_brands function...');
  const { data: shopBrands } = await supabase
    .rpc('get_shop_brands', {
      p_user_id: null,
      p_products_per_brand: 6
    });

  const aritziaInShop = shopBrands?.find(b => b.slug === 'aritzia');
  
  if (aritziaInShop) {
    console.log('✅ Aritzia appears in shop');
    console.log('   Products returned:', aritziaInShop.products?.length || 0);
  } else {
    console.log('❌ Aritzia NOT in shop results');
  }
}

checkAritzia()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
