/**
 * Test Scraper
 * 
 * Quick testing utility to verify scrapers work for specific brands
 * without saving to database.
 * 
 * Usage:
 *   node scripts/test-scraper.js <brand-slug>
 *   node scripts/test-scraper.js free-people
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ShopifyScraper = require('./scrapers/shopify-scraper');
const { ZaraScraper, AritziaScraper, HMScraper, HTMLScraper } = require('./scrapers/custom-scrapers');

// Initialize Supabase client
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map brand slugs to custom scrapers
const CUSTOM_SCRAPERS = {
  'zara': ZaraScraper,
  'aritzia': AritziaScraper,
  'hm': HMScraper,
  'stradivarius': HTMLScraper,
  'cult-mia': HTMLScraper,
  'guizio': HTMLScraper,
  'altard-state': HTMLScraper
};

function getScraperForBrand(brand) {
  if (CUSTOM_SCRAPERS[brand.slug]) {
    const ScraperClass = CUSTOM_SCRAPERS[brand.slug];
    return new ScraperClass(brand, supabase);
  }
  
  if (brand.platform === 'shopify') {
    return new ShopifyScraper(brand, supabase);
  }
  
  return new HTMLScraper(brand, supabase);
}

async function testScraper(brandSlug) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing Scraper: ${brandSlug}`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    // Get brand from database
    const { data: brand, error } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', brandSlug)
      .single();
    
    if (error || !brand) {
      console.error(`❌ Brand not found: ${brandSlug}`);
      process.exit(1);
    }
    
    console.log(`✅ Found brand: ${brand.name}`);
    console.log(`   Website: ${brand.website_url}`);
    console.log(`   Platform: ${brand.platform}`);
    console.log(`   Config:`, JSON.stringify(brand.scraper_config, null, 2));
    console.log('');
    
    // Get scraper
    const scraper = getScraperForBrand(brand);
    console.log(`🔧 Using scraper: ${scraper.constructor.name}\n`);
    
    // Fetch products
    console.log('🌐 Fetching products...\n');
    const startTime = Date.now();
    
    const rawProducts = await scraper.fetchProducts();
    
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (!rawProducts || rawProducts.length === 0) {
      console.log('⚠️  No products found!\n');
      console.log('Possible issues:');
      console.log('  - Website structure changed');
      console.log('  - Rate limiting or blocking');
      console.log('  - Incorrect configuration');
      console.log('  - Network issues\n');
      process.exit(1);
    }
    
    console.log(`✅ Fetched ${rawProducts.length} products in ${fetchTime}s\n`);
    
    // Show sample products
    console.log('📦 Sample Products (first 5):\n');
    console.log('─'.repeat(60));
    
    rawProducts.slice(0, 5).forEach((product, index) => {
      const normalized = scraper.normalizeProduct(product);
      const validation = scraper.validateProduct(normalized);
      
      console.log(`\n${index + 1}. ${normalized.name}`);
      console.log(`   ID: ${normalized.external_id}`);
      console.log(`   Price: $${normalized.price.toFixed(2)}`);
      console.log(`   URL: ${normalized.product_url}`);
      console.log(`   Image: ${normalized.image_url ? '✅' : '❌'}`);
      console.log(`   Valid: ${validation.isValid ? '✅' : '❌ ' + validation.errors.join(', ')}`);
    });
    
    console.log('\n' + '─'.repeat(60));
    
    // Validation summary
    console.log('\n📊 Validation Summary:\n');
    
    let validCount = 0;
    let invalidCount = 0;
    const errorTypes = {};
    
    rawProducts.forEach(product => {
      const normalized = scraper.normalizeProduct(product);
      const validation = scraper.validateProduct(normalized);
      
      if (validation.isValid) {
        validCount++;
      } else {
        invalidCount++;
        validation.errors.forEach(error => {
          errorTypes[error] = (errorTypes[error] || 0) + 1;
        });
      }
    });
    
    console.log(`   Valid products: ${validCount}`);
    console.log(`   Invalid products: ${invalidCount}`);
    
    if (invalidCount > 0) {
      console.log('\n   Common errors:');
      Object.entries(errorTypes)
        .sort(([,a], [,b]) => b - a)
        .forEach(([error, count]) => {
          console.log(`     - ${error}: ${count} products`);
        });
    }
    
    // Category analysis
    console.log('\n🏷️  Category Analysis:\n');
    
    const categoryCounts = {};
    rawProducts.forEach(product => {
      const categories = scraper.extractCategories(product);
      categories.forEach(cat => {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
    });
    
    const topCategories = Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    if (topCategories.length > 0) {
      topCategories.forEach(([category, count]) => {
        console.log(`   ${category}: ${count} products`);
      });
    } else {
      console.log('   No categories found');
    }
    
    // Price range
    console.log('\n💰 Price Range:\n');
    
    const prices = rawProducts
      .map(p => scraper.normalizeProduct(p).price)
      .filter(p => p > 0)
      .sort((a, b) => a - b);
    
    if (prices.length > 0) {
      console.log(`   Lowest: $${prices[0].toFixed(2)}`);
      console.log(`   Highest: $${prices[prices.length - 1].toFixed(2)}`);
      console.log(`   Average: $${(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)}`);
      console.log(`   Median: $${prices[Math.floor(prices.length / 2)].toFixed(2)}`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nBrand: ${brand.name}`);
    console.log(`Products fetched: ${rawProducts.length}`);
    console.log(`Valid products: ${validCount} (${((validCount / rawProducts.length) * 100).toFixed(1)}%)`);
    console.log(`Fetch time: ${fetchTime}s`);
    console.log(`Average time per product: ${(fetchTime / rawProducts.length).toFixed(3)}s`);
    
    if (validCount / rawProducts.length > 0.9) {
      console.log('\n🎉 Scraper is working great!\n');
    } else if (validCount / rawProducts.length > 0.7) {
      console.log('\n⚠️  Scraper needs some tuning\n');
    } else {
      console.log('\n❌ Scraper needs significant fixes\n');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run test
const brandSlug = process.argv[2];

if (!brandSlug) {
  console.error('Usage: node scripts/test-scraper.js <brand-slug>');
  console.error('Example: node scripts/test-scraper.js free-people');
  process.exit(1);
}

testScraper(brandSlug);
