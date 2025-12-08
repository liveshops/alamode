// Add products with images that actually load
// Using Unsplash (free, public images)
// Run with: node scripts/add-products-with-working-images.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.log('\n❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  serviceRoleKey
);

// Products with working Unsplash images (fashion photos)
const products = [
  {
    brand_slug: 'free-people',
    external_id: 'fp-nikita-romper',
    name: 'We The Free Nikita Romper',
    description: 'Effortless romper featured in a lightweight fabrication with an oversized fit and drapey design.',
    price: 128.00,
    image_url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=800&fit=crop&q=80',
    product_url: 'https://www.freepeople.com/shop/we-the-free-nikita-romper/',
  },
  {
    brand_slug: 'revolve',
    external_id: 'rev-satin-dress',
    name: 'Satin Slip Mini Dress',
    description: 'Luxe satin slip dress with adjustable straps and cowl neckline.',
    price: 178.00,
    image_url: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&h=800&fit=crop&q=80',
    product_url: 'https://www.revolve.com/satin-slip-dress',
  },
  {
    brand_slug: 'motel',
    external_id: 'motel-halter-dress',
    name: 'Halter Neck Mini Dress',
    description: 'Y2K inspired mini dress with halter neckline and figure-hugging fit.',
    price: 68.00,
    sale_price: 54.00,
    image_url: 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=600&h=800&fit=crop&q=80',
    product_url: 'https://www.motelrocks.com/products/halter-dress',
  },
  {
    brand_slug: 'free-people',
    external_id: 'fp-peasant-top',
    name: 'Embroidered Peasant Blouse',
    description: 'Romantic blouse with intricate embroidery and billowy sleeves.',
    price: 118.00,
    sale_price: 79.00,
    image_url: 'https://images.unsplash.com/photo-1564859228273-274232fdb516?w=600&h=800&fit=crop&q=80',
    product_url: 'https://www.freepeople.com/shop/embroidered-peasant-blouse',
  },
];

async function addProducts() {
  try {
    console.log('\n🚀 Adding products with real images...\n');

    for (const product of products) {
      console.log(`\n📦 Processing: ${product.name}`);
      
      // Get brand
      const { data: brand, error: brandError } = await supabase
        .from('brands')
        .select('id, name')
        .eq('slug', product.brand_slug)
        .single();

      if (brandError || !brand) {
        console.log(`   ❌ Brand not found: ${product.brand_slug}`);
        continue;
      }

      // Check if exists
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('external_id', product.external_id)
        .single();

      if (existing) {
        // Update
        const { error: updateError } = await supabase
          .from('products')
          .update({
            name: product.name,
            description: product.description,
            price: product.price,
            sale_price: product.sale_price || null,
            image_url: product.image_url,
            product_url: product.product_url,
            is_available: true,
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        console.log(`   ✅ Updated - ${brand.name}`);
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from('products')
          .insert({
            brand_id: brand.id,
            external_id: product.external_id,
            name: product.name,
            description: product.description,
            price: product.price,
            sale_price: product.sale_price || null,
            currency: 'USD',
            image_url: product.image_url,
            product_url: product.product_url,
            is_available: true,
          });

        if (insertError) throw insertError;
        console.log(`   ✅ Added - ${brand.name} - $${product.price}`);
      }
    }

    console.log('\n\n🎉 All products added!');
    console.log(`📱 Refresh your app to see ${products.length} products with real images!`);
    console.log('\n💡 These are Unsplash fashion photos - they\'ll load instantly!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

addProducts();
