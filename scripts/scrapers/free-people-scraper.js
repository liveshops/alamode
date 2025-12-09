/**
 * Free People Scraper
 * 
 * Uses Apify E-commerce scraper - returns structured JSON data
 */

const ApifyEcommerceScraper = require('./apify-ecommerce-scraper');

class FreePeopleScraper extends ApifyEcommerceScraper {
  constructor(brand, supabase) {
    super(brand, supabase);
  }

  /**
   * Get Free People specific start URLs
   * These are category pages that the e-commerce scraper will crawl
   */
  getDefaultStartUrls() {
    return [
      'https://www.freepeople.com/new-clothes/',
      'https://www.freepeople.com/womens-clothes/',
      'https://www.freepeople.com/dresses/',
      'https://www.freepeople.com/tops/',
      'https://www.freepeople.com/bottoms/'
    ];
  }

  // No need for HTML parsing - the E-commerce scraper returns structured JSON!
  // The base class handles everything automatically.
}

module.exports = FreePeopleScraper;
