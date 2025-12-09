/**
 * Custom Scrapers for Non-Shopify Brands
 * 
 * Contains specialized scrapers for brands that don't use Shopify
 * or require custom scraping logic.
 */

const BaseScraper = require('./base-scraper');
const { JSDOM } = require('jsdom');

/**
 * Zara Scraper
 * Uses their REST API
 */
class ZaraScraper extends BaseScraper {
  async fetchProducts() {
    this.log('Starting Zara product fetch');
    
    try {
      // Zara uses a REST API - we need to find the API endpoint
      // Format: https://www.zara.com/us/en/category/{categoryId}/products
      const categoryId = '1180'; // Women's New In
      const url = `https://www.zara.com/us/en/category/${categoryId}/products?ajax=true`;
      
      const response = await this.makeRequest(url);
      const data = await response.json();
      
      const products = [];
      
      if (data.productGroups) {
        for (const group of data.productGroups) {
          if (group.products) {
            for (const product of group.products) {
              products.push(this.normalizeZaraProduct(product));
            }
          }
        }
      }
      
      this.log(`Fetched ${products.length} products from Zara`, 'success');
      return products;
    } catch (error) {
      this.log(`Error: ${error.message}`, 'error');
      return [];
    }
  }

  normalizeZaraProduct(zaraProduct) {
    const price = zaraProduct.price / 100; // Zara stores prices in cents
    
    return {
      id: zaraProduct.id,
      sku: zaraProduct.seo?.keyword || zaraProduct.id,
      title: zaraProduct.name,
      name: zaraProduct.name,
      description: zaraProduct.description || '',
      price: price,
      salePrice: null,
      currency: 'USD',
      image: zaraProduct.image?.url || '',
      imageUrl: zaraProduct.image?.url || '',
      images: (zaraProduct.images || []).map(img => img.url),
      additionalImages: (zaraProduct.images || []).slice(1).map(img => img.url),
      url: `https://www.zara.com${zaraProduct.seo?.keyword || ''}`,
      available: true,
      category: zaraProduct.familyName || '',
      tags: [zaraProduct.subfamilyName, zaraProduct.sectionName].filter(Boolean)
    };
  }
}

// Aritzia Scraper - moved to separate file (uses Apify like Free People)

/**
 * H&M Scraper
 * H&M has a custom platform
 */
class HMScraper extends BaseScraper {
  async fetchProducts() {
    this.log('Starting H&M product fetch');
    
    try {
      // H&M uses a product listing API
      const url = 'https://www2.hm.com/en_us/women/new-arrivals/_jcr_content/main/productlisting.display.json?page=0&page-size=100';
      
      const response = await this.makeRequest(url, {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www2.hm.com/en_us/women/new-arrivals.html'
        }
      });
      
      const data = await response.json();
      const products = [];
      
      if (data.products) {
        for (const product of data.products) {
          products.push(this.normalizeHMProduct(product));
        }
      }
      
      this.log(`Fetched ${products.length} products from H&M`, 'success');
      return products;
    } catch (error) {
      this.log(`Error: ${error.message}`, 'error');
      return [];
    }
  }

  normalizeHMProduct(hmProduct) {
    return {
      id: hmProduct.articleCode || hmProduct.code,
      sku: hmProduct.articleCode || hmProduct.code,
      title: hmProduct.title || hmProduct.name,
      name: hmProduct.title || hmProduct.name,
      description: hmProduct.description || '',
      price: parseFloat(hmProduct.price?.value || hmProduct.price || 0),
      salePrice: hmProduct.redPrice?.value ? parseFloat(hmProduct.redPrice.value) : null,
      currency: hmProduct.price?.currency || 'USD',
      image: hmProduct.image?.[0]?.url || hmProduct.imageUrl || '',
      imageUrl: hmProduct.image?.[0]?.url || hmProduct.imageUrl || '',
      images: hmProduct.image?.slice(1).map(img => img.url) || [],
      additionalImages: hmProduct.image?.slice(1).map(img => img.url) || [],
      url: `https://www2.hm.com${hmProduct.link || hmProduct.url || ''}`,
      available: !hmProduct.comingSoon,
      category: hmProduct.categoryName || '',
      tags: [hmProduct.concept, hmProduct.collectionName].filter(Boolean)
    };
  }
}

/**
 * Generic HTML Scraper
 * For brands without APIs - uses Cheerio-like parsing with JSDOM
 */
class HTMLScraper extends BaseScraper {
  async fetchProducts() {
    this.log('Starting HTML scrape');
    
    try {
      const config = this.brand.scraper_config || {};
      const newArrivalsPath = config.new_arrivals_path || '/new-arrivals';
      const url = this.brand.website_url + newArrivalsPath;
      
      const response = await this.makeRequest(url);
      const html = await response.text();
      
      return this.parseProductsFromHTML(html);
    } catch (error) {
      this.log(`Error: ${error.message}`, 'error');
      return [];
    }
  }

  parseProductsFromHTML(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    const products = [];
    
    // Common selectors for product listings
    const selectors = [
      '.product-item',
      '.product-card',
      '.product',
      '[data-product-id]',
      '.grid-item'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      
      if (elements.length > 0) {
        this.log(`Found ${elements.length} products using selector: ${selector}`);
        
        elements.forEach((element, index) => {
          const product = this.extractProductFromElement(element);
          if (product) {
            products.push(product);
          }
        });
        
        break; // Use first successful selector
      }
    }
    
    this.log(`Extracted ${products.length} products from HTML`, 'success');
    return products;
  }

  extractProductFromElement(element) {
    try {
      // Extract product ID
      const id = element.getAttribute('data-product-id') || 
                 element.getAttribute('data-id') ||
                 element.querySelector('[data-product-id]')?.getAttribute('data-product-id');
      
      // Extract title
      const titleEl = element.querySelector('.product-title, .product-name, h2, h3, [data-product-title]');
      const title = titleEl?.textContent?.trim();
      
      // Extract price
      const priceEl = element.querySelector('.price, .product-price, [data-price]');
      const priceText = priceEl?.textContent?.trim();
      
      // Extract image
      const imgEl = element.querySelector('img');
      const image = imgEl?.src || imgEl?.getAttribute('data-src');
      
      // Extract URL
      const linkEl = element.querySelector('a');
      const url = linkEl?.href;
      
      if (!title || !image) {
        return null;
      }
      
      return {
        id: id || `html-${Date.now()}-${Math.random()}`,
        sku: id || '',
        title: title,
        name: title,
        description: '',
        price: this.parsePrice(priceText || '0'),
        salePrice: null,
        currency: 'USD',
        image: image,
        imageUrl: image,
        images: [],
        additionalImages: [],
        url: url || this.brand.website_url,
        available: true,
        category: '',
        tags: []
      };
    } catch (error) {
      return null;
    }
  }
}

// Import Apify-based scrapers
const FreePeopleScraper = require('./free-people-scraper');
const AritziaScraper = require('./aritzia-scraper');

// Export all custom scrapers
module.exports = {
  ZaraScraper,
  AritziaScraper,
  HMScraper,
  HTMLScraper,
  FreePeopleScraper
};
