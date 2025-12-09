/**
 * Aritzia Scraper
 * 
 * Uses Apify E-commerce scraper - returns structured JSON data
 * Same approach as Free People
 */

const ApifyEcommerceScraper = require('./apify-ecommerce-scraper');

class AritziaScraper extends ApifyEcommerceScraper {
  constructor(brand, supabase) {
    super(brand, supabase);
  }

  /**
   * Get Aritzia specific start URLs
   * These are category pages that the e-commerce scraper will crawl
   */
  getDefaultStartUrls() {
    return [
      'https://www.aritzia.com/us/en/clothing/new-arrivals',
      'https://www.aritzia.com/us/en/clothing/dresses',
      'https://www.aritzia.com/us/en/clothing/tops',
      'https://www.aritzia.com/us/en/clothing/sweaters',
      'https://www.aritzia.com/us/en/clothing/pants'
    ];
  }
}

module.exports = AritziaScraper;
