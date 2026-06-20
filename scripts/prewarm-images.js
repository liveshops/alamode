/**
 * Pre-warm Cloudinary image cache for recently-added products.
 *
 * WHY: Non-Shopify ("apify") product images are transformed by Cloudinary fetch
 * ON FIRST REQUEST. The first user to view a brand-new product pays the
 * origin-fetch + transform latency — which is exactly the "New Today" feed.
 * This script requests each new image's Cloudinary URL once (at feed size) so the
 * transform is cached at the CDN edge before real users open the app.
 *
 * Shopify CDN images are skipped: Shopify's CDN is global and already hot, so they
 * don't need warming. ASOS images are skipped because the app serves them raw
 * (no Cloudinary), matching utils/imageUtils.ts.
 *
 * Usage:
 *   node scripts/prewarm-images.js                 # warm products from last 48h
 *   node scripts/prewarm-images.js --hours=24      # custom lookback window
 *   node scripts/prewarm-images.js --limit=500     # cap number of images
 *   node scripts/prewarm-images.js --concurrency=12
 *
 * It is also exported as prewarmRecentImages() so the sync scripts can call it.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Must match utils/imageUtils.ts so the warmed URL == the URL the app requests.
const CLOUDINARY_CLOUD_NAME = 'dihoddmmi';
const IMAGE_SIZE_FEED = 540;
const FEED_QUALITY = 80;

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Returns the Cloudinary fetch URL the app will request for this image at feed
 * size, or null if the image does NOT go through Cloudinary (Shopify/ASOS/data/blob)
 * and therefore needs no warming. Mirrors getOptimizedImageUrl() in imageUtils.ts.
 */
function getCloudinaryWarmUrl(originalUrl) {
  if (!originalUrl || typeof originalUrl !== 'string') return null;
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) return null;

  // Shopify CDN: native resizing, already fast/hot — no warming needed.
  if (originalUrl.includes('cdn.shopify.com')) return null;

  // ASOS: served raw by the app (bypasses Cloudinary) — nothing to warm.
  if (originalUrl.includes('asos-media.com')) return null;

  const transformations = `w_${IMAGE_SIZE_FEED},q_${FEED_QUALITY},f_auto,c_limit`;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformations}/${originalUrl}`;
}

/**
 * Fetch recently-created, available products in pages (Supabase caps at 1000/req).
 */
async function fetchRecentProducts(sinceIso, max) {
  const pageSize = 1000;
  const collected = [];

  for (let from = 0; from < max; from += pageSize) {
    const to = Math.min(from + pageSize, max) - 1;

    const { data, error } = await supabase
      .from('products')
      .select('id, image_url, created_at')
      .eq('is_available', true)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    collected.push(...data);
    if (data.length < pageSize) break;
  }

  return collected;
}

/** Warm a single URL. Resolves to 'ok' | 'fail' (never throws). */
async function warmOne(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        // Mimic a mobile client so Cloudinary f_auto caches the modern-format variant.
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'cherry-prewarm/1.0 (+https://liveshops)',
      },
    });
    // Drain the body so the CDN fully serves (and caches) the transformed image.
    await res.arrayBuffer().catch(() => {});
    return res.ok ? 'ok' : 'fail';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

/** Run an async worker over items with bounded concurrency. */
async function runPool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

/**
 * Pre-warm the Cloudinary cache for primary images of recently-added products.
 * @param {object} [opts]
 * @param {number} [opts.hours=48]       Lookback window for created_at.
 * @param {number} [opts.limit=3000]     Max images to warm.
 * @param {number} [opts.concurrency=8]  Parallel requests.
 * @param {number} [opts.timeoutMs=15000]
 * @returns {Promise<{warmed:number, failed:number, skipped:number, total:number}>}
 */
async function prewarmRecentImages(opts = {}) {
  const hours = opts.hours ?? 48;
  const limit = opts.limit ?? 3000;
  const concurrency = opts.concurrency ?? 8;
  const timeoutMs = opts.timeoutMs ?? 15000;

  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  console.log(`\n🔥 Pre-warming Cloudinary images (last ${hours}h, limit ${limit}, concurrency ${concurrency})`);

  const products = await fetchRecentProducts(sinceIso, limit);
  console.log(`   📦 ${products.length} recent available products found`);

  // Build a deduped list of Cloudinary URLs (skips Shopify/ASOS/data/blob).
  const seen = new Set();
  const urls = [];
  let skipped = 0;
  for (const p of products) {
    const warmUrl = getCloudinaryWarmUrl(p.image_url);
    if (!warmUrl) {
      skipped++;
      continue;
    }
    if (seen.has(warmUrl)) continue;
    seen.add(warmUrl);
    urls.push(warmUrl);
  }

  console.log(`   🌩️  ${urls.length} non-Shopify images to warm (${skipped} skipped: Shopify/ASOS/none)\n`);

  if (urls.length === 0) {
    return { warmed: 0, failed: 0, skipped, total: products.length };
  }

  let warmed = 0;
  let failed = 0;
  let processed = 0;

  await runPool(urls, concurrency, async (url) => {
    const result = await warmOne(url, timeoutMs);
    if (result === 'ok') warmed++;
    else failed++;
    processed++;
    if (processed % 100 === 0 || processed === urls.length) {
      console.log(`   ... ${processed}/${urls.length} (✅ ${warmed}  ❌ ${failed})`);
    }
  });

  console.log(`\n✅ Pre-warm complete: ${warmed} warmed, ${failed} failed, ${skipped} skipped\n`);
  return { warmed, failed, skipped, total: products.length };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getNum = (name, fallback) => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    if (!arg) return fallback;
    const n = Number(arg.split('=')[1]);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    hours: getNum('hours', 48),
    limit: getNum('limit', 3000),
    concurrency: getNum('concurrency', 8),
  };
}

// Run directly: node scripts/prewarm-images.js
if (require.main === module) {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(1);
  }
  prewarmRecentImages(parseArgs())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Pre-warm error:', err.message);
      process.exit(1);
    });
}

module.exports = { prewarmRecentImages, getCloudinaryWarmUrl };
