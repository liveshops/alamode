#!/usr/bin/env node
/**
 * Compare the two Apify datasets to verify both have valid data
 */

require('dotenv').config();

async function compareDatasets() {
  const token = process.env.APIFY_API_TOKEN;
  
  const datasets = [
    { id: 'sRgzy9Itzn0sJAnOV', label: 'Two days ago (47 products)' },
    { id: 'WqNgDKPmwLY5mAD06', label: 'Today (23 products)' }
  ];

  for (const dataset of datasets) {
    console.log(`\n📦 ${dataset.label} - Dataset: ${dataset.id}\n`);
    
    const url = `https://api.apify.com/v2/datasets/${dataset.id}/items?token=${token}`;
    const response = await fetch(url);
    const products = await response.json();
    
    console.log(`   Total products: ${products.length}`);
    
    // Analyze data quality
    const withTitle = products.filter(p => p.title && p.title.trim() !== '').length;
    const withVariants = products.filter(p => p.variants && p.variants.length > 0).length;
    const withId = products.filter(p => p.source?.id || p.id).length;
    const withImages = products.filter(p => p.medias && p.medias.length > 0).length;
    
    console.log(`   Products with title: ${withTitle}/${products.length}`);
    console.log(`   Products with variants: ${withVariants}/${products.length}`);
    console.log(`   Products with ID: ${withId}/${products.length}`);
    console.log(`   Products with images: ${withImages}/${products.length}`);
    
    // Show sample product
    if (products.length > 0) {
      const sample = products[0];
      console.log(`\n   Sample product:`);
      console.log(`   - Title: ${sample.title || 'MISSING'}`);
      console.log(`   - ID: ${sample.source?.id || sample.id || 'MISSING'}`);
      console.log(`   - Variants: ${sample.variants?.length || 0}`);
      console.log(`   - Images: ${sample.medias?.length || 0}`);
      if (sample.variants && sample.variants.length > 0) {
        console.log(`   - First variant:`, JSON.stringify(sample.variants[0], null, 2));
      }
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

compareDatasets()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
