/**
 * Sync Products from Apify to Supabase
 * 
 * This script fetches product data from Apify datasets and syncs them to Supabase.
 * It handles:
 * - Shopify data format transformation
 * - Category mapping
 * - Variant storage
 * - Product deduplication via external_id
 * - Image URL management (CDN links for Shopify)
 * 
 * Usage: node scripts/sync-products-from-apify.js <brand-slug>
 * Example: node scripts/sync-products-from-apify.js rad-swim
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { classifyProduct } = require('./scrapers/taxonomy-classifier');

// Initialize Supabase client with service role key (for admin operations)
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Category mapping: maps source category names to our normalized categories
const CATEGORY_MAPPING = {
  'swimwear': 'swimwear',
  'swim': 'swimwear',
  'one-piece': 'one-piece',
  'bikini': 'bikinis',
  'bikinis': 'bikinis',
  'tankini': 'one-piece',
  'cover-up': 'cover-ups',
  'cover-ups': 'cover-ups',
  'rash guard': 'rash-guards',
  'rash-guard': 'rash-guards',
};

/**
 * Detect data format (Shopify vs Schema.org)
 */
function detectFormat(apifyProduct) {
  // Shopify format has: title, variants[], medias[], source
  if (apifyProduct.title && apifyProduct.variants) {
    return 'shopify';
  }
  // Schema.org format has: name, offers, image
  if (apifyProduct.name && apifyProduct.offers) {
    return 'schema.org';
  }
  return 'unknown';
}

/**
 * Transform Schema.org format (used by most e-commerce scrapers)
 */
function transformSchemaOrgProduct(apifyProduct, brandId) {
  // Use URL path or name hash as stable external_id fallback
  let externalId = apifyProduct.mpn || 
                   apifyProduct.additionalProperties?.sku || 
                   apifyProduct.sku || 
                   apifyProduct.productID;
  
  if (!externalId) {
    // Use URL path as stable ID (remove domain, query params)
    const url = apifyProduct.url || apifyProduct.productUrl || '';
    if (url) {
      const urlPath = url.split('?')[0].split('/').filter(Boolean).slice(-2).join('-');
      externalId = urlPath || `name-${apifyProduct.name?.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50)}`;
    } else {
      // Last resort: use name-based ID
      externalId = `name-${apifyProduct.name?.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50)}`;
    }
  }
  
  const productData = {
    brand_id: brandId,
    external_id: String(externalId),
    name: apifyProduct.name || 'Untitled Product',
    description: apifyProduct.description || '',
    price: parseFloat(apifyProduct.offers?.price || apifyProduct.price || 0),
    sale_price: apifyProduct.offers?.salePrice ? parseFloat(apifyProduct.offers.salePrice) : null,
    currency: apifyProduct.offers?.priceCurrency || 'USD',
    image_url: apifyProduct.image || apifyProduct.imageUrl || '',
    additional_images: apifyProduct.additionalProperties?.images?.map(img => img.url) || [],
    product_url: apifyProduct.url || apifyProduct.productUrl || '',
    variants: apifyProduct.additionalProperties?.variants || [],
    is_available: true, // Assume available if scraped
    last_checked_at: new Date().toISOString()
  };
  
  // Classify product using Shopify taxonomy
  const taxonomyData = classifyProduct({
    name: productData.name,
    description: productData.description,
    product_type: apifyProduct.category || apifyProduct.productType || ''
  });
  
  // Merge taxonomy data if classification succeeded
  if (taxonomyData) {
    Object.assign(productData, taxonomyData);
  }
  
  return productData;
}

/**
 * Transform Apify Shopify data to our product schema
 */
