#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkHandover() {
  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', 'handover')
    .single();

  if (!brand) {
    console.log('❌ Handover brand not found');
    return;
  }

  console.log('📋 Handover Brand Configuration:');
  console.log(`   Name: ${brand.name}`);
  console.log(`   Website: ${brand.website_url}`);
  console.log(`   Platform: ${brand.platform}`);
  console.log(`   Active: ${brand.is_active}`);
  console.log(`   Config: ${JSON.stringify(brand.scraper_config, null, 2)}`);
}

checkHandover()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
