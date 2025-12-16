#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDuplicates() {
  console.log('🔍 Checking For Love and Lemons for duplicates...\n');
  
  // Get brand
  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', 'love-lemons')
    .single();
  
  if (!brand) {
    console.log('❌ Brand not found');
    return;
  }
  
  console.log(`📋 Brand: ${brand.name} (ID: ${brand.id})`);
  console.log(`   Platform: ${brand.platform}`);
  console.log(`   Config: ${JSON.stringify(brand.scraper_config, null, 2)}\n`);
  
  // Get all products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, external_id, created_at')
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false });
  
  console.log(`📦 Total products: ${products.length}\n`);
  
  // Find duplicates by name
  const nameMap = {};
  products.forEach(p => {
    if (!nameMap[p.name]) {
      nameMap[p.name] = [];
    }
    nameMap[p.name].push(p);
  });
  
  const duplicateNames = Object.entries(nameMap).filter(([name, prods]) => prods.length > 1);
  
  if (duplicateNames.length === 0) {
    console.log('✅ No duplicate product names found');
  } else {
    console.log(`⚠️  Found ${duplicateNames.length} products with duplicate names:\n`);
    
    duplicateNames.slice(0, 10).forEach(([name, prods]) => {
      console.log(`📍 "${name}" (${prods.length} copies):`);
      prods.forEach(p => {
        console.log(`   - ID: ${p.id}`);
        console.log(`     External ID: ${p.external_id || 'NULL'}`);
        console.log(`     Created: ${new Date(p.created_at).toLocaleString()}`);
      });
      console.log('');
    });
    
    if (duplicateNames.length > 10) {
      console.log(`   ... and ${duplicateNames.length - 10} more\n`);
    }
  }
  
  // Check for NULL or empty external_ids
  const missingExternalId = products.filter(p => !p.external_id);
  if (missingExternalId.length > 0) {
    console.log(`\n⚠️  ${missingExternalId.length} products missing external_id:`);
    missingExternalId.slice(0, 5).forEach(p => {
      console.log(`   - ${p.name} (ID: ${p.id})`);
    });
    if (missingExternalId.length > 5) {
      console.log(`   ... and ${missingExternalId.length - 5} more`);
    }
  }
  
  // Find duplicate external_ids (shouldn't happen with unique constraint)
  const externalIdMap = {};
  products.forEach(p => {
    if (p.external_id) {
      if (!externalIdMap[p.external_id]) {
        externalIdMap[p.external_id] = [];
      }
      externalIdMap[p.external_id].push(p);
    }
  });
  
  const duplicateExternalIds = Object.entries(externalIdMap).filter(([id, prods]) => prods.length > 1);
  if (duplicateExternalIds.length > 0) {
    console.log(`\n⚠️  Found ${duplicateExternalIds.length} duplicate external_ids (SHOULD NOT HAPPEN):\n`);
    duplicateExternalIds.slice(0, 5).forEach(([extId, prods]) => {
      console.log(`   External ID: ${extId}`);
      prods.forEach(p => {
        console.log(`      - "${p.name}" (DB ID: ${p.id})`);
      });
    });
  }
}

checkDuplicates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
