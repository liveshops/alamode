/**
 * Apify E-commerce Scraper
 * 
 * Uses Apify's E-commerce Scraping Tool to scrape bot-protected sites
 * like Free People, Urban Outfitters, etc.
 * 
 * Actor: apify/e-commerce-scraping-tool
 */

const BaseScraper = require('./base-scraper');

class ApifyEcommerceScraper extends BaseScraper {
  constructor(brand, supabase) {
    super(brand, supabase);
    this.apifyApiKey = process.env.APIFY_API_TOKEN;
    // Use Apify's E-commerce Scraper - works great for Free People!
    this.ecommerceScraperActorId = 'apify/e-commerce-scraping-tool';
  }

  /**
   * Fetch products using Apify's E-commerce scraper
   */
  async fetchProducts() {
    if (!this.apifyApiKey) {
      throw new Error('APIFY_API_TOKEN not found in environment variables');
    }

    this.log('Starting Apify E-commerce scraper...');

    try {
      // Get scraper config from brand
      const config = this.brand.scraper_config || {};
      const startUrls = config.start_urls || this.getDefaultStartUrls();

      // Start Apify actor run with E-commerce scraper input format
      const runInput = {
        startUrls: startUrls,
        maxItems: config.max_products || 100,
        proxyConfiguration: {
          useApifyProxy: true
        }
      };

      this.log('Starting Apify actor with config:', JSON.stringify(runInput, null, 2));

      // Call Apify API to start the actor
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/${this.ecommerceScraperActorId}/runs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apifyApiKey}`
          },
          body: JSON.stringify(runInput)
        }
      );

      if (!runResponse.ok) {
        throw new Error(`Apify API error: ${runResponse.statusText}`);
      }

      const run = await runResponse.json();
      const runId = run.data.id;

      this.log(`Actor run started: ${runId}`);
      this.log('Waiting for results...');

      // Wait for the run to complete
      const results = await this.waitForApifyRun(runId);

      // Parse products from results
      const products = this.parseProducts(results);

      this.log(`Successfully scraped ${products.length} products`);
      return products;

    } catch (error) {
      this.log(`Error in Apify scraper: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get default start URLs based on brand
   */
  getDefaultStartUrls() {
    const baseUrl = this.brand.website_url;
    
    // Default product listing pages
    return [
      `${baseUrl}/shop/whats-new/`,
      `${baseUrl}/womens-clothes/`,
      `${baseUrl}/sale/`
    ];
  }

  /**
   * Wait for Apify run to complete and get results
   */
  async waitForApifyRun(runId, maxWaitTime = 300000) {
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < maxWaitTime) {
      // Check run status
      const statusResponse = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apifyApiKey}`
          }
        }
      );

      const statusData = await statusResponse.json();
      const status = statusData.data.status;

      this.log(`Run status: ${status}`);

      if (status === 'SUCCEEDED') {
        // Get dataset items
        const datasetId = statusData.data.defaultDatasetId;
        return await this.getApifyDataset(datasetId);
      } else if (status === 'FAILED' || status === 'ABORTED') {
        throw new Error(`Apify run ${status.toLowerCase()}`);
      }

      // Wait before next check
      await this.delay(pollInterval);
    }

    throw new Error('Apify run timeout');
  }

  /**
   * Get dataset from Apify
   */
  async getApifyDataset(datasetId) {
    const response = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items`,
      {
        headers: {
          'Authorization': `Bearer ${this.apifyApiKey}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch dataset: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Parse products from Apify E-commerce scraper results
   * Results are already in structured JSON format
   */
  parseProducts(results) {
    const products = [];

    for (const item of results) {
      try {
        // E-commerce scraper returns structured product data
        const product = {
          id: item.mpn || item.sku || item.additionalProperties?.sku,
          title: item.name,
          name: item.name,
          description: item.description || '',
          price: item.offers?.price || '0',
          salePrice: null,
          currency: item.offers?.priceCurrency || 'USD',
          image: item.image,
          imageUrl: item.image,
          images: item.additionalProperties?.images?.map(img => img.url) || [item.image],
          additionalImages: item.additionalProperties?.images?.slice(1).map(img => img.url) || [],
          url: item.url,
          available: true,
          category: '',
          tags: [],
          variants: item.additionalProperties?.variants || []
        };

        products.push(this.normalizeProduct(product));
      } catch (error) {
        this.log(`Error parsing product: ${error.message}`, 'error');
      }
    }

    return products;
  }
}

module.exports = ApifyEcommerceScraper;
