#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findBrand() {
  console.log('🔍 Searching for "For Love and Lemons" brand...\n');
  
  // Search by name pattern
  const { data: brands } = await supabase
    .from('brands')
    .select('*')
    .ilike('name', '%love%lemons%');
  
  if (brands && brands.length > 0) {
    console.log(`Found ${brands.length} matching brands:\n`);
    brands.forEach(b => {
      console.log(`   - ${b.name} (slug: ${b.slug})`);
    });
  } else {
    console.log('❌ No brands found matching "love" and "lemons"');
    
    // Try just "love"
    const { data: loveBrands } = await supabase
      .from('brands')
      .select('name, slug')
      .ilike('name', '%love%');
    
    if (loveBrands && loveBrands.length > 0) {
      console.log('\n📋 Brands with "love" in name:');
      loveBrands.forEach(b => console.log(`   - ${b.name} (${b.slug})`));
    }
  }
}

findBrand()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
