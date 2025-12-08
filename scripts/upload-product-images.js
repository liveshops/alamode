// Script to upload product images to Supabase Storage
// Run with: node scripts/upload-product-images.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Configuration
const IMAGES_FOLDER = './product-images'; // Put your downloaded images here
const STORAGE_BUCKET = 'product-images';

async function uploadImages() {
  console.log('🔄 Uploading product images to Supabase Storage...\n');
  
  try {
    // Check if images folder exists
    if (!fs.existsSync(IMAGES_FOLDER)) {
      console.log(`📁 Creating ${IMAGES_FOLDER} folder...`);
      fs.mkdirSync(IMAGES_FOLDER, { recursive: true });
      console.log('\n⚠️  No images found. Please add images to the product-images/ folder');
      console.log('   Image names should match product external_ids (e.g., fp-001.jpg)');
      return;
    }
    
    // Get list of image files
    const files = fs.readdirSync(IMAGES_FOLDER)
      .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));
    
    if (files.length === 0) {
      console.log('⚠️  No image files found in product-images/');
      return;
    }
    
    console.log(`Found ${files.length} images to upload\n`);
    
    let uploadedCount = 0;
    const uploadedUrls = {};
    
    for (const filename of files) {
      const filePath = path.join(IMAGES_FOLDER, filename);
      const fileBuffer = fs.readFileSync(filePath);
      const fileExt = path.extname(filename);
      const baseName = path.basename(filename, fileExt);
      
      // Upload to Supabase Storage
      const storagePath = `${baseName}${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: `image/${fileExt.slice(1)}`,
          upsert: true // Replace if exists
        });
      
      if (error) {
        console.log(`❌ Failed to upload ${filename}:`, error.message);
      } else {
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath);
        
        uploadedUrls[baseName] = publicUrl;
        console.log(`✅ Uploaded: ${filename}`);
        console.log(`   URL: ${publicUrl}`);
        uploadedCount++;
      }
    }
    
    console.log(`\n🎉 Uploaded ${uploadedCount}/${files.length} images!`);
    
    // Update products with new image URLs
    if (uploadedCount > 0) {
      console.log('\n🔄 Updating product image URLs in database...');
      
      let updatedCount = 0;
      for (const [externalId, imageUrl] of Object.entries(uploadedUrls)) {
        const { error } = await supabase
          .from('products')
          .update({ image_url: imageUrl })
          .eq('external_id', externalId);
        
        if (error) {
          console.log(`⚠️  Could not update ${externalId}:`, error.message);
        } else {
          updatedCount++;
        }
      }
      
      console.log(`✅ Updated ${updatedCount} product records with new image URLs`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

uploadImages();
