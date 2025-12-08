// Script to add real test products to Supabase (using service role)
// Run with: node scripts/add-test-products-admin.js
// 
// NOTE: This requires your Supabase SERVICE ROLE key
// Get it from: Supabase Dashboard → Settings → API → service_role key
// 
// Usage:
// 1. Create .env.local with: SUPABASE_SERVICE_ROLE_KEY=your-key-here
// 2. Run: node scripts/add-test-products-admin.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Check for service role key
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.log('\n❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.log('\n📝 To fix this:');
  console.log('1. Go to Supabase Dashboard → Settings → API');
  console.log('2. Copy the "service_role" key (NOT the anon key)');
  console.log('3. Add to your .env file:');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here');
  console.log('\n⚠️  WARNING: Keep this key secret! Never commit it to git.');
  process.exit(1);
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  serviceRoleKey
);

const testProducts = [
  {
    brand_slug: 'free-people',
    external_id: 'fp-001',
    name: 'Sunset Dreams Maxi Dress',
    description: 'Flowy maxi dress perfect for summer evenings',
    price: 128.00,
    sale_price: 89.00,
    image_url: 'https://via.placeholder.com/600x800/E8C5B5/000000?text=Free+People+Dress',
    product_url: 'https://www.freepeople.com/shop/sunset-dreams-maxi',
  },
  {
    brand_slug: 'revolve',
    external_id: 'rev-001',
    name: 'Satin Slip Dress',
    description: 'Elegant satin mini dress in chocolate brown',
    price: 178.00,
    image_url: 'https://via.placeholder.com/600x800/8B4513/FFFFFF?text=REVOLVE+Dress',
    product_url: 'https://www.revolve.com/satin-slip-dress',
  },
  {
    brand_slug: 'motel',
    external_id: 'motel-001',
    name: 'Maya Backless Jumpsuit',
    description: 'Cowl style jumpsuit with straight leg and low back detail',
    price: 68.00,
    image_url: 'https://via.placeholder.com/600x800/2C2C2C/FFFFFF?text=Motel+Jumpsuit',
    product_url: 'https://us.motelrocks.com/products/maya-jumpsuit',
  },
  {
    brand_slug: 'zara',
    external_id: 'zara-001',
    name: 'Ribbed Knit Top',
    description: 'Fitted ribbed knit top with high neck',
    price: 35.90,
    image_url: 'https://via.placeholder.com/600x800/F5F5DC/000000?text=ZARA+Top',
    product_url: 'https://www.zara.com/us/en/ribbed-knit-top',
  },
  {
    brand_slug: 'urban-outfitters',
    external_id: 'uo-001',
    name: 'Vintage Wash Denim Jacket',
    description: 'Classic denim jacket with vintage wash',
    price: 89.00,
    image_url: 'https://via.placeholder.com/600x800/4682B4/FFFFFF?text=UO+Jacket',
    product_url: 'https://www.urbanoutfitters.com/shop/bdg-denim-jacket',
  },
  {
    brand_slug: 'anthropologie',
    external_id: 'anthro-001',
    name: 'Embroidered Peasant Blouse',
    description: 'Romantic peasant blouse with intricate embroidery',
    price: 118.00,
    sale_price: 79.00,
    image_url: 'https://via.placeholder.com/600x800/DEB887/000000?text=Anthro+Blouse',
    product_url: 'https://www.anthropologie.com/shop/embroidered-blouse',
  },
];

async function addProducts() {
  console.log('🔄 Adding test products...\n');
  
  try {
    // First, delete existing sample products
    console.log('Cleaning up old sample products...');
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .like('external_id', 'sample-%');
    
    if (deleteError && deleteError.code !== 'PGRST116') {
      console.log('Note:', deleteError.message);
    } else {
      console.log('✅ Cleaned up old samples');
    }
    
    // Get brand IDs
    const { data: brands } = await supabase
      .from('brands')
      .select('id, slug');
    
    const brandMap = {};
    brands.forEach(brand => {
      brandMap[brand.slug] = brand.id;
    });
    
    console.log('\nAdding new products...');
    
    // Insert new products
    let successCount = 0;
    for (const product of testProducts) {
      const brandId = brandMap[product.brand_slug];
      if (!brandId) {
        console.log(`⚠️  Brand not found: ${product.brand_slug}`);
        continue;
      }
      
      const { error } = await supabase
        .from('products')
        .upsert({
          brand_id: brandId,
          external_id: product.external_id,
          name: product.name,
          description: product.description,
          price: product.price,
          sale_price: product.sale_price || null,
          image_url: product.image_url,
          product_url: product.product_url,
          is_available: true,
        }, {
          onConflict: 'brand_id,external_id'
        });
      
      if (error) {
        console.log(`❌ Failed to add ${product.name}:`, error.message);
      } else {
        console.log(`✅ Added: ${product.name}`);
        successCount++;
      }
    }
    
    console.log(`\n🎉 Successfully added ${successCount}/${testProducts.length} products!`);
    
    if (successCount > 0) {
      console.log('\n📝 Next steps:');
      console.log('1. Download real product images from brand websites');
      console.log('2. Save them to product-images/ folder');
      console.log('3. Run: node scripts/upload-product-images.js');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addProducts();
