#!/usr/bin/env node
/**
 * Analyze the actual products in the database
 * Compare the 47 showing vs 23 not showing
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeProducts() {
  console.log('🔍 Analyzing Aritzia products in database...\n');

  // Get brand
  const { data: brand } = await supabase
    .from('brands')
    .select('id')
    .eq('slug', 'aritzia')
    .single();

  // Get all products
  const { data: allProducts } = await supabase
    .from('products')
    .select('*')
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false });

  console.log(`📦 Total products: ${allProducts.length}\n`);

  // Group by created date
  const today = new Date();
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(today.getDate() - 2);

  const recentProducts = allProducts.filter(p => new Date(p.created_at) > twoDaysAgo);
  const olderProducts = allProducts.filter(p => new Date(p.created_at) <= twoDaysAgo);

  console.log(`📅 Recent products (last 2 days): ${recentProducts.length}`);
  console.log(`📅 Older products: ${olderProducts.length}\n`);

  // Compare field differences
  console.log('🔬 Comparing field values:\n');
  
  const compareField = (field, label) => {
    const recentValues = {};
    const olderValues = {};
    
    recentProducts.forEach(p => {
      const val = p[field] === null ? 'NULL' : p[field] === undefined ? 'UNDEFINED' : String(p[field]);
      recentValues[val] = (recentValues[val] || 0) + 1;
    });
    
    olderProducts.forEach(p => {
      const val = p[field] === null ? 'NULL' : p[field] === undefined ? 'UNDEFINED' : String(p[field]);
      olderValues[val] = (olderValues[val] || 0) + 1;
    });
    
    console.log(`   ${label}:`);
    console.log(`      Recent: ${JSON.stringify(recentValues)}`);
    console.log(`      Older:  ${JSON.stringify(olderValues)}`);
  };

  compareField('is_available', 'is_available');
  compareField('taxonomy_id', 'taxonomy_id');
  compareField('taxonomy_category_name', 'taxonomy_category_name');

  // Check specific product details
  console.log('\n📋 Sample recent product:');
  if (recentProducts.length > 0) {
    const recent = recentProducts[0];
    console.log(`   Name: ${recent.name}`);
    console.log(`   is_available: ${recent.is_available}`);
    console.log(`   taxonomy_id: ${recent.taxonomy_id || 'NULL'}`);
    console.log(`   taxonomy_category_name: ${recent.taxonomy_category_name || 'NULL'}`);
    console.log(`   image_url: ${recent.image_url ? 'EXISTS' : 'NULL'}`);
    console.log(`   variants: ${JSON.stringify(recent.variants).substring(0, 100)}...`);
  }

  console.log('\n📋 Sample older product:');
  if (olderProducts.length > 0) {
    const older = olderProducts[0];
    console.log(`   Name: ${older.name}`);
    console.log(`   is_available: ${older.is_available}`);
    console.log(`   taxonomy_id: ${older.taxonomy_id || 'NULL'}`);
    console.log(`   taxonomy_category_name: ${older.taxonomy_category_name || 'NULL'}`);
    console.log(`   image_url: ${older.image_url ? 'EXISTS' : 'NULL'}`);
    console.log(`   variants: ${JSON.stringify(older.variants).substring(0, 100)}...`);
  }

  // Test what get_shop_brands returns
  console.log('\n🧪 Testing get_shop_brands function...');
  const { data: shopBrands, error: shopError } = await supabase
    .rpc('get_shop_brands', {
      p_user_id: null,
      p_products_per_brand: 100  // Get ALL products
    });

  if (shopError) {
    console.error('   Error:', shopError);
  } else {
    const aritziaData = shopBrands.find(b => b.slug === 'aritzia');
    if (aritziaData) {
      console.log(`   Products returned by function: ${aritziaData.products?.length || 0}`);
      
      // Check if any recent products are in the result
      if (aritziaData.products) {
        const recentProductIds = new Set(recentProducts.map(p => p.id));
        const returnedRecentCount = aritziaData.products.filter(p => recentProductIds.has(p.id)).length;
        console.log(`   Recent products in result: ${returnedRecentCount}/${recentProducts.length}`);
      }
    }
  }

  // Check RLS policies by querying as anon
  console.log('\n🔒 Testing RLS (anon user)...');
  const anonClient = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: anonProducts, error: anonError } = await anonClient
    .from('products')
    .select('id')
    .eq('brand_id', brand.id)
    .eq('is_available', true);

  if (anonError) {
    console.error('   Error:', anonError);
  } else {
    console.log(`   Products visible to anon: ${anonProducts?.length || 0}`);
  }
}

analyzeProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
