#!/usr/bin/env node
/**
 * Import ASOS products from Apify dataset
 * 
 * Quick script to import products from an existing Apify dataset
 * without running the actor again. Same workflow as Free People & Aritzia.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { classifyProduct } = require('./scrapers/taxonomy-classifier');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Get dataset ID from command line argument
const datasetId = process.argv[2];
if (!datasetId) {
  console.error('❌ Error: Please provide a dataset ID');
  console.log('Usage: node scripts/import-asos-dataset.js <dataset_id>');
  process.exit(1);
}

const DATASET_URL = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${process.env.APIFY_API_TOKEN}`;

async function importDataset() {
  console.log('🏷️  Importing ASOS products from Apify dataset...');
  console.log(`📦 Dataset ID: ${datasetId}\n`);

  try {
    // Get ASOS brand from database
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', 'asos')
      .single();

    if (brandError || !brand) {
      throw new Error('ASOS brand not found in database. Add it with SQL first.');
    }

    console.log(`✅ Found brand: ${brand.name} (ID: ${brand.id})\n`);

    // Fetch dataset from Apify
    console.log('📥 Fetching products from Apify...');
    const response = await fetch(DATASET_URL);
    
    if (!response.ok) {
      throw new Error(`Apify API error: ${response.statusText}`);
    }

    const products = await response.json();
    console.log(`✅ Fetched ${products.length} products\n`);

    let added = 0;
    let updated = 0;
    let failed = 0;

    // Process each product
    for (const item of products) {
      try {
        // Extract product data from Apify result
        const productData = {
          brand_id: brand.id,
          external_id: String(item.mpn || item.additionalProperties?.sku || item.sku || item.productID || `asos-${Date.now()}-${Math.random()}`),
          name: item.name,
          description: item.description || '',
          price: parseFloat(item.offers?.price || item.price || 0),
          sale_price: item.offers?.salePrice ? parseFloat(item.offers.salePrice) : null,
          currency: item.offers?.priceCurrency || 'USD',
          image_url: item.image || item.imageUrl,
          additional_images: item.additionalProperties?.images?.map(img => img.url) || [],
          product_url: item.url || item.productUrl,
          variants: item.additionalProperties?.variants || []
        };

        // Classify using Shopify taxonomy
        const taxonomyData = classifyProduct(productData);
        Object.assign(productData, taxonomyData);

        // Check if product already exists
        const { data: existing } = await supabase
          .from('products')
          .select('id, price')
          .eq('brand_id', brand.id)
          .eq('external_id', productData.external_id)
          .single();

        if (existing) {
          // Update existing product
          const { error: updateError } = await supabase
            .from('products')
            .update(productData)
            .eq('id', existing.id);

          if (updateError) {
            console.log(`  ❌ Failed to update: ${productData.name}`);
            failed++;
          } else {
            console.log(`  🔄 Updated: ${productData.name}`);
            updated++;
          }
        } else {
          // Insert new product
          const { error: insertError } = await supabase
            .from('products')
            .insert(productData);

          if (insertError) {
            console.log(`  ❌ Failed to add: ${insertError.message}`);
            failed++;
          } else {
            console.log(`  ✅ Added: ${productData.name}`);
            added++;
          }
        }
      } catch (error) {
        console.log(`  ❌ Error processing product: ${error.message}`);
        failed++;
      }
    }

    console.log('\n📊 Import Summary:');
    console.log(`   ➕ Added: ${added}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️  Total: ${products.length}`);
    console.log('\n✅ Import complete!');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

importDataset();
