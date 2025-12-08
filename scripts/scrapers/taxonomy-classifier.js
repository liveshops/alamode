/**
 * Shopify Taxonomy Classifier
 * 
 * Automatically classifies products into Shopify taxonomy categories
 * based on product titles, types, and keywords.
 */

// Fashion category mappings with keywords
const CATEGORY_PATTERNS = {
  // Dresses
  'Mini Dresses': ['mini dress', 'mini-dress', 'short dress'],
  'Midi Dresses': ['midi dress', 'midi-dress', 'mid dress', 'mid-length dress'],
  'Maxi Dresses': ['maxi dress', 'maxi-dress', 'long dress', 'floor-length dress'],
  'Casual Dresses': ['casual dress', 'day dress', 'sundress', 'sun dress'],
  'Cocktail Dresses': ['cocktail dress', 'party dress', 'evening dress'],
  'Slip Dresses': ['slip dress', 'satin dress', 'silky dress'],
  'Wrap Dresses': ['wrap dress', 'faux wrap'],
  'Shirt Dresses': ['shirt dress', 'shirtdress'],
  'Dresses': ['dress', 'frock'], // Fallback

  // Tops
  'Tank Tops': ['tank top', 'tank', 'cami', 'camisole'],
  'T-Shirts': ['t-shirt', 'tee', 't shirt', 'tshirt'],
  'Blouses': ['blouse', 'button-up', 'button up', 'button down'],
  'Crop Tops': ['crop top', 'cropped top', 'crop tee'],
  'Sweaters': ['sweater', 'pullover', 'jumper', 'knit top'],
  'Cardigans': ['cardigan', 'cardi'],
  'Sweatshirts & Hoodies': ['sweatshirt', 'hoodie', 'hooded'],
  'Bodysuits': ['bodysuit', 'body suit', 'leotard'],
  'Tube Tops': ['tube top', 'bandeau'],
  'Tops': ['top', 'shirt'], // Fallback

  // Bottoms - Pants
  'Jeans': ['jean', 'denim'],
  'Cargo Pants': ['cargo pant', 'cargo trouser'],
  'Chinos': ['chino'],
  'Joggers': ['jogger'],
  'Leggings': ['legging', 'tight'],
  'Sweatpants': ['sweatpant', 'track pant'],
  'Trousers': ['trouser', 'slack'],
  'Wide Leg Pants': ['wide leg', 'wide-leg'],
  'Pants': ['pant', 'bottom'], // Fallback

  // Bottoms - Shorts & Skirts
  'Shorts': ['short', 'bermuda'],
  'Mini Skirts': ['mini skirt', 'short skirt'],
  'Midi Skirts': ['midi skirt', 'mid skirt'],
  'Maxi Skirts': ['maxi skirt', 'long skirt'],
  'Skirts': ['skirt'],

  // One-Pieces
  'Jumpsuits': ['jumpsuit', 'jump suit'],
  'Rompers': ['romper', 'playsuit'],

  // Outerwear
  'Jackets': ['jacket', 'blazer'],
  'Coats': ['coat', 'overcoat', 'trench'],
  'Vests': ['vest', 'gilet'],
  'Parkas': ['parka'],
  'Puffer Jackets': ['puffer', 'padded jacket', 'quilted jacket'],

  // Swimwear
  'Bikinis': ['bikini'],
  'Bikini Tops': ['bikini top', 'swim top'],
  'Bikini Bottoms': ['bikini bottom', 'swim bottom'],
  'One-Piece Swimsuits': ['one piece swim', 'one-piece swim', 'swimsuit'],
  'Tankinis': ['tankini'],
  'Swim Cover-Ups': ['cover up', 'coverup', 'beach cover', 'kaftan'],
  'Rash Guards': ['rash guard', 'rashguard', 'swim shirt'],

  // Activewear
  'Sports Bras': ['sports bra', 'sport bra'],
  'Athletic Leggings': ['athletic legging', 'yoga pant', 'workout legging'],
  'Athletic Shorts': ['athletic short', 'bike short', 'running short'],
  'Athletic Tops': ['athletic top', 'workout top', 'gym top'],

  // Sleepwear & Loungewear
  'Pajama Sets': ['pajama set', 'pj set', 'pyjama set'],
  'Pajama Tops': ['pajama top', 'sleep top'],
  'Pajama Bottoms': ['pajama bottom', 'sleep pant'],
  'Robes': ['robe', 'dressing gown'],
  'Loungewear Sets': ['lounge set', 'co-ord set', 'matching set'],

  // Accessories
  'Handbags': ['handbag', 'purse', 'tote', 'shoulder bag'],
  'Crossbody Bags': ['crossbody', 'cross body'],
  'Clutches': ['clutch'],
  'Belts': ['belt'],
  'Hats': ['hat', 'cap', 'beanie'],
  'Sunglasses': ['sunglass'],
  'Necklaces': ['necklace', 'chain', 'pendant'],
  'Earrings': ['earring'],
  'Bracelets': ['bracelet', 'bangle'],
  'Rings': ['ring'],
  'Scarves': ['scarf', 'shawl'],
};

