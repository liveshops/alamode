#!/usr/bin/env node
/**
 * Inspect raw Apify data to see what we're getting
 */

require('dotenv').config();

async function inspectApifyData() {
  const taskId = 'tropical_infinity~e-commerce-scraping-tool-aritzia';
  const token = process.env.APIFY_API_TOKEN;

  // Get latest run
  console.log('📡 Fetching latest Apify run...\n');
  const taskRunUrl = `https://api.apify.com/v2/actor-tasks/${taskId}/runs/last?token=${token}`;
  
  const taskResponse = await fetch(taskRunUrl);
  const taskData = await taskResponse.json();
  const datasetId = taskData.data.defaultDatasetId;

  console.log(`✅ Dataset ID: ${datasetId}\n`);

  // Fetch products
  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`;
  const response = await fetch(datasetUrl);
  const products = await response.json();

  console.log(`📦 Total products in dataset: ${products.length}\n`);

  // Show first 3 products
  console.log('🔍 First 3 products from Apify:\n');
  products.slice(0, 3).forEach((product, idx) => {
    console.log(`${idx + 1}. Product structure:`);
    console.log(`   title: ${product.title || 'MISSING'}`);
    console.log(`   id: ${product.id || 'MISSING'}`);
    console.log(`   source.id: ${product.source?.id || 'MISSING'}`);
    console.log(`   variants: ${Array.isArray(product.variants) ? `Array(${product.variants.length})` : 'NOT AN ARRAY'}`);
    
    if (product.variants && product.variants.length > 0) {
      console.log(`   First variant:`, JSON.stringify(product.variants[0], null, 2));
    } else {
      console.log(`   ⚠️  No variants!`);
    }
    
    console.log(`   description: ${product.description ? 'EXISTS' : 'MISSING'}`);
    console.log(`   medias: ${Array.isArray(product.medias) ? `Array(${product.medias.length})` : 'NOT AN ARRAY'}`);
    console.log('');
  });

  // Check how many have empty variants
  const noVariants = products.filter(p => !p.variants || p.variants.length === 0).length;
  const noTitle = products.filter(p => !p.title).length;
  
  console.log('📊 Data quality:');
  console.log(`   Products without variants: ${noVariants}/${products.length}`);
  console.log(`   Products without title: ${noTitle}/${products.length}`);
}

inspectApifyData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
