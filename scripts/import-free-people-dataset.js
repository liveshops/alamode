#!/usr/bin/env node
/**
 * Import Free People products from Apify dataset
 * 
 * Quick script to import products from an existing Apify dataset
 * without running the actor again
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { classifyProduct } = require('./scrapers/taxonomy-classifier');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Get dataset ID from command line argument or use default
const datasetId = process.argv[2] || '3GW6eMacWqJ8S4kC0';
const DATASET_URL = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${process.env.APIFY_API_TOKEN}`;

async function importDataset() {
  console.log('🏷️  Importing Free People products from Apify dataset...');
  console.log(`📦 Dataset ID: ${datasetId}\n`);

  try {
    // Get brand ID
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id')
      .eq('slug', 'free-people')
      .single();

    if (brandError || !brand) {
      console.error('❌ Free People brand not found in database');
      process.exit(1);
    }

    console.log(`✅ Found Free People brand (ID: ${brand.id})\n`);

    // Fetch dataset
    console.log('📥 Fetching products from Apify...');
    const response = await fetch(DATASET_URL);
    const products = await response.json();

    console.log(`✅ Fetched ${products.length} products\n`);

    // Process products
    let added = 0;
    let updated = 0;
    let failed = 0;

    console.log('📦 Processing products...\n');

    for (const item of products) {
      try {
        // Parse product from Apify format
        const productId = item.mpn || item.additionalProperties?.sku;
        const name = item.name;
        const price = parseFloat(item.offers?.price || 0);
        const imageUrl = item.image;
        const description = item.description || '';
        const productUrl = item.url;

        // Get additional images
        const additionalImages = (item.additionalProperties?.images || [])
          .slice(1, 5)
          .map(img => img.url);

        // Classify with taxonomy
        const taxonomy = classifyProduct({
          name: name,
          product_type: '',
          description: description
        });

        // Build product data
        const productData = {
          brand_id: brand.id,
          external_id: productId,
          name: name,
          description: description,
          price: price,
          image_url: imageUrl,
          additional_images: additionalImages,
          product_url: productUrl,
          is_available: true,
          ...taxonomy
        };

        // Check if product exists
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('brand_id', brand.id)
          .eq('external_id', productId)
          .single();

        if (existing) {
          // Update
          const { error } = await supabase
            .from('products')
            .update(productData)
            .eq('id', existing.id);

          if (error) {
            console.error(`  ❌ Failed to update: ${name}`);
            failed++;
          } else {
            console.log(`  🔄 Updated: ${name}`);
            updated++;
          }
        } else {
          // Insert
          const { error } = await supabase
            .from('products')
            .insert(productData);

          if (error) {
            console.error(`  ❌ Failed to add: ${name}`, error.message);
            failed++;
          } else {
            console.log(`  ✅ Added: ${name}`);
            added++;
          }
        }

      } catch (error) {
        console.error(`  ❌ Error processing product: ${error.message}`);
        failed++;
      }
    }

    console.log('\n📊 Import Summary:');
    console.log(`   ➕ Added: ${added}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️  Total: ${products.length}`);
    console.log('\n✅ Import complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

importDataset();