function transformShopifyProduct(apifyProduct, brandId) {
  const source = apifyProduct.source || {};
  const variants = apifyProduct.variants || [];
  const medias = apifyProduct.medias || [];
  
  // Get primary price from first variant
  const primaryVariant = variants[0];
  const currentPrice = primaryVariant?.price?.current || 0;
  const previousPrice = primaryVariant?.price?.previous || 0;
  
  // Convert price from cents to dollars
  const price = (currentPrice / 100).toFixed(2);
  const salePrice = previousPrice > 0 ? (previousPrice / 100).toFixed(2) : null;
  
  // Get images (use CDN URLs directly for Shopify)
  const imageUrl = medias[0]?.url || '';
  const additionalImages = medias.slice(1).map(m => m.url).filter(Boolean);
  
  // Clean HTML from description
  const description = apifyProduct.description
    ? apifyProduct.description.replace(/<[^>]*>/g, '').trim()
    : '';
  
  // Determine if product is in stock (check if any variant is in stock)
  const isAvailable = variants.some(v => v.price?.stockStatus === 'InStock');
  
  const baseProduct = {
    brand_id: brandId,
    external_id: source.id || apifyProduct.id,
    name: apifyProduct.title || 'Untitled Product',
    description: description,
    price: parseFloat(price),
    sale_price: salePrice ? parseFloat(salePrice) : null,
    currency: source.currency || 'USD',
    image_url: imageUrl,
    additional_images: additionalImages,
    product_url: source.canonicalUrl || '',
    variants: variants.map(v => ({
      id: v.id,
      title: v.title,
      sku: v.sku || '',
      options: v.options || [],
      price: {
        current: v.price?.current || 0,
        previous: v.price?.previous || 0,
        stockStatus: v.price?.stockStatus || 'OutOfStock'
      }
    })),
    is_available: isAvailable,
    last_checked_at: new Date().toISOString()
  };
  
  // Classify product using Shopify taxonomy
  const taxonomyData = classifyProduct({
    name: baseProduct.name,
    description: baseProduct.description,
    product_type: apifyProduct.productType || apifyProduct.type || ''
  });
  
  // Merge taxonomy data if classification succeeded
  if (taxonomyData) {
    Object.assign(baseProduct, taxonomyData);
  }
  
  return baseProduct;
}

/**
 * Transform product based on detected format
 */
function transformApifyProduct(apifyProduct, brandId) {
  const format = detectFormat(apifyProduct);
  
  if (format === 'shopify') {
    return transformShopifyProduct(apifyProduct, brandId);
  } else if (format === 'schema.org') {
    return transformSchemaOrgProduct(apifyProduct, brandId);
  } else {
    throw new Error(`Unknown product format: ${JSON.stringify(apifyProduct).substring(0, 200)}`);
  }
}

/**
 * Get category IDs from category tags/names
 */
async function getCategoryIds(categoryNames) {
  const categoryIds = [];
  
  for (const name of categoryNames) {
    const normalizedName = name.toLowerCase().trim();
    const mappedSlug = CATEGORY_MAPPING[normalizedName];
    
    if (mappedSlug) {
      const { data, error } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', mappedSlug)
        .single();
      
      if (data && !error) {
        categoryIds.push(data.id);
      }
    }
  }
  
  return categoryIds;
}

/**
 * Upsert product using fallback method for deduplication
 * Checks both external_id AND name to prevent duplicates
 * Note: Using fallback directly since RPC function has type compatibility issues with text[] columns
 */
async function upsertProduct(productData, categoryIds) {
  return await upsertProductFallback(productData, categoryIds);
}

/**
 * Fallback upsert for when database function isn't available yet
 * Checks both external_id AND name to prevent duplicates
 * Handles duplicate key errors by retrying as update
 */