// Taxonomy ID mapping (maps category name to Shopify taxonomy ID)
const TAXONOMY_IDS = {
  // Dresses (aa-1-4-x)
  'Mini Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-1',
  'Midi Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-2',
  'Maxi Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-3',
  'Casual Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-4',
  'Cocktail Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-5',
  'Slip Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-8',
  'Wrap Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-9',
  'Shirt Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4-7',
  'Dresses': 'gid://shopify/TaxonomyCategory/aa-1-4',

  // Tops (aa-1-13-x)
  'Tank Tops': 'gid://shopify/TaxonomyCategory/aa-1-13-11',
  'T-Shirts': 'gid://shopify/TaxonomyCategory/aa-1-13-12',
  'Blouses': 'gid://shopify/TaxonomyCategory/aa-1-13-1',
  'Crop Tops': 'gid://shopify/TaxonomyCategory/aa-1-13-4',
  'Sweaters': 'gid://shopify/TaxonomyCategory/aa-1-13-10',
  'Cardigans': 'gid://shopify/TaxonomyCategory/aa-1-13-2',
  'Sweatshirts & Hoodies': 'gid://shopify/TaxonomyCategory/aa-1-13-9',
  'Bodysuits': 'gid://shopify/TaxonomyCategory/aa-1-13-13',
  'Tube Tops': 'gid://shopify/TaxonomyCategory/aa-1-13-14',
  'Tops': 'gid://shopify/TaxonomyCategory/aa-1-13',

  // Pants (aa-1-7-x)
  'Jeans': 'gid://shopify/TaxonomyCategory/aa-1-7-2',
  'Cargo Pants': 'gid://shopify/TaxonomyCategory/aa-1-7-4',
  'Chinos': 'gid://shopify/TaxonomyCategory/aa-1-7-5',
  'Joggers': 'gid://shopify/TaxonomyCategory/aa-1-7-1',
  'Leggings': 'gid://shopify/TaxonomyCategory/aa-1-7-3',
  'Sweatpants': 'gid://shopify/TaxonomyCategory/aa-1-7-7',
  'Trousers': 'gid://shopify/TaxonomyCategory/aa-1-7-8',
  'Wide Leg Pants': 'gid://shopify/TaxonomyCategory/aa-1-7-9',
  'Pants': 'gid://shopify/TaxonomyCategory/aa-1-7',

  // Shorts & Skirts
  'Shorts': 'gid://shopify/TaxonomyCategory/aa-1-8',
  'Mini Skirts': 'gid://shopify/TaxonomyCategory/aa-1-9-1',
  'Midi Skirts': 'gid://shopify/TaxonomyCategory/aa-1-9-2',
  'Maxi Skirts': 'gid://shopify/TaxonomyCategory/aa-1-9-3',
  'Skirts': 'gid://shopify/TaxonomyCategory/aa-1-9',

  // One-Pieces
  'Jumpsuits': 'gid://shopify/TaxonomyCategory/aa-1-5-1',
  'Rompers': 'gid://shopify/TaxonomyCategory/aa-1-5-2',

  // Outerwear
  'Jackets': 'gid://shopify/TaxonomyCategory/aa-1-6-1',
  'Coats': 'gid://shopify/TaxonomyCategory/aa-1-6-2',
  'Vests': 'gid://shopify/TaxonomyCategory/aa-1-6-4',
  'Parkas': 'gid://shopify/TaxonomyCategory/aa-1-6-3',
  'Puffer Jackets': 'gid://shopify/TaxonomyCategory/aa-1-6-5',

  // Swimwear
  'Bikinis': 'gid://shopify/TaxonomyCategory/aa-1-12-1',
  'Bikini Tops': 'gid://shopify/TaxonomyCategory/aa-1-12-1-1',
  'Bikini Bottoms': 'gid://shopify/TaxonomyCategory/aa-1-12-1-2',
  'One-Piece Swimsuits': 'gid://shopify/TaxonomyCategory/aa-1-12-2',
  'Tankinis': 'gid://shopify/TaxonomyCategory/aa-1-12-3',
  'Swim Cover-Ups': 'gid://shopify/TaxonomyCategory/aa-1-12-4',
  'Rash Guards': 'gid://shopify/TaxonomyCategory/aa-1-12-5',

  // Activewear
  'Sports Bras': 'gid://shopify/TaxonomyCategory/aa-1-1-6',
  'Athletic Leggings': 'gid://shopify/TaxonomyCategory/aa-1-1-1-2',
  'Athletic Shorts': 'gid://shopify/TaxonomyCategory/aa-1-1-1-3',
  'Athletic Tops': 'gid://shopify/TaxonomyCategory/aa-1-1-2',

  // Sleepwear
  'Pajama Sets': 'gid://shopify/TaxonomyCategory/aa-1-10-1',
  'Pajama Tops': 'gid://shopify/TaxonomyCategory/aa-1-10-2',
  'Pajama Bottoms': 'gid://shopify/TaxonomyCategory/aa-1-10-3',
  'Robes': 'gid://shopify/TaxonomyCategory/aa-1-10-4',
  'Loungewear Sets': 'gid://shopify/TaxonomyCategory/aa-1-10-5',

  // Accessories - Bags
  'Handbags': 'gid://shopify/TaxonomyCategory/aa-2-1-1',
  'Crossbody Bags': 'gid://shopify/TaxonomyCategory/aa-2-1-2',
  'Clutches': 'gid://shopify/TaxonomyCategory/aa-2-1-3',

  // Accessories - Other
  'Belts': 'gid://shopify/TaxonomyCategory/aa-2-2',
  'Hats': 'gid://shopify/TaxonomyCategory/aa-2-3',
  'Sunglasses': 'gid://shopify/TaxonomyCategory/aa-2-4',
  
  // Accessories - Jewelry
  'Necklaces': 'gid://shopify/TaxonomyCategory/aa-2-5-1',
  'Earrings': 'gid://shopify/TaxonomyCategory/aa-2-5-2',
  'Bracelets': 'gid://shopify/TaxonomyCategory/aa-2-5-3',
  'Rings': 'gid://shopify/TaxonomyCategory/aa-2-5-4',

  // Scarves
  'Scarves': 'gid://shopify/TaxonomyCategory/aa-2-6',
};

