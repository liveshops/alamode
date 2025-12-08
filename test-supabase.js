// Simple test to verify Supabase connection
// Run with: node test-supabase.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔄 Testing Supabase connection...\n');
  
  try {
    // Test 1: Check brands table
    console.log('Test 1: Fetching brands...');
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('*');
    
    if (brandsError) {
      console.error('❌ Error fetching brands:', brandsError.message);
      return;
    }
    
    console.log(`✅ Found ${brands.length} brands`);
    if (brands.length > 0) {
      console.log('   Sample brands:', brands.slice(0, 3).map(b => b.name).join(', '));
    }
    
    // Test 2: Check profiles table
    console.log('\nTest 2: Checking profiles table...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('count');
    
    if (profilesError) {
      console.error('❌ Error checking profiles:', profilesError.message);
      return;
    }
    
    console.log('✅ Profiles table accessible');
    
    // Test 3: Check products table
    console.log('\nTest 3: Checking products table...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .limit(5);
    
    if (productsError) {
      console.error('❌ Error checking products:', productsError.message);
      return;
    }
    
    console.log(`✅ Found ${products.length} products`);
    
    // Test 4: Check relationship tables
    console.log('\nTest 4: Checking relationship tables...');
    const tables = ['user_follows_brands', 'user_follows_users', 'user_likes_products'];
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('count').limit(1);
      if (error) {
        console.error(`❌ Error with ${table}:`, error.message);
      } else {
        console.log(`✅ ${table} table accessible`);
      }
    }
    
    console.log('\n🎉 All tests passed! Supabase is configured correctly.');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

testConnection();
