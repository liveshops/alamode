#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkBrand() {
  const slug = process.argv[2] || 'isle-of-view';
  
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('Brand configuration:');
  console.log('  Name:', data.name);
  console.log('  Slug:', data.slug);
  console.log('  Website:', data.website_url);
  console.log('  Platform:', data.platform);
  console.log('  Scraper Config:', data.scraper_config);
}

checkBrand();