// Full taxonomy paths
const TAXONOMY_PATHS = {
  'Mini Dresses': 'Apparel & Accessories > Clothing > Dresses > Mini Dresses',
  'Midi Dresses': 'Apparel & Accessories > Clothing > Dresses > Midi Dresses',
  'Maxi Dresses': 'Apparel & Accessories > Clothing > Dresses > Maxi Dresses',
  'Casual Dresses': 'Apparel & Accessories > Clothing > Dresses > Casual Dresses',
  'Cocktail Dresses': 'Apparel & Accessories > Clothing > Dresses > Cocktail Dresses',
  'Slip Dresses': 'Apparel & Accessories > Clothing > Dresses > Slip Dresses',
  'Wrap Dresses': 'Apparel & Accessories > Clothing > Dresses > Wrap Dresses',
  'Shirt Dresses': 'Apparel & Accessories > Clothing > Dresses > Shirt Dresses',
  'Dresses': 'Apparel & Accessories > Clothing > Dresses',

  'Tank Tops': 'Apparel & Accessories > Clothing > Tops > Tank Tops',
  'T-Shirts': 'Apparel & Accessories > Clothing > Tops > T-Shirts',
  'Blouses': 'Apparel & Accessories > Clothing > Tops > Blouses',
  'Crop Tops': 'Apparel & Accessories > Clothing > Tops > Crop Tops',
  'Sweaters': 'Apparel & Accessories > Clothing > Tops > Sweaters',
  'Cardigans': 'Apparel & Accessories > Clothing > Tops > Cardigans',
  'Sweatshirts & Hoodies': 'Apparel & Accessories > Clothing > Tops > Sweatshirts & Hoodies',
  'Bodysuits': 'Apparel & Accessories > Clothing > Tops > Bodysuits',
  'Tube Tops': 'Apparel & Accessories > Clothing > Tops > Tube Tops',
  'Tops': 'Apparel & Accessories > Clothing > Tops',

  'Jeans': 'Apparel & Accessories > Clothing > Pants > Jeans',
  'Cargo Pants': 'Apparel & Accessories > Clothing > Pants > Cargo Pants',
  'Chinos': 'Apparel & Accessories > Clothing > Pants > Chinos',
  'Joggers': 'Apparel & Accessories > Clothing > Pants > Joggers',
  'Leggings': 'Apparel & Accessories > Clothing > Pants > Leggings',
  'Sweatpants': 'Apparel & Accessories > Clothing > Pants > Sweatpants',
  'Trousers': 'Apparel & Accessories > Clothing > Pants > Trousers',
  'Wide Leg Pants': 'Apparel & Accessories > Clothing > Pants > Wide Leg Pants',
  'Pants': 'Apparel & Accessories > Clothing > Pants',

  'Shorts': 'Apparel & Accessories > Clothing > Shorts',
  
  'Mini Skirts': 'Apparel & Accessories > Clothing > Skirts > Mini Skirts',
  'Midi Skirts': 'Apparel & Accessories > Clothing > Skirts > Midi Skirts',
  'Maxi Skirts': 'Apparel & Accessories > Clothing > Skirts > Maxi Skirts',
  'Skirts': 'Apparel & Accessories > Clothing > Skirts',

  'Jumpsuits': 'Apparel & Accessories > Clothing > One-Pieces > Jumpsuits',
  'Rompers': 'Apparel & Accessories > Clothing > One-Pieces > Rompers',

  'Jackets': 'Apparel & Accessories > Clothing > Outerwear > Jackets',
  'Coats': 'Apparel & Accessories > Clothing > Outerwear > Coats',
  'Vests': 'Apparel & Accessories > Clothing > Outerwear > Vests',
  'Parkas': 'Apparel & Accessories > Clothing > Outerwear > Parkas',
  'Puffer Jackets': 'Apparel & Accessories > Clothing > Outerwear > Puffer Jackets',

  'Bikinis': 'Apparel & Accessories > Clothing > Swimwear & Beachwear > Bikinis',
  'Bikini Tops': 'Apparel & Accessories > Clothing > Swimwear & Beachwear > Bikinis > Bikini Tops',
  'Bikini Bottoms': 'Apparel & Accessories > Clothing > Swimwear & Beachwear > Bikinis > Bikini Bottoms',
  'One-Piece Swimsuits': 'Apparel & Accessories > Clothing > Swimwear & Beachwear > One-Piece Swimsuits',
  'Tankinis': 'Apparel & Accessories > Clothing > Swimwear & Beachwear > Tankinis',
  'Swim Cover-Ups': 'Apparel & Accessories > Clothing > Swimwear & Beachwear > Swim Cover-Ups',
  'Rash Guards': 'Apparel & Accessories > Clothing > Swimwear & Beachwear > Rash Guards',

  'Sports Bras': 'Apparel & Accessories > Clothing > Activewear > Sports Bras',
  'Athletic Leggings': 'Apparel & Accessories > Clothing > Activewear > Activewear Pants > Leggings',
  'Athletic Shorts': 'Apparel & Accessories > Clothing > Activewear > Activewear Pants > Shorts',
  'Athletic Tops': 'Apparel & Accessories > Clothing > Activewear > Activewear Tops',

  'Pajama Sets': 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Pajama Sets',
  'Pajama Tops': 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Pajama Tops',
  'Pajama Bottoms': 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Pajama Bottoms',
  'Robes': 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Robes',
  'Loungewear Sets': 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Loungewear Sets',

  'Handbags': 'Apparel & Accessories > Accessories > Bags > Handbags',
  'Crossbody Bags': 'Apparel & Accessories > Accessories > Bags > Crossbody Bags',
  'Clutches': 'Apparel & Accessories > Accessories > Bags > Clutches',

  'Belts': 'Apparel & Accessories > Accessories > Belts',
  'Hats': 'Apparel & Accessories > Accessories > Hats',
  'Sunglasses': 'Apparel & Accessories > Accessories > Sunglasses',
  
  'Necklaces': 'Apparel & Accessories > Accessories > Jewelry > Necklaces',
  'Earrings': 'Apparel & Accessories > Accessories > Jewelry > Earrings',
  'Bracelets': 'Apparel & Accessories > Accessories > Jewelry > Bracelets',
  'Rings': 'Apparel & Accessories > Accessories > Jewelry > Rings',

  'Scarves': 'Apparel & Accessories > Accessories > Scarves',
};

