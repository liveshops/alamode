// Script to update products with images from Supabase Storage bucket
// Run with: node scripts/update-products-from-bucket.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORAGE_BUCKET = 'product-images';

async function updateProductsFromBucket() {
  console.log('🔍 Checking Supabase Storage bucket for images...\n');
  
  try {
    // List all files in the bucket
    const { data: files, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list('', {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });
    
    if (listError) {
      throw new Error(`Failed to list bucket: ${listError.message}`);
    }
    
    if (!files || files.length === 0) {
      console.log('⚠️  No files found in bucket');
      return;
    }
    
    console.log(`Found ${files.length} files in bucket:\n`);
    files.forEach(f => console.log(`  - ${f.name}`));
    
    // Get products that need images (no image_url or placeholder)
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, name, external_id, image_url, additional_images')
      .or('image_url.is.null,image_url.eq.');
    
    if (prodError) throw prodError;
    
    console.log(`\n📦 Products needing images: ${products?.length || 0}`);
    
    // Also get all products to show current state
    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name, external_id, image_url, additional_images');
    
    console.log('\n📋 All products in database:');
    allProducts?.forEach(p => {
      console.log(`  - ${p.name}`);
      console.log(`    external_id: ${p.external_id}`);
      console.log(`    image_url: ${p.image_url || '(none)'}`);
      console.log(`    additional_images: ${p.additional_images ? JSON.stringify(p.additional_images) : '(none)'}`);
    });
    
    // Group files by product (assuming naming like: product-name-1.jpg, product-name-2.jpg)
    // Or by external_id pattern
    console.log('\n\n🔗 Attempting to match files to products...');
    
    // Create a map of file names to URLs
    const fileUrls = {};
    for (const file of files) {
      if (file.name && !file.name.startsWith('.')) {
        const { data: { publicUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(file.name);
        fileUrls[file.name] = publicUrl;
        console.log(`  ${file.name} -> ${publicUrl}`);
      }
    }
    
    console.log('\n\n📝 File URLs ready. Please check the file names above.');
    console.log('   To update products, we need to know how the files are named.');
    console.log('   Common patterns:');
    console.log('   - By external_id: fp-001-1.jpg, fp-001-2.jpg');
    console.log('   - By product name: nikita-romper-1.jpg');
    console.log('   - By number: product1-a.jpg, product1-b.jpg');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

updateProductsFromBucket();