async function upsertProductFallback(productData, categoryIds) {
  // First, try to find existing product by brand_id + external_id
  let existing = null;
  const { data: byExternalId } = await supabase
    .from('products')
    .select('id')
    .eq('brand_id', productData.brand_id)
    .eq('external_id', productData.external_id)
    .single();
  
  existing = byExternalId;
  
  // If not found by external_id, also check by name (prevents name-based duplicates)
  if (!existing) {
    const { data: byName } = await supabase
      .from('products')
      .select('id')
      .eq('brand_id', productData.brand_id)
      .eq('name', productData.name)
      .single();
    
    existing = byName;
  }
  
  let productId;
  let isNew = false;
  
  if (existing) {
    // Update existing product
    const { data, error } = await supabase
      .from('products')
      .update(productData)
      .eq('id', existing.id)
      .select('id')
      .single();
    
    if (error) {
      console.error(`Error updating product ${productData.name}:`, error.message);
      return { success: false, isNew: false };
    }
    
    productId = data.id;
  } else {
    // Insert new product
    const { data, error } = await supabase
      .from('products')
      .insert(productData)
      .select('id')
      .single();
    
    if (error) {
      // Check if it's a duplicate key error - retry as update
      if (error.code === '23505' || error.message.includes('duplicate key')) {
        // Find the existing product and update it
        const { data: duplicateProduct } = await supabase
          .from('products')
          .select('id')
          .eq('brand_id', productData.brand_id)
          .eq('name', productData.name)
          .single();
        
        if (duplicateProduct) {
          const { data: updateData, error: updateError } = await supabase
            .from('products')
            .update(productData)
            .eq('id', duplicateProduct.id)
            .select('id')
            .single();
          
          if (updateError) {
            console.error(`Error updating duplicate product ${productData.name}:`, updateError.message);
            return { success: false, isNew: false };
          }
          
          productId = updateData.id;
          // Mark as update, not new
        } else {
          console.error(`Error inserting product ${productData.name}:`, error.message);
          return { success: false, isNew: true };
        }
      } else {
        console.error(`Error inserting product ${productData.name}:`, error.message);
        return { success: false, isNew: true };
      }
    } else {
      productId = data.id;
      isNew = true;
    }
  }
  
  // Handle category associations
  if (productId && categoryIds.length > 0) {
    await supabase
      .from('product_categories')
      .delete()
      .eq('product_id', productId);
    
    const categoryAssociations = categoryIds.map(catId => ({
      product_id: productId,
      category_id: catId
    }));
    
    await supabase
      .from('product_categories')
      .insert(categoryAssociations);
  }
  
  return { success: true, isNew, productId };
}

/**
 * Main sync function
 */
