#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAsos() {
  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', 'asos')
    .single();

  if (!brand) {
    console.log('❌ ASOS brand not found in database');
    return;
  }

  console.log('📋 ASOS Brand Status:');
  console.log(`   Name: ${brand.name}`);
  console.log(`   Active: ${brand.is_active}`);
  console.log(`   Platform: ${brand.platform || 'N/A'}`);
  console.log(`   Scraper config: ${JSON.stringify(brand.scraper_config, null, 2)}`);
  console.log(`   Last synced: ${brand.last_synced_at || 'Never'}`);
}

checkAsos()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
