/**
 * Shopify Scraper - New Products Only
 * 
 * Fast version that ONLY adds new products, skips all updates.
 * Perfect for daily quick syncs to catch new arrivals.
 */

const BaseScraperNewOnly = require('./base-scraper-new-only');

class ShopifyScraperNewOnly extends BaseScraperNewOnly {
  constructor(brand, supabase) {
    super(brand, supabase);
  }

  /**
   * Fetch products from Shopify store using products.json endpoint
   */
  async fetchProducts() {
    this.log('Starting FAST Shopify product fetch (new products only)');
    
    const allProducts = [];
    const config = this.brand.scraper_config || {};
    const newArrivalsPath = config.new_arrivals_path || '/collections/new-arrivals';
    
    try {
      // Try multiple strategies to fetch products
      const products = await this.fetchFromProductsAPI() || 
                       await this.fetchFromCollectionAPI(newArrivalsPath) ||
                       await this.fetchFromSitemap();
      
      if (products && products.length > 0) {
        this.log(`Fetched ${products.length} products from Shopify API`, 'success');
        return products;
      }

      this.log('No products found via API endpoints', 'warning');
      return [];
    } catch (error) {
      this.log(`Error fetching products: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get the most recent product created_at for this brand from our database
   * This tells us when to start looking for new products
   */
  async getLastSyncDate() {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('created_at')
        .eq('brand_id', this.brand.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        // No products yet, fetch last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return thirtyDaysAgo.toISOString();
      }

      // Use the most recent product's created_at, minus 1 day buffer for safety
      const lastDate = new Date(data.created_at);
      lastDate.setDate(lastDate.getDate() - 1);
      return lastDate.toISOString();
    } catch (error) {
      this.log(`Error getting last sync date: ${error.message}`, 'warning');
      // Default to 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return sevenDaysAgo.toISOString();
    }
  }

  /**
   * Fetch from /products.json endpoint and filter client-side
   * NOTE: Shopify's public API does NOT support created_at_min filter,
   * so we must fetch products and filter them ourselves.
   */
  async fetchFromProductsAPI() {
    try {
      const newProducts = [];
      let page = 1;
      let hasMore = true;

      // Get the date of our most recent product for this brand
      const lastSyncDate = await this.getLastSyncDate();
      const lastSyncTime = new Date(lastSyncDate).getTime();
      this.log(`Looking for products created after: ${lastSyncDate}`, 'info');

      while (hasMore) {
        const url = `${this.brand.website_url}/products.json?limit=250&page=${page}`;
        this.log(`Fetching page ${page}...`);
        
        const response = await this.makeRequest(url);
        const data = await response.json();

        if (data.products && data.products.length > 0) {
          // Filter to only products created after our last sync
          const pageNewProducts = data.products.filter(p => {
            const productCreatedAt = new Date(p.created_at).getTime();
            return productCreatedAt > lastSyncTime;
          });

          if (pageNewProducts.length > 0) {
            this.log(`Page ${page}: Found ${pageNewProducts.length} NEW products (of ${data.products.length} total)`);
            const normalizedProducts = pageNewProducts.map(p => this.normalizeShopifyProduct(p));
            newProducts.push(...normalizedProducts);
          } else {
            this.log(`Page ${page}: No new products (all ${data.products.length} already synced)`);
          }
          
          // Continue to next page - check ALL pages since Shopify doesn't guarantee order
          page++;
          await this.delay();
          

        } else {
          hasMore = false;
        }
      }

      this.log(`Total NEW products found: ${newProducts.length}`, 'success');
      return newProducts;
    } catch (error) {
      this.log(`products.json fetch failed: ${error.message}`, 'warning');
      return null;
    }
  }

  /**
   * Fetch from collection products endpoint and filter client-side
   */
  async fetchFromCollectionAPI(collectionPath) {
    try {
      const handle = collectionPath.split('/').filter(Boolean).pop();
      const lastSyncDate = await this.getLastSyncDate();
      const lastSyncTime = new Date(lastSyncDate).getTime();
      const url = `${this.brand.website_url}/collections/${handle}/products.json?limit=250`;
      
      this.log(`Fetching from collection: ${handle}`);
      
      const response = await this.makeRequest(url);
      const data = await response.json();

      if (data.products && data.products.length > 0) {
        // Filter to only new products
        const newProducts = data.products.filter(p => {
          const productCreatedAt = new Date(p.created_at).getTime();
          return productCreatedAt > lastSyncTime;
        });
        
        this.log(`Found ${newProducts.length} NEW products in collection ${handle} (of ${data.products.length} total)`);
        return newProducts.map(p => this.normalizeShopifyProduct(p));
      }

      return null;
    } catch (error) {
      this.log(`Collection fetch failed: ${error.message}`, 'warning');
      return null;
    }
  }

  /**
   * Fetch from sitemap (fallback)
   */
  async fetchFromSitemap() {
    this.log('Sitemap fetching not implemented for new-only mode', 'warning');
    return null;
  }

  /**
   * Normalize Shopify product to our format
   */
  normalizeShopifyProduct(shopifyProduct) {
    const firstVariant = shopifyProduct.variants?.[0] || {};
    
    return {
      id: String(shopifyProduct.id),
      name: shopifyProduct.title || '',
      title: shopifyProduct.title || '',
      description: this.cleanText(shopifyProduct.body_html || ''),
      price: firstVariant.price || '0',
      salePrice: firstVariant.compare_at_price || null,
      currency: 'USD',
      image: shopifyProduct.image?.src || shopifyProduct.images?.[0]?.src || '',
      imageUrl: shopifyProduct.image?.src || shopifyProduct.images?.[0]?.src || '',
      images: (shopifyProduct.images || []).map(img => img.src),
      additionalImages: (shopifyProduct.images || []).slice(1).map(img => img.src),
      url: `${this.brand.website_url}/products/${shopifyProduct.handle}`,
      link: `${this.brand.website_url}/products/${shopifyProduct.handle}`,
      sku: firstVariant.sku || '',
      productType: shopifyProduct.product_type || '',
      type: shopifyProduct.product_type || '',
      tags: shopifyProduct.tags || [],
      variants: shopifyProduct.variants || [],
      available: shopifyProduct.variants?.some(v => v.available) ?? true,
      inStock: shopifyProduct.variants?.some(v => v.available) ?? true,
      createdAt: shopifyProduct.created_at,
      updatedAt: shopifyProduct.updated_at
    };
  }
}

module.exports = ShopifyScraperNewOnly;
