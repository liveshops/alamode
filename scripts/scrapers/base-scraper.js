/**
 * Base Scraper Class
 * 
 * Abstract base class for all brand-specific scrapers.
 * Provides common functionality for rate limiting, error handling, and data normalization.
 */

const { classifyProduct } = require('./taxonomy-classifier');

class BaseScraper {
  constructor(brand, supabase) {
    this.brand = brand;
    this.supabase = supabase;
    this.requestDelay = 1500; // 1.5 seconds between requests
    this.maxRetries = 3;
    this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * Main method to fetch products - must be implemented by subclasses
   */
  async fetchProducts() {
    throw new Error('fetchProducts() must be implemented by subclass');
  }

  /**
   * Delay between requests to be polite to servers
   */
  async delay(ms = this.requestDelay) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(url, options = {}) {
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      ...options.headers
    };

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          throw error;
        }
        
        // Exponential backoff
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`   ⏳ Retry ${attempt + 1}/${this.maxRetries} after ${waitTime}ms...`);
        await this.delay(waitTime);
      }
    }
  }

  /**
   * Normalize product data to our schema
   */
  normalizeProduct(rawProduct) {
    const productName = this.cleanText(rawProduct.name || rawProduct.title);
    const productDescription = this.cleanText(rawProduct.description || '');
    const productType = rawProduct.productType || rawProduct.type || rawProduct.category || '';

    // Classify product using Shopify taxonomy
    const taxonomy = classifyProduct({
      name: productName,
      product_type: productType,
      description: productDescription
    });

    return {
      brand_id: this.brand.id,
      external_id: String(rawProduct.id || rawProduct.sku || ''),
      name: productName,
      description: productDescription,
      price: this.parsePrice(rawProduct.price),
      sale_price: rawProduct.salePrice ? this.parsePrice(rawProduct.salePrice) : null,
      currency: rawProduct.currency || 'USD',
      image_url: this.normalizeImageUrl(rawProduct.image || rawProduct.imageUrl),
      additional_images: this.normalizeImageUrls(rawProduct.additionalImages || rawProduct.images || []),
      product_url: rawProduct.url || rawProduct.link || '',
      variants: rawProduct.variants || [],
      is_available: rawProduct.available !== false && rawProduct.inStock !== false,
      last_checked_at: new Date().toISOString(),
      // Add taxonomy classification
      ...(taxonomy || {})
    };
  }

  /**
   * Clean text by removing HTML tags and extra whitespace
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Parse price string to decimal number
   */
  parsePrice(priceString) {
    if (typeof priceString === 'number') return priceString;
    if (!priceString) return 0;

    // Remove currency symbols and commas, extract number
    const cleaned = String(priceString)
      .replace(/[^0-9.]/g, '');
    
    return parseFloat(cleaned) || 0;
  }

  /**
   * Normalize image URL (ensure HTTPS, handle CDN URLs)
   */
  normalizeImageUrl(url) {
    if (!url) return '';
    
    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    // Handle relative URLs
    if (url.startsWith('/')) {
      return this.brand.website_url + url;
    }
    
    // Ensure HTTPS
    return url.replace(/^http:/, 'https:');
  }

  /**
   * Normalize array of image URLs
   */
  normalizeImageUrls(urls) {
    if (!Array.isArray(urls)) return [];
    return urls.map(url => this.normalizeImageUrl(url)).filter(Boolean);
  }

  /**
   * Extract category information from product data
   */
  extractCategories(product) {
    const categories = new Set();
    
    // Check various possible category fields
    const categoryFields = [
      product.category,
      product.productType,
      product.type,
      ...(product.categories || []),
      ...(product.tags || [])
    ];

    for (const field of categoryFields) {
      if (field && typeof field === 'string') {
        categories.add(field.toLowerCase().trim());
      }
    }

    return Array.from(categories);
  }

  /**
   * Log scrape progress
   */
  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    }[type] || 'ℹ️';

    console.log(`${emoji} [${this.brand.slug}] ${message}`);
  }

  /**
   * Validate product data before saving
   */
  validateProduct(product) {
    const errors = [];

    if (!product.external_id) {
      errors.push('Missing external_id');
    }

    if (!product.name || product.name.length < 2) {
      errors.push('Invalid or missing name');
    }

    if (!product.price || product.price <= 0) {
      errors.push('Invalid price');
    }

    if (!product.image_url) {
      errors.push('Missing image_url');
    }

    if (!product.product_url) {
      errors.push('Missing product_url');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Save or update product in database
   */
  async upsertProduct(productData, categoryNames = []) {
    // Validate product
    const validation = this.validateProduct(productData);
    if (!validation.isValid) {
      this.log(`Invalid product: ${validation.errors.join(', ')}`, 'warning');
      return { success: false, errors: validation.errors };
    }

    try {
      // Check if product already exists
      const { data: existing } = await this.supabase
        .from('products')
        .select('id, price')
        .eq('brand_id', productData.brand_id)
        .eq('external_id', productData.external_id)
        .single();

      let productId;
      let isNew = false;

      if (existing) {
        // Update existing product
        const { data, error } = await this.supabase
          .from('products')
          .update(productData)
          .eq('id', existing.id)
          .select('id')
          .single();

        if (error) throw error;
        productId = data.id;
      } else {
        // Insert new product
        const { data, error } = await this.supabase
          .from('products')
          .insert(productData)
          .select('id')
          .single();

        if (error) throw error;
        productId = data.id;
        isNew = true;
      }

      // Category classification is now handled automatically in normalizeProduct()
      // via the taxonomy classifier - no need for manual assignment

      return { success: true, productId, isNew };
    } catch (error) {
      this.log(`Error upserting product: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Note: Category assignment is now handled automatically via taxonomy
   * classification in the normalizeProduct() method. Products are auto-tagged
   * with Shopify taxonomy categories based on their name and description.
   */
}

module.exports = BaseScraper;
