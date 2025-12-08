// Script to apply bucket images to the three test products
// Run with: node scripts/apply-bucket-images.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORAGE_BUCKET = 'product-images';
const BASE_URL = `https://oeztavlkbkxhcpjkdxry.supabase.co/storage/v1/object/public/${STORAGE_BUCKET}`;

// Mapping of products to their images
const productImageMap = [
  {
    external_id: 'fp-001',
    name: 'Sunset Dreams Maxi Dress',
    image_url: `${BASE_URL}/sunset-dreams-maki-dress.png`, // Note: typo in filename
    additional_images: [`${BASE_URL}/sunset-dreams-maxi-dress-2.png`]
  },
  {
    external_id: 'rev-001',
    name: 'Satin Slip Dress',
    image_url: `${BASE_URL}/satin-slip-dress.png`,
    additional_images: [`${BASE_URL}/satin-slip-dress-2.png`]
  },
  {
    external_id: 'motel-001',
    name: 'Maya Backless Jumpsuit',
    image_url: `${BASE_URL}/maya-backless-jumpsuit.png`,
    additional_images: [`${BASE_URL}/maya-backless-jumpsuit-2.png`]
  }
];

async function applyImages() {
  console.log('🔄 Updating products with bucket images...\n');
  
  try {
    for (const product of productImageMap) {
      console.log(`📦 Updating: ${product.name}`);
      
      const { error } = await supabase
        .from('products')
        .update({
          image_url: product.image_url,
          additional_images: product.additional_images
        })
        .eq('external_id', product.external_id);
      
      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
      } else {
        console.log(`   ✅ Updated!`);
        console.log(`   Primary: ${product.image_url}`);
        console.log(`   Additional: ${product.additional_images.join(', ')}`);
      }
    }
    
    console.log('\n🎉 Done! Refresh your app to see the new images.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyImages();
