// Script to download product image and upload to Supabase Storage
// Run with: node scripts/add-product-from-url.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');
const { basename } = require('path');

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.log('\n❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  serviceRoleKey
);

// Product info
const product = {
  brand_slug: 'free-people',
  external_id: 'fp-nikita-romper',
  name: 'We The Free Nikita Romper',
  description: 'Effortless romper featured in a lightweight fabrication with an oversized fit and drapey design.',
  price: 128.00,
  product_url: 'https://www.freepeople.com/shop/we-the-free-nikita-romper/',
  // Source image URL - we'll download and re-upload this
  source_image_url: 'https://images.urbndata.com/is/image/FreePeople/94208824_001_a?$a15-pdp-detail-main$&fit=constrain',
};

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadImage(response.headers.location).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function addProduct() {
  try {
    console.log('\n🔍 Finding brand...');
    
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('slug', product.brand_slug)
      .single();

    if (brandError || !brand) {
      throw new Error(`Brand not found: ${product.brand_slug}`);
    }
    console.log(`✅ Found: ${brand.name}`);

    // Download image
    console.log('\n📥 Downloading image...');
    const imageBuffer = await downloadImage(product.source_image_url);
    console.log(`✅ Downloaded ${(imageBuffer.length / 1024).toFixed(1)}KB`);

    // Upload to Supabase Storage
    console.log('\n☁️  Uploading to Supabase Storage...');
    const fileName = `${product.external_id}.jpg`;
    const filePath = `products/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;
    console.log('✅ Image uploaded!');

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    console.log(`✅ Public URL: ${publicUrl}`);

    // Check if product exists
    const { data: existing } = await supabase
      .from('products')
      .select('id, name')
      .eq('external_id', product.external_id)
      .single();

    if (existing) {
      console.log(`\n⚠️  Updating existing product: ${existing.name}`);
      
      const { error: updateError } = await supabase
        .from('products')
        .update({
          name: product.name,
          description: product.description,
          price: product.price,
          image_url: publicUrl,
          product_url: product.product_url,
          is_available: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
      console.log('✅ Product updated!');
    } else {
      console.log('\n➕ Adding new product...');
      
      const { error: insertError } = await supabase
        .from('products')
        .insert({
          brand_id: brand.id,
          external_id: product.external_id,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: 'USD',
          image_url: publicUrl,
          product_url: product.product_url,
          is_available: true,
        });

      if (insertError) throw insertError;
      console.log('✅ Product added!');
    }

    console.log('\n🎉 Success!');
    console.log(`   Name: ${product.name}`);
    console.log(`   Price: $${product.price}`);
    console.log(`   Image stored in Supabase Storage`);
    console.log('\n🔄 Refresh your app to see the product!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

addProduct();
