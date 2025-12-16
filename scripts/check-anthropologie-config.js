#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAnthropologie() {
  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', 'anthropologie')
    .single();

  if (!brand) {
    console.log('❌ Anthropologie brand not found');
    return;
  }

  console.log('📋 Anthropologie Configuration:');
  console.log(`   Name: ${brand.name}`);
  console.log(`   Website: ${brand.website_url}`);
  console.log(`   Platform: ${brand.platform}`);
  console.log(`   Active: ${brand.is_active}`);
  console.log(`   Config: ${JSON.stringify(brand.scraper_config, null, 2)}`);
}

checkAnthropologie()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
