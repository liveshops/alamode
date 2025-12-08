// Test script to verify Supabase connection
// Run with: npx ts-node test-supabase-connection.ts

import { supabase, testSupabaseConnection } from './utils/supabase';

async function runTest() {
  console.log('🔄 Testing Supabase connection...');
  
  // Test connection
  const isConnected = await testSupabaseConnection();
  
  if (isConnected) {
    // Try to fetch brands
    const { data: brands, error } = await supabase
      .from('brands')
      .select('*')
      .limit(5);
      
    if (error) {
      console.error('❌ Error fetching brands:', error);
    } else {
      console.log('✅ Successfully fetched brands:', brands?.length || 0, 'brands found');
      if (brands && brands.length > 0) {
        console.log('Sample brand:', brands[0].name);
      }
    }
  }
}

runTest().catch(console.error);
