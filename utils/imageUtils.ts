/**
 * Image URL optimization utilities
 * 
 * Uses Cloudinary fetch for non-Shopify images and Shopify's native resizing
 * for Shopify CDN images. This reduces bandwidth by ~80% for product images.
 */

const CLOUDINARY_CLOUD_NAME = 'dihoddmmi';

// Standard sizes for different contexts
export const IMAGE_SIZE_FEED = 800;      // Product cards in 2-column grid (~190pt × 3x retina)
export const IMAGE_SIZE_DETAIL = 1200;   // Full-width product detail page

/**
 * Get an optimized image URL for the given original URL
 * 
 * @param originalUrl - The original full-resolution image URL
 * @param width - Target width in pixels (default 400 for product cards)
 * @param quality - Image quality 1-100 (default 80)
 * @returns Optimized image URL
 */
export function getOptimizedImageUrl(
  originalUrl: string | undefined | null,
  width: number = IMAGE_SIZE_FEED,
  quality: number = 80
): string {
  if (!originalUrl) return '';
  
  // Skip optimization for data URLs or blob URLs
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }
  
  // Shopify CDN - use native resizing (free, fast)
  if (originalUrl.includes('cdn.shopify.com')) {
    return getShopifyOptimizedUrl(originalUrl, width);
  }
  
  // ASOS - skip Cloudinary (has $ chars that break URL parsing, and they have their own CDN)
  if (originalUrl.includes('asos-media.com')) {
    return originalUrl;
  }
  
  // All other URLs - proxy through Cloudinary fetch
  return getCloudinaryFetchUrl(originalUrl, width, quality);
}

/**
 * Shopify CDN native resizing
 * Shopify supports _WIDTHx suffix before file extension
 * Example: image.jpg -> image_400x.jpg
 */
function getShopifyOptimizedUrl(url: string, width: number): string {
  // Check if URL already has size suffix
  if (/_\d+x\d*\./.test(url) || /_\d+x\./.test(url)) {
    // Replace existing size with new size
    return url.replace(/_\d+x\d*\./, `_${width}x.`);
  }
  
  // Add size suffix before extension
  return url.replace(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i, `_${width}x.$1$2`);
}

/**
 * Cloudinary fetch - proxy and transform external images
 * https://cloudinary.com/documentation/fetch_remote_images
 */
function getCloudinaryFetchUrl(url: string, width: number, quality: number): string {
  // Cloudinary transformations
  // w_ = width, q_ = quality, f_auto = auto format (webp when supported), c_limit = don't upscale
  const transformations = `w_${width},q_${quality},f_auto,c_limit`;
  
  // Cloudinary fetch expects the raw URL (not encoded) appended to the path
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformations}/${url}`;
}

/**
 * Get multiple size variants for responsive images
 * Useful for srcset or preloading different sizes
 */
export function getImageSrcSet(originalUrl: string): { small: string; medium: string; large: string } {
  return {
    small: getOptimizedImageUrl(originalUrl, 400, 75),
    medium: getOptimizedImageUrl(originalUrl, IMAGE_SIZE_FEED, 80),
    large: getOptimizedImageUrl(originalUrl, IMAGE_SIZE_DETAIL, 85),
  };
}