/**
 * Classify a product into a taxonomy category
 * @param {Object} product - Product object with name and optionally product_type
 * @returns {Object|null} - Taxonomy classification or null if can't classify
 */
function classifyProduct(product) {
  if (!product || !product.name) {
    return null;
  }

  const searchText = `${product.name} ${product.product_type || ''} ${product.description || ''}`.toLowerCase();

  // Try to match most specific categories first (longest patterns)
  const sortedCategories = Object.entries(CATEGORY_PATTERNS).sort((a, b) => {
    const maxLengthA = Math.max(...a[1].map(p => p.length));
    const maxLengthB = Math.max(...b[1].map(p => p.length));
    return maxLengthB - maxLengthA;
  });

  for (const [categoryName, patterns] of sortedCategories) {
    for (const pattern of patterns) {
      if (searchText.includes(pattern.toLowerCase())) {
        const taxonomyId = TAXONOMY_IDS[categoryName];
        const fullPath = TAXONOMY_PATHS[categoryName];

        if (!taxonomyId || !fullPath) {
          console.warn(`Missing taxonomy mapping for: ${categoryName}`);
          continue;
        }

        // Calculate level from taxonomy ID
        const level = (taxonomyId.match(/-/g) || []).length;

        return {
          taxonomy_id: taxonomyId,
          taxonomy_category_name: categoryName,
          taxonomy_full_path: fullPath,
          taxonomy_level: level,
          taxonomy_attributes: []
        };
      }
    }
  }

  // No match found
  return null;
}

/**
 * Classify multiple products
 * @param {Array} products - Array of product objects
 * @returns {Array} - Products with taxonomy classifications added
 */
function classifyProducts(products) {
  return products.map(product => {
    const classification = classifyProduct(product);
    return {
      ...product,
      ...classification
    };
  });
}

module.exports = {
  classifyProduct,
  classifyProducts,
  CATEGORY_PATTERNS,
  TAXONOMY_IDS,
  TAXONOMY_PATHS
};
