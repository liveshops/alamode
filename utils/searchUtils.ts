/**
 * Search utilities for handling plural/singular matching and query expansion
 */

/**
 * Generate plural and singular variations of a search term
 * Handles common English pluralization patterns
 */
export function getSearchVariations(term: string): string[] {
  const lowerTerm = term.toLowerCase().trim();
  const variations = new Set<string>([lowerTerm]);
  
  // Common pluralization rules
  if (lowerTerm.endsWith('s')) {
    // If ends with 's', try removing it for singular
    variations.add(lowerTerm.slice(0, -1));
    
    // Handle -es endings (dresses -> dress)
    if (lowerTerm.endsWith('es')) {
      variations.add(lowerTerm.slice(0, -2));
    }
    
    // Handle -ies endings (accessories -> accessory)
    if (lowerTerm.endsWith('ies')) {
      variations.add(lowerTerm.slice(0, -3) + 'y');
    }
  } else {
    // Generate plural variations
    
    // If ends with 'y', replace with 'ies' (accessory -> accessories)
    if (lowerTerm.endsWith('y') && lowerTerm.length > 1) {
      const beforeY = lowerTerm[lowerTerm.length - 2];
      // Only if the letter before 'y' is a consonant
      if (!'aeiou'.includes(beforeY)) {
        variations.add(lowerTerm.slice(0, -1) + 'ies');
      }
    }
    
    // Standard plural (add 's')
    variations.add(lowerTerm + 's');
    
    // -es plural for words ending in x, z, ch, sh (box -> boxes)
    if (
      lowerTerm.endsWith('x') ||
      lowerTerm.endsWith('z') ||
      lowerTerm.endsWith('ch') ||
      lowerTerm.endsWith('sh')
    ) {
      variations.add(lowerTerm + 'es');
    }
  }
  
  return Array.from(variations);
}

/**
 * Build a Supabase OR filter for searching across multiple fields with variations
 * Searches: name, description, taxonomy_category_name
 */
export function buildSearchFilter(searchTerm: string): string {
  const variations = getSearchVariations(searchTerm);
  const filters: string[] = [];
  
  // For each variation, search across all fields
  variations.forEach(variant => {
    filters.push(`name.ilike.%${variant}%`);
    filters.push(`description.ilike.%${variant}%`);
    filters.push(`taxonomy_category_name.ilike.%${variant}%`);
  });
  
  return filters.join(',');
}

/**
 * Example usage:
 * 
 * const searchFilter = buildSearchFilter('dress');
 * // Returns: "name.ilike.%dress%,description.ilike.%dress%,taxonomy_category_name.ilike.%dress%,name.ilike.%dresses%,..."
 * 
 * const { data } = await supabase
 *   .from('products')
 *   .select('*')
 *   .or(searchFilter);
 */
