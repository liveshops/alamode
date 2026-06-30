#!/usr/bin/env node
/**
 * Sync Report
 *
 * Prints a post-sync report for the most recent Apify sync: per-brand products
 * added / updated / deleted, status, current available totals, and timing.
 * This is READ-ONLY — it only reads `product_scrape_logs`; nothing is scraped
 * or synced. Run it any time after a daily sync to see what happened.
 *
 * Usage:
 *   node scripts/sync-report.js              # the last sync — all Apify brands
 *   node scripts/sync-report.js --hours 6    # only brands synced in last 6 hours
 *   node scripts/sync-report.js --json       # machine-readable JSON output
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { printSyncReport } = require('./lib/print-sync-report');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---- args ----
const args = process.argv.slice(2);
const hoursIdx = args.indexOf('--hours');
const HOURS = hoursIdx !== -1 ? Number(args[hoursIdx + 1]) : null;
const AS_JSON = args.includes('--json');

async function main() {
  // 1. Active Apify brands (same filter the sync uses)
  const { data: brands, error } = await supabase
    .from('brands')
    .select('id,name,slug,scraper_config')
    .eq('is_active', true);

  if (error) {
    console.error('❌ Error fetching brands:', error.message);
    process.exit(1);
  }

  const apifyBrands = brands.filter((b) => (b.scraper_config || {}).apify_task_id);
  const brandIds = apifyBrands.map((b) => b.id);

  if (apifyBrands.length === 0) {
    console.log('⚠️  No Apify-configured brands found');
    return;
  }

  // 2. Pull recent scrape logs for these brands, newest first
  const { data: logs, error: logErr } = await supabase
    .from('product_scrape_logs')
    .select(
      'brand_id,status,products_added,products_updated,execution_time_seconds,started_at,completed_at'
    )
    .in('brand_id', brandIds)
    .order('started_at', { ascending: false });

  if (logErr) {
    console.error('❌ Error fetching scrape logs:', logErr.message);
    process.exit(1);
  }

  // Keep only the most recent log per brand
  const latestByBrand = new Map();
  for (const log of logs) {
    if (!latestByBrand.has(log.brand_id)) latestByBrand.set(log.brand_id, log);
  }

  // 3. Build rows in the SAME order the live sync prints them (DB fetch order)
  //    so this report is identical to the end-of-sync one.
  const cutoff = HOURS ? Date.now() - HOURS * 3600 * 1000 : null;
  const results = [];

  for (const brand of apifyBrands) {
    const log = latestByBrand.get(brand.id);
    if (cutoff && (!log || new Date(log.started_at).getTime() < cutoff)) continue;

    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('is_available', true);

    results.push({
      brand: brand.name,
      slug: brand.slug,
      // The live sync only marks a brand ❌ when its sync process throws,
      // which is recorded as a 'failed' log row.
      success: log ? log.status !== 'failed' : true,
      added: log?.products_added || 0,
      updated: log?.products_updated || 0,
      deleted: log?.products_deleted || 0,
      time: log?.execution_time_seconds || 0,
      total: count || 0,
      startedAt: log?.started_at || null,
      completedAt: log?.completed_at || null,
    });
  }

  if (results.length === 0) {
    console.log(
      HOURS
        ? `⚠️  No Apify brands have synced in the last ${HOURS}h.`
        : '⚠️  No sync logs found for Apify brands yet.'
    );
    return;
  }

  // Order rows by when each brand was actually synced, reproducing the live
  // run sequence (DB fetch order isn't stable without an explicit ORDER BY).
  results.sort((a, b) => {
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return new Date(a.startedAt) - new Date(b.startedAt);
  });

  // 4. Derive the run window from log timestamps (live "Total time" isn't stored)
  const starts = results.map((r) => r.startedAt).filter(Boolean).sort();
  const ends = results.map((r) => r.completedAt).filter(Boolean).sort();
  const runStart = starts[0] ? new Date(starts[0]) : null;
  const runEnd = ends[ends.length - 1] ? new Date(ends[ends.length - 1]) : null;
  const elapsedSeconds = runStart && runEnd
    ? Math.max(0, Math.floor((runEnd - runStart) / 1000))
    : 0;

  if (AS_JSON) {
    console.log(JSON.stringify({ runStart, runEnd, elapsedSeconds, brands: results }, null, 2));
    return;
  }

  // 5. Print the exact same report the live sync prints at completion
  printSyncReport(results, { elapsedSeconds, reportDate: runEnd || new Date() });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
