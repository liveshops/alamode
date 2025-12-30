/**
 * Base Scraper - New Products Only
 * 
 * Extension of BaseScraper that ONLY adds new products.
 * Skips all updates to existing products for fast syncs.
 * 
 * Use this for daily quick syncs to catch new arrivals.
 * Use the regular BaseScraper for full syncs 2x/week.
 */

const BaseScraper = require('./base-scraper');

class BaseScraperNewOnly extends BaseScraper {
  constructor(brand, supabase) {
    super(brand, supabase);
  }

  /**
   * Override upsertProduct to SKIP updates
   * Only inserts new products, ignores existing ones
   */
  async upsertProduct(productData, categoryNames = []) {
    // Validate product
    const validation = this.validateProduct(productData);
    if (!validation.isValid) {
      this.log(`Invalid product: ${validation.errors.join(', ')}`, 'warning');
      return { success: false, errors: validation.errors, skipped: false };
    }

    try {
      // Check if product already exists by external_id
      const { data: byExternalId } = await this.supabase
        .from('products')
        .select('id')
        .eq('brand_id', productData.brand_id)
        .eq('external_id', productData.external_id)
        .single();

      if (byExternalId) {
        // Product exists - SKIP IT
        return { success: true, skipped: true, isNew: false, productId: byExternalId.id };
      }

      // Also check by name to prevent name-based duplicates
      const { data: byName } = await this.supabase
        .from('products')
        .select('id')
        .eq('brand_id', productData.brand_id)
        .eq('name', productData.name)
        .single();

      if (byName) {
        // Product exists by name - SKIP IT
        return { success: true, skipped: true, isNew: false, productId: byName.id };
      }

      // Product doesn't exist - INSERT IT
      const { data, error } = await this.supabase
        .from('products')
        .insert(productData)
        .select('id')
        .single();

      if (error) {
        // Check if it's a duplicate key error
        if (error.code === '23505' || error.message.includes('duplicate key')) {
          // Another process inserted it - just skip
          return { success: true, skipped: true, isNew: false };
        } else {
          throw error;
        }
      }

      return { success: true, productId: data.id, isNew: true, skipped: false };
    } catch (error) {
      this.log(`Error inserting product: ${error.message}`, 'error');
      return { success: false, error: error.message, skipped: false };
    }
  }
}

module.exports = BaseScraperNewOnly;
