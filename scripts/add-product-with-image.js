// Script to add a single product with a real image URL
// Run with: node scripts/add-product-with-image.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Check for service role key
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.log('\n❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  serviceRoleKey
);

// Product to add
const product = {
  brand_slug: 'free-people',
  external_id: 'fp-nikita-romper',
  name: 'We The Free Nikita Romper',
  description: 'Effortless romper featured in a lightweight fabrication with an oversized fit and drapey design.',
  price: 128.00,
  // Image URL from Free People - with sizing parameters for better compatibility
  image_url: 'https://images.urbndata.com/is/image/FreePeople/94208824_001_a?$a15-pdp-detail-main$&fit=constrain',
  product_url: 'https://www.freepeople.com/shop/we-the-free-nikita-romper/',
};

async function addProduct() {
  try {
    console.log('\n🔍 Finding Free People brand...');
    
    // Get brand ID
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('slug', product.brand_slug)
      .single();

    if (brandError || !brand) {
      throw new Error(`Brand not found: ${product.brand_slug}`);
    }

    console.log(`✅ Found brand: ${brand.name}`);

    // Check if product already exists
    const { data: existing } = await supabase
      .from('products')
      .select('id, name')
      .eq('external_id', product.external_id)
      .single();

    if (existing) {
      console.log(`\n⚠️  Product already exists: ${existing.name}`);
      console.log('Updating...');

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
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
      console.log('✅ Product updated!');
    } else {
      console.log('\n➕ Adding new product...');

      const { data: newProduct, error: insertError } = await supabase
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
        })
        .select()
        .single();

      if (insertError) throw insertError;
      console.log('✅ Product added!');
    }

    console.log('\n✨ Success!');
    console.log(`   Name: ${product.name}`);
    console.log(`   Price: $${product.price}`);
    console.log(`   Image: ${product.image_url}`);
    console.log('\n🔄 Refresh your app to see the new product!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

addProduct();