async function syncBrandProducts(brandSlug) {
  console.log(`\n🚀 Starting product sync for brand: ${brandSlug}\n`);
  
  const startTime = Date.now();
  
  // 1. Get brand configuration from database
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', brandSlug)
    .single();
  
  if (brandError || !brand) {
    console.error(`❌ Brand not found: ${brandSlug}`);
    return;
  }
  
  if (!brand.is_active) {
    console.log(`⏸️  Brand is inactive, skipping sync`);
    return;
  }
  
  console.log(`✅ Found brand: ${brand.name}`);
  
  // 2. Get Apify configuration
  const config = brand.scraper_config || {};
  const apifyTaskId = config.apify_task_id;
  const apifyToken = process.env.APIFY_API_TOKEN;
  
  if (!apifyTaskId) {
    console.error(`❌ No Apify task ID configured for ${brand.name}`);
    console.log(`   Update the brand with: UPDATE brands SET scraper_config = '{"apify_task_id": "tropical_infinity~task-name"}' WHERE slug = '${brandSlug}';`);
    console.log(`   Example: UPDATE brands SET scraper_config = '{"apify_task_id": "tropical_infinity~e-commerce-scraping-tool-aritzia"}' WHERE slug = 'aritzia';`);
    return;
  }
  
  if (!apifyToken) {
    console.error(`❌ APIFY_API_TOKEN not found in .env file`);
    return;
  }
  
  // 3. Fetch latest task run to get dataset ID
  console.log(`📡 Fetching latest task run for: ${apifyTaskId}`);
  
  const taskRunUrl = `https://api.apify.com/v2/actor-tasks/${apifyTaskId}/runs/last?token=${apifyToken}`;
  let apifyDatasetId;
  
  try {
    const taskResponse = await fetch(taskRunUrl);
    if (!taskResponse.ok) {
      throw new Error(`Apify API error: ${taskResponse.status} ${taskResponse.statusText}`);
    }
    
    const taskData = await taskResponse.json();
    const runData = taskData.data;
    
    if (!runData) {
      throw new Error('No run data found for this task');
    }
    
    // Check run status
    if (runData.status === 'RUNNING') {
      console.error(`❌ Latest task run status: ${runData.status}`);
      console.log(`   The task is still running. Wait for it to complete and try again.`);
      return;
    }
    
    // Allow TIMED-OUT, FAILED, and ABORTED tasks (they may have partial data)
    if (runData.status !== 'SUCCEEDED') {
      console.warn(`⚠️  Task status: ${runData.status} (will attempt to import available data)`);
    }
    
    apifyDatasetId = runData.defaultDatasetId;
    
    if (!apifyDatasetId) {
      throw new Error('No dataset ID found in task run');
    }
    
    console.log(`✅ Found latest successful run (${apifyDatasetId})`);
    console.log(`   Started: ${new Date(runData.startedAt).toLocaleString()}`);
    console.log(`   Finished: ${new Date(runData.finishedAt).toLocaleString()}`);
    
  } catch (error) {
    console.error(`❌ Error fetching latest task run:`, error.message);
    return;
  }
  
  // 4. Create scrape log
  const { data: logData } = await supabase
    .from('product_scrape_logs')
    .insert({
      brand_id: brand.id,
      status: 'running',
      started_at: new Date().toISOString(),
      apify_dataset_id: apifyDatasetId
    })
    .select('id')
    .single();
  
  const logId = logData?.id;
  
  // 5. Fetch products from Apify
  console.log(`📥 Fetching products from Apify dataset: ${apifyDatasetId}`);
  
  const apifyUrl = `https://api.apify.com/v2/datasets/${apifyDatasetId}/items?token=${apifyToken}`;
  
  let apifyProducts = [];
  try {
    const response = await fetch(apifyUrl);
    if (!response.ok) {
      throw new Error(`Apify API error: ${response.status} ${response.statusText}`);
    }
    apifyProducts = await response.json();
    console.log(`✅ Fetched ${apifyProducts.length} products from Apify\n`);
  } catch (error) {
    console.error(`❌ Error fetching from Apify:`, error.message);
    
    // Update log with error
    if (logId) {
      await supabase
        .from('product_scrape_logs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
          execution_time_seconds: Math.floor((Date.now() - startTime) / 1000)
        })
        .eq('id', logId);
    }
    
    return;
  }
  
  // 6. Process each product
  let productsAdded = 0;
  let productsUpdated = 0;
  let productsFailed = 0;
  
  for (const apifyProduct of apifyProducts) {
    try {
      // Detect format and validate
      const format = detectFormat(apifyProduct);
      
      if (format === 'unknown') {
        console.log(`  ⚠️  Skipping product - unknown format`);
        productsFailed++;
        continue;
      }
      
      // Validate has name/title
      const productName = apifyProduct.name || apifyProduct.title;
      if (!productName || productName.trim() === '') {
        console.log(`  ⚠️  Skipping product with no name/title`);
        productsFailed++;
        continue;
      }
      
      // Transform product data
      const productData = transformApifyProduct(apifyProduct, brand.id);
      
      // Get category IDs from product tags/categories
      const sourceCats = [
        ...(apifyProduct.categories || []),
        ...(apifyProduct.tags || [])
      ];
      const categoryIds = await getCategoryIds(sourceCats);
      
      // Upsert product
      const result = await upsertProduct(productData, categoryIds);
      
      if (result.success) {
        if (result.isNew) {
          productsAdded++;
          console.log(`  ✅ Added: ${productData.name}`);
        } else {
          productsUpdated++;
          console.log(`  🔄 Updated: ${productData.name}`);
        }
      } else {
        productsFailed++;
      }
      
    } catch (error) {
      console.error(`  ❌ Error processing product:`, error.message);
      productsFailed++;
    }
  }
  
  // 7. Update brand's last_synced_at
  await supabase
    .from('brands')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', brand.id);
  
  // 8. Update scrape log
  const executionTime = Math.floor((Date.now() - startTime) / 1000);
  
  if (logId) {
    await supabase
      .from('product_scrape_logs')
      .update({
        status: productsFailed === 0 ? 'success' : 'partial',
        products_added: productsAdded,
        products_updated: productsUpdated,
        completed_at: new Date().toISOString(),
        execution_time_seconds: executionTime
      })
      .eq('id', logId);
  }
  
  // 9. Print summary
  console.log(`\n📊 Sync Summary for ${brand.name}`);
  console.log(`   ➕ Products added: ${productsAdded}`);
  console.log(`   🔄 Products updated: ${productsUpdated}`);
  console.log(`   ❌ Products failed: ${productsFailed}`);
  console.log(`   ⏱️  Execution time: ${executionTime}s\n`);
}

// Run the script
const brandSlug = process.argv[2];

if (!brandSlug) {
  console.error('Usage: node scripts/sync-products-from-apify.js <brand-slug>');
  console.error('Example: node scripts/sync-products-from-apify.js rad-swim');
  process.exit(1);
}

syncBrandProducts(brandSlug)
  .then(() => {
    console.log('✅ Sync complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
