#!/usr/bin/env node
/**
 * Check if brands are using Shopify
 * 
 * Checks for Shopify indicators in the HTML/headers
 */

const brands = [
  { name: 'Hollister', url: 'https://www.hollisterco.com' },
  { name: "Levi's", url: 'https://www.levi.com' },
  { name: 'Abercrombie & Fitch', url: 'https://www.abercrombie.com' },
  { name: 'Aeropostale', url: 'https://www.aeropostale.com' },
  { name: 'PacSun', url: 'https://www.pacsun.com' },
  { name: 'American Eagle', url: 'https://www.ae.com' },
  { name: 'Peppermayo', url: 'https://www.peppermayo.com' },
  { name: 'Lioness', url: 'https://www.lionessfashion.com' },
  { name: 'Asos', url: 'https://www.asos.com' },
  { name: 'Princess Polly', url: 'https://us.princesspolly.com' },
  { name: 'Carmen Says', url: 'https://www.carmensays.com' },
  { name: 'My Mum Made It', url: 'https://www.mymummadeit.com' },
  { name: 'Mode Mischief Studios', url: 'https://www.modemischiefstudios.com' },
  { name: 'Mango', url: 'https://www.mango.com' },
  { name: 'Motel Rocks', url: 'https://www.motelrocks.com' },
  { name: 'Revice', url: 'https://www.revicedenim.com' },
  { name: 'Yellow the Label', url: 'https://yellowthelabel.com' },
  { name: 'Parke', url: 'https://www.parkecollective.com' },
  { name: 'Daily Drills', url: 'https://www.dailydrills.com' },
  { name: 'Nícoli', url: 'https://www.nicoliapparel.com' },
  { name: 'I am Delilah', url: 'https://iamdelilah.com' },
  { name: 'Tiger Mist', url: 'https://us.tigermist.com' },
  { name: 'Oak + Fort', url: 'https://www.oakandfort.com' },
  { name: 'Peachy Den', url: 'https://www.peachyden.com' },
  { name: 'Reformation', url: 'https://www.thereformation.com' },
  { name: 'Bronze Snake', url: 'https://www.bronzesnake.com' },
  { name: 'Pistola', url: 'https://www.pistoladenim.com' },
  { name: 'Susmies', url: 'https://susmies.com' },
  { name: 'Jaded London', url: 'https://www.jadedlondon.com' }
];

async function checkShopify(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      redirect: 'follow'
    });
    
    const html = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    
    // Check for Shopify indicators
    const isShopify = 
      html.includes('Shopify') ||
      html.includes('cdn.shopify.com') ||
      html.includes('myshopify.com') ||
      headers['x-shopify-stage'] !== undefined ||
      headers['x-shopify-request-id'] !== undefined;
    
    return isShopify;
  } catch (error) {
    return null; // Unknown
  }
}

async function checkAllBrands() {
  console.log('🔍 Checking brands for Shopify...\n');
  
  const shopifyBrands = [];
  const nonShopifyBrands = [];
  const unknownBrands = [];
  
  for (const brand of brands) {
    process.stdout.write(`Checking ${brand.name}... `);
    const isShopify = await checkShopify(brand.url);
    
    if (isShopify === true) {
      console.log('✅ SHOPIFY');
      shopifyBrands.push(brand);
    } else if (isShopify === false) {
      console.log('❌ NOT SHOPIFY');
      nonShopifyBrands.push(brand);
    } else {
      console.log('❓ UNKNOWN');
      unknownBrands.push(brand);
    }
    
    // Small delay to be polite
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 RESULTS:\n');
  
  console.log(`✅ SHOPIFY BRANDS (${shopifyBrands.length}):`);
  shopifyBrands.forEach(b => console.log(`   - ${b.name} (${b.url})`));
  
  console.log(`\n❌ NON-SHOPIFY BRANDS (${nonShopifyBrands.length}):`);
  nonShopifyBrands.forEach(b => console.log(`   - ${b.name} (${b.url})`));
  
  if (unknownBrands.length > 0) {
    console.log(`\n❓ UNKNOWN (${unknownBrands.length}):`);
    unknownBrands.forEach(b => console.log(`   - ${b.name} (${b.url})`));
  }
  
  console.log('\n💡 Next Steps:');
  console.log(`   - ${shopifyBrands.length} Shopify brands can use the Shopify scraper`);
  console.log(`   - ${nonShopifyBrands.length} non-Shopify brands need custom scrapers or Apify`);
}

checkAllBrands();
