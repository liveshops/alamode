/**
 * Apify Cloudflare Scraper
 * 
 * Uses Apify's Cloudflare bypass scraper to handle bot-protected sites
 * like Free People, Urban Outfitters, etc.
 */

const BaseScraper = require('./base-scraper');

class ApifyCloudFlareScraper extends BaseScraper {
  constructor(brand, supabase) {
    super(brand, supabase);
    this.apifyApiKey = process.env.APIFY_API_TOKEN;
    this.cloudflareScraperActorId = 'neatrat/cloudflare-scraper';
  }

  /**
   * Fetch products using Apify's Cloudflare bypass scraper
   */
  async fetchProducts() {
    if (!this.apifyApiKey) {
      throw new Error('APIFY_API_TOKEN not found in environment variables');
    }

    this.log('Starting Apify Cloudflare scraper...');

    try {
      // Get scraper config from brand
      const config = this.brand.scraper_config || {};
      const startUrls = config.start_urls || this.getDefaultStartUrls();

      // Start Apify actor run
      const runInput = {
        startUrls: startUrls.map(url => ({ url })),
        proxyConfiguration: {
          useApifyProxy: true
        },
        maxConcurrency: 5,
        maxRequestsPerCrawl: config.max_products || 500
      };

      this.log('Starting Apify actor with config:', JSON.stringify(runInput, null, 2));

      // Call Apify API to start the actor
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/${this.cloudflareScraperActorId}/runs`,
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
   * Parse products from Apify results
   * Override this method for brand-specific parsing
   */
  parseProducts(results) {
    const products = [];

    for (const page of results) {
      // Extract products from the page HTML
      const pageProducts = this.extractProductsFromHtml(page.html || page.body, page.url);
      products.push(...pageProducts);
    }

    return products;
  }

  /**
   * Extract products from HTML
   * This is brand-specific and should be overridden
   */
  extractProductsFromHtml(html, pageUrl) {
    // Default implementation - override in brand-specific scrapers
    this.log('Warning: Using default HTML parser - implement brand-specific parser', 'warning');
    return [];
  }
}

module.exports = ApifyCloudFlareScraper;
