/**
 * Shopify Scraper
 * 
 * Generic scraper for Shopify-based stores.
 * Works with most Shopify stores by leveraging their products.json API.
 */

const BaseScraper = require('./base-scraper');

class ShopifyScraper extends BaseScraper {
  constructor(brand, supabase) {
    super(brand, supabase);
  }

  /**
   * Fetch products from Shopify store using products.json endpoint
   */
  async fetchProducts() {
    this.log('Starting Shopify product fetch');
    
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

      while (hasMore && page <= 10) { // Limit to 10 pages
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
      // Extract collection handle from path
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
   * Fetch from sitemap as fallback
   */
  async fetchFromSitemap() {
    try {
      const url = `${this.brand.website_url}/sitemap_products_1.xml`;
      this.log('Attempting sitemap fetch as fallback');
      
      const response = await this.makeRequest(url);
      const text = await response.text();
      
      // Parse product URLs from sitemap
      const productUrls = this.extractProductUrlsFromSitemap(text);
      
      if (productUrls.length === 0) return null;

      // Fetch up to 50 products from their individual pages
      const products = [];
      for (const productUrl of productUrls.slice(0, 50)) {
        try {
          const product = await this.fetchProductPage(productUrl);
          if (product) products.push(product);
          await this.delay(500); // Extra delay for individual requests
        } catch (err) {
          this.log(`Failed to fetch ${productUrl}: ${err.message}`, 'warning');
        }
      }

      return products;
    } catch (error) {
      this.log(`Sitemap fetch failed: ${error.message}`, 'warning');
      return null;
    }
  }

  /**
   * Extract product URLs from XML sitemap
   */
  extractProductUrlsFromSitemap(xmlText) {
    const urls = [];
    const urlRegex = /<loc>(.*?)<\/loc>/g;
    let match;

    while ((match = urlRegex.exec(xmlText)) !== null) {
      const url = match[1];
      if (url.includes('/products/')) {
        urls.push(url);
      }
    }

    return urls;
  }

  /**
   * Fetch individual product page and extract JSON data
   */
  async fetchProductPage(productUrl) {
    try {
      // Shopify stores have product JSON at /products/handle.json
      const jsonUrl = productUrl.replace(/\.html?$/, '') + '.json';
      
      const response = await this.makeRequest(jsonUrl);
      const data = await response.json();

      if (data.product) {
        return this.normalizeShopifyProduct(data.product);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalize Shopify product data to our schema
   */
  normalizeShopifyProduct(shopifyProduct) {
    const variants = shopifyProduct.variants || [];
    const images = shopifyProduct.images || [];
    
    // Get pricing from first available variant
    const primaryVariant = variants[0] || {};
    const price = parseFloat(primaryVariant.price || 0);
    const compareAtPrice = parseFloat(primaryVariant.compare_at_price || 0);
    
    return {
      id: shopifyProduct.id,
      sku: primaryVariant.sku || shopifyProduct.id,
      title: shopifyProduct.title,
      name: shopifyProduct.title,
      description: this.cleanText(shopifyProduct.body_html || ''),
      price: price,
      salePrice: compareAtPrice > price ? compareAtPrice : null,
      currency: 'USD',
      image: images[0]?.src || '',
      imageUrl: images[0]?.src || '',
      images: images.slice(1).map(img => img.src),
      additionalImages: images.slice(1).map(img => img.src),
      url: `${this.brand.website_url}/products/${shopifyProduct.handle}`,
      link: `${this.brand.website_url}/products/${shopifyProduct.handle}`,
      variants: variants.map(v => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        price: parseFloat(v.price || 0),
        compare_at_price: parseFloat(v.compare_at_price || 0),
        available: v.available,
        inventory_quantity: v.inventory_quantity,
        option1: v.option1,
        option2: v.option2,
        option3: v.option3
      })),
      available: variants.some(v => v.available),
      inStock: variants.some(v => v.available),
      category: shopifyProduct.product_type || '',
      productType: shopifyProduct.product_type || '',
      type: shopifyProduct.product_type || '',
      tags: shopifyProduct.tags || [],
      vendor: shopifyProduct.vendor || '',
      created_at: shopifyProduct.created_at,
      published_at: shopifyProduct.published_at
    };
  }

  /**
   * Get only new arrivals (products from last 30 days)
   */
  async fetchNewArrivals(daysBack = 30) {
    const allProducts = await this.fetchProducts();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    return allProducts.filter(product => {
      const publishedDate = new Date(product.published_at || product.created_at);
      return publishedDate >= cutoffDate;
    });
  }
}

module.exports = ShopifyScraper;
