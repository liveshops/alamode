#!/usr/bin/env node

const brands = [
  { name: 'Aeropostale', url: 'https://www.aeropostale.com' },
  { name: 'American Eagle', url: 'https://www.ae.com' },
  { name: 'Design By Si', url: 'https://www.designbysi.com' },
  { name: 'Guizio', url: 'https://www.guizio.com' },
  { name: 'H&M', url: 'https://www2.hm.com' },
  { name: 'Hollister', url: 'https://www.hollisterco.com' },
  { name: 'Levi\'s', url: 'https://www.levi.com' },
  { name: 'Mango', url: 'https://www.mango.com' },
  { name: 'PacSun', url: 'https://www.pacsun.com' },
  { name: 'Sisters & Seekers', url: 'https://www.sistersandseekers.com' },
  { name: 'Sndys the label', url: 'https://www.sndys.com' },
  { name: 'Steele', url: 'https://www.steelethelabel.com' },
  { name: 'Stradivarious', url: 'https://www.stradivarius.com' },
  { name: 'Zara', url: 'https://www.zara.com' }
];

async function checkShopify(brand) {
  try {
    // Try products.json endpoint (Shopify-specific)
    const response = await fetch(`${brand.url}/products.json?limit=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.products) {
        return { ...brand, isShopify: true, method: 'products.json' };
      }
    }

    // Check headers
    const headResponse = await fetch(brand.url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    const poweredBy = headResponse.headers.get('x-shopify-stage') || 
                      headResponse.headers.get('powered-by') ||
                      headResponse.headers.get('server');
    
    if (poweredBy && poweredBy.toLowerCase().includes('shopify')) {
      return { ...brand, isShopify: true, method: 'headers' };
    }

    return { ...brand, isShopify: false, method: 'none' };
    
  } catch (error) {
    return { ...brand, isShopify: false, method: 'error', error: error.message };
  }
}

async function checkAll() {
  console.log('🔍 Checking brands for Shopify...\n');
  
  const results = await Promise.all(brands.map(checkShopify));
  
  const shopifyBrands = results.filter(r => r.isShopify);
  const nonShopifyBrands = results.filter(r => !r.isShopify);
  
  console.log('✅ SHOPIFY BRANDS:\n');
  shopifyBrands.forEach(b => {
    console.log(`   ✓ ${b.name}`);
    console.log(`     ${b.url}`);
    console.log(`     Detected via: ${b.method}\n`);
  });
  
  console.log('\n❌ NON-SHOPIFY BRANDS:\n');
  nonShopifyBrands.forEach(b => {
    console.log(`   ✗ ${b.name}`);
    console.log(`     ${b.url}`);
    if (b.error) console.log(`     Error: ${b.error}`);
    console.log('');
  });
  
  console.log(`\n📊 Summary: ${shopifyBrands.length} Shopify / ${nonShopifyBrands.length} Non-Shopify`);
}

checkAll().catch(console.error);
