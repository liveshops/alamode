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
 * Fashion synonym map for query expansion. Conservative on purpose:
 * only pairs where a searcher clearly wants both terms.
 */
const SEARCH_SYNONYMS: Record<string, string[]> = {
  jeans: ['denim'],
  denim: ['jeans'],
  sweater: ['jumper'],
  jumper: ['sweater'],
  purse: ['handbag'],
  handbag: ['purse'],
  swimsuit: ['swimwear'],
  swimwear: ['swimsuit'],
  sneakers: ['trainers'],
  trainers: ['sneakers'],
};

/**
 * Expand a search query with fashion synonyms for websearch_to_tsquery.
 * Single-word queries with a known synonym become "word or synonym";
 * everything else passes through unchanged (stemming handles plurals).
 */
export function expandSearchQuery(searchTerm: string): string {
  const trimmed = searchTerm.trim().toLowerCase();
  if (!trimmed || trimmed.includes(' ')) return searchTerm.trim();

  const synonyms = SEARCH_SYNONYMS[trimmed];
  if (!synonyms) return trimmed;

  return [trimmed, ...synonyms].join(' or ');
}

/**
 * Build a Supabase OR filter for searching across multiple fields with variations
 * Searches: name, description, taxonomy_category_name
 * @deprecated Product search now uses the search_products() RPC (full-text search
 * with relevance ranking). Kept for any remaining non-product callers.
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
