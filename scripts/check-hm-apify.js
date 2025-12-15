#!/usr/bin/env node
/**
 * Check H&M Apify task status and dataset
 */

require('dotenv').config();

async function checkHM() {
  const token = process.env.APIFY_API_TOKEN;
  
  // Replace with your actual H&M task ID
  const taskId = 'tropical_infinity~e-commerce-scraping-tool-hm'; // Update this!
  
  console.log('🔍 Checking H&M Apify task...\n');
  
  try {
    const url = `https://api.apify.com/v2/actor-tasks/${taskId}/runs/last?token=${token}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    const run = data.data;
    
    console.log('📊 Latest run details:');
    console.log(`   Status: ${run.status}`);
    console.log(`   Started: ${new Date(run.startedAt).toLocaleString()}`);
    console.log(`   Finished: ${run.finishedAt ? new Date(run.finishedAt).toLocaleString() : 'Still running'}`);
    console.log(`   Dataset ID: ${run.defaultDatasetId}`);
    console.log(`   Stats: ${JSON.stringify(run.stats || {})}`);
    
    // Check dataset
    if (run.defaultDatasetId) {
      console.log('\n📦 Checking dataset...');
      const datasetUrl = `https://api.apify.com/v2/datasets/${run.defaultDatasetId}?token=${token}`;
      const datasetResponse = await fetch(datasetUrl);
      const datasetInfo = await datasetResponse.json();
      
      console.log(`   Items scraped: ${datasetInfo.data.itemCount}`);
      console.log(`   Dataset size: ${(datasetInfo.data.cleanItemCount || 0)} clean items`);
      
      if (datasetInfo.data.itemCount > 0) {
        console.log('\n✅ Dataset has products! You can import them even if task timed out.');
        console.log(`\nRun: node scripts/sync-products-from-apify.js hm`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkHM();
