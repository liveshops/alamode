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
   * Fetch from /products.json endpoint (most reliable)
   */
  async fetchFromProductsAPI() {
    try {
      const products = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const url = `${this.brand.website_url}/products.json?limit=250&page=${page}`;
        this.log(`Fetching page ${page} from products.json`);
        
        const response = await this.makeRequest(url);
        const data = await response.json();

        if (data.products && data.products.length > 0) {
          const normalizedProducts = data.products.map(p => this.normalizeShopifyProduct(p));
          products.push(...normalizedProducts);
          
          page++;
          await this.delay();
        } else {
          hasMore = false;
        }
      }

      return products;
    } catch (error) {
      this.log(`products.json fetch failed: ${error.message}`, 'warning');
      return null;
    }
  }

  /**
   * Fetch from collection products endpoint
   */
  async fetchFromCollectionAPI(collectionPath) {
    try {
      const handle = collectionPath.split('/').filter(Boolean).pop();
      const url = `${this.brand.website_url}/collections/${handle}/products.json?limit=250`;
      
      this.log(`Fetching from collection: ${handle}`);
      
      const response = await this.makeRequest(url);
      const data = await response.json();

      if (data.products && data.products.length > 0) {
        return data.products.map(p => this.normalizeShopifyProduct(p));
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
