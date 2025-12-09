/**
 * Free People Scraper
 * 
 * Uses Apify Cloudflare bypass to scrape Free People products
 */

const ApifyCloudFlareScraper = require('./apify-cloudflare-scraper');
const cheerio = require('cheerio');

class FreePeopleScraper extends ApifyCloudFlareScraper {
  constructor(brand, supabase) {
    super(brand, supabase);
  }

  /**
   * Get Free People specific start URLs
   */
  getDefaultStartUrls() {
    return [
      'https://www.freepeople.com/shop/whats-new/',
      'https://www.freepeople.com/shop/womens-clothes/',
      'https://www.freepeople.com/shop/dresses/',
      'https://www.freepeople.com/shop/tops/',
      'https://www.freepeople.com/shop/bottoms/'
    ];
  }

  /**
   * Extract products from Free People HTML
   */
  extractProductsFromHtml(html, pageUrl) {
    const $ = cheerio.load(html);
    const products = [];

    // Free People uses product cards with specific selectors
    // We'll look for common e-commerce patterns
    const productSelectors = [
      '.product-tile',
      '.product-card',
      '[data-testid="product-tile"]',
      'article[class*="product"]',
      'div[class*="ProductTile"]'
    ];

    let productElements = $();
    for (const selector of productSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        productElements = elements;
        this.log(`Found ${elements.length} products using selector: ${selector}`);
        break;
      }
    }

    if (productElements.length === 0) {
      this.log('No product elements found, trying JSON-LD data', 'warning');
      return this.extractFromJsonLd($, html);
    }

    productElements.each((index, element) => {
      try {
        const $el = $(element);
        
        // Extract product data
        const product = {
          name: this.extractProductName($el),
          url: this.extractProductUrl($el, pageUrl),
          image: this.extractProductImage($el),
          price: this.extractProductPrice($el),
          id: this.extractProductId($el)
        };

        // Only add if we have minimum required data
        if (product.name && product.url) {
          products.push(this.normalizeProduct({
            id: product.id,
            title: product.name,
            url: product.url,
            image: product.image,
            price: product.price
          }));
        }
      } catch (error) {
        this.log(`Error parsing product: ${error.message}`, 'error');
      }
    });

    return products;
  }

  /**
   * Extract product name
   */
  extractProductName($el) {
    const selectors = [
      '.product-tile__title',
      '.product-name',
      'h2',
      'h3',
      '[class*="title"]',
      'a[title]'
    ];

    for (const selector of selectors) {
      const text = $el.find(selector).first().text().trim();
      if (text) return text;
      
      // Check for title attribute
      const title = $el.find(selector).first().attr('title');
      if (title) return title;
    }

    return '';
  }

  /**
   * Extract product URL
   */
  extractProductUrl($el, baseUrl) {
    const selectors = [
      'a[href*="/products/"]',
      'a[href*="/shop/"]',
      'a.product-tile__link',
      'a[class*="product"]'
    ];

    for (const selector of selectors) {
      const href = $el.find(selector).first().attr('href');
      if (href) {
        // Handle relative URLs
        if (href.startsWith('http')) {
          return href;
        } else if (href.startsWith('/')) {
          return `https://www.freepeople.com${href}`;
        }
      }
    }

    return '';
  }

  /**
   * Extract product image
   */
  extractProductImage($el) {
    const selectors = [
      'img.product-tile__image',
      'img[class*="product"]',
      'img[src*="freepeople"]',
      'img'
    ];

    for (const selector of selectors) {
      const src = $el.find(selector).first().attr('src') || 
                   $el.find(selector).first().attr('data-src');
      if (src && src.includes('http')) {
        // Clean up image URL (remove size parameters)
        return src.split('?')[0];
      }
    }

    return '';
  }

  /**
   * Extract product price
   */
  extractProductPrice($el) {
    const selectors = [
      '.product-tile__price',
      '[class*="price"]',
      'span[class*="Price"]',
      '.price'
    ];

    for (const selector of selectors) {
      const priceText = $el.find(selector).first().text().trim();
      if (priceText) {
        // Extract number from price string
        const match = priceText.match(/[\d,]+\.?\d*/);
        if (match) {
          return match[0];
        }
      }
    }

    return '0';
  }

  /**
   * Extract product ID
   */
  extractProductId($el) {
    // Try to extract from data attributes
    const dataId = $el.attr('data-product-id') || 
                   $el.attr('data-id') ||
                   $el.find('[data-product-id]').first().attr('data-product-id');
    
    if (dataId) return dataId;

    // Try to extract from URL
    const url = this.extractProductUrl($el);
    if (url) {
      const match = url.match(/\/([^\/]+)$/);
      if (match) return match[1];
    }

    // Generate from name as last resort
    const name = this.extractProductName($el);
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /**
   * Fallback: Extract from JSON-LD structured data
   */
  extractFromJsonLd($, html) {
    const products = [];
    
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const jsonData = JSON.parse($(elem).html());
        
        // Look for product data
        if (jsonData['@type'] === 'Product') {
          products.push(this.normalizeProduct({
            id: jsonData.sku || jsonData.productID,
            title: jsonData.name,
            url: jsonData.url,
            image: jsonData.image,
            price: jsonData.offers?.price || jsonData.offers?.lowPrice
          }));
        }
      } catch (error) {
        // Skip invalid JSON
      }
    });

    return products;
  }
}

module.exports = FreePeopleScraper;
