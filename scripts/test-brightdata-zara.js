#!/usr/bin/env node
/**
 * Test BrightData Zara scraper to see data structure
 */

async function testBrightData() {
  const snapshotId = 's_mj3kbf58dm9lloe0i';
  const token = '53b53a9fa52d93fad6b0df5dd91713c75a7e4d5532b40beb5d67dc1d58435329';
  
  // Try to get the dataset directly
  const url = `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`;
  
  console.log('🔍 Fetching BrightData snapshot...\n');
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    
    console.log('✅ Successfully fetched data\n');
    console.log(`📦 Total products: ${data.length || 'Unknown'}\n`);
    
    if (data.length > 0) {
      const sample = data[0];
      console.log('📋 Sample product structure:\n');
      console.log(JSON.stringify(sample, null, 2));
      
      console.log('\n📊 Available fields:');
      Object.keys(sample).forEach(key => {
        const value = sample[key];
        const type = Array.isArray(value) ? 'array' : typeof value;
        console.log(`   - ${key}: ${type}`);
      });
      
      // Check required fields
      console.log('\n✅ Field availability:');
      const required = [
        { field: 'name/title', check: sample.name || sample.title },
        { field: 'price', check: sample.price || sample.final_price },
        { field: 'image/url', check: sample.image || sample.url || sample.images },
        { field: 'product_url/link', check: sample.product_url || sample.link || sample.url },
        { field: 'id/sku', check: sample.id || sample.sku || sample.product_id }
      ];
      
      required.forEach(({ field, check }) => {
        console.log(`   ${check ? '✓' : '✗'} ${field}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testBrightData();
