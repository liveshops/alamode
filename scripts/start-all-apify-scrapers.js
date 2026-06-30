#!/usr/bin/env node
/**
 * Start All Apify Scrapers
 *
 * Fires (starts) the Apify task for every active brand that has an
 * `apify_task_id` configured in its scraper_config. This is "fire-and-forget":
 * it triggers each run and returns immediately WITHOUT waiting for completion.
 *
 * The companion script `sync-all-apify-brands.js` should be run ~40 min later
 * to import the freshly-scraped datasets into Supabase.
 *
 * Usage:
 *   node scripts/start-all-apify-scrapers.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function startTask(taskId) {
  const response = await fetch(
    `https://api.apify.com/v2/actor-tasks/${taskId}/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${response.status} ${response.statusText} - ${error}`);
  }

  const result = await response.json();
  return result.data; // { id, status, ... }
}

async function startAllApifyScrapers() {
  console.log('🚀 Starting All Apify Scrapers\n');
  console.log('='.repeat(60));

  if (!process.env.APIFY_API_TOKEN) {
    console.error('❌ APIFY_API_TOKEN missing from environment (.env)');
    process.exit(1);
  }

  // Fetch all active brands
  const { data: brands, error } = await supabase
    .from('brands')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('❌ Error fetching brands:', error.message);
    process.exit(1);
  }

  // Keep only brands that have an Apify task configured
  const apifyBrands = brands.filter((brand) => {
    const config = brand.scraper_config || {};
    return config.apify_task_id;
  });

  if (apifyBrands.length === 0) {
    console.log('⚠️  No brands with apify_task_id found');
    return;
  }

  console.log(`\n📋 Found ${apifyBrands.length} Apify brands to start:\n`);
  apifyBrands.forEach((brand, i) => {
    console.log(`   ${i + 1}. ${brand.name} (${brand.slug})`);
  });
  console.log('\n' + '='.repeat(60) + '\n');

  const results = [];

  // Fire each task (no waiting for completion)
  for (let i = 0; i < apifyBrands.length; i++) {
    const brand = apifyBrands[i];
    const taskId = brand.scraper_config.apify_task_id;

    process.stdout.write(`[${i + 1}/${apifyBrands.length}] ${brand.name} ... `);

    try {
      const run = await startTask(taskId);
      console.log(`✅ started (run ${run.id})`);
      results.push({ brand: brand.name, slug: brand.slug, success: true, runId: run.id });
    } catch (err) {
      console.log(`❌ failed: ${err.message}`);
      results.push({ brand: brand.name, slug: brand.slug, success: false, error: err.message });
    }
  }

  const started = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log('\n' + '='.repeat(60));
  console.log('🎉 START COMPLETE');
  console.log('='.repeat(60));
  console.log(`   ✅ Scrapers started: ${started}`);
  console.log(`   ❌ Failed to start:  ${failed}`);

  if (failed > 0) {
    console.log('\n⚠️  Failed to start:');
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(`   - ${r.brand} (${r.slug}): ${r.error}`));
  }

  console.log(
    '\n💡 Scrapers are now running on Apify. Run the sync ~40 min from now:'
  );
  console.log('   node scripts/sync-all-apify-brands.js\n');

  // Non-zero exit if every single start failed (lets launchd/cron flag the run)
  if (started === 0 && failed > 0) {
    process.exit(1);
  }
}

startAllApifyScrapers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
