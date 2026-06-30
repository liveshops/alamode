#!/usr/bin/env node
/**
 * Daily Apify Sync Orchestrator
 *
 * Runs the full daily pipeline in one process:
 *   1. Start every Apify scraper        (scripts/start-all-apify-scrapers.js)
 *   2. Wait ~40 minutes for them to run  (configurable)
 *   3. Sync the scraped data to Supabase (scripts/sync-all-apify-brands.js)
 *
 * This is the script that the launchd job (or any cron) should invoke once a day.
 *
 * Usage:
 *   node scripts/daily-apify-sync.js
 *   WAIT_MINUTES=1 node scripts/daily-apify-sync.js   # quick end-to-end test
 *
 * Environment:
 *   WAIT_MINUTES  Minutes to wait between starting scrapers and syncing.
 *                 Defaults to 40. Set to 0 to skip the wait entirely.
 */

require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');

const WAIT_MINUTES = process.env.WAIT_MINUTES !== undefined
  ? Number(process.env.WAIT_MINUTES)
  : 40;

const SCRIPTS_DIR = __dirname;

function stamp() {
  return new Date().toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

function runScript(file) {
  const fullPath = path.join(SCRIPTS_DIR, file);
  console.log(`\n▶️  [${stamp()}] node ${file}\n`);

  const result = spawnSync(process.execPath, [fullPath], {
    stdio: 'inherit',
    cwd: path.resolve(SCRIPTS_DIR, '..'),
    env: process.env,
  });

  if (result.error) {
    throw new Error(`Failed to launch ${file}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${file} exited with code ${result.status}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(60));
  console.log(`🗓️  DAILY APIFY SYNC — started ${stamp()}`);
  console.log(`⏲️  Wait between start & sync: ${WAIT_MINUTES} min`);
  console.log('='.repeat(60));

  // Step 1: start all scrapers
  runScript('start-all-apify-scrapers.js');

  // Step 2: wait for scrapers to finish on Apify
  if (WAIT_MINUTES > 0) {
    const readyAt = new Date(Date.now() + WAIT_MINUTES * 60 * 1000);
    console.log(
      `\n⏳ [${stamp()}] Waiting ${WAIT_MINUTES} min — sync will start ~${readyAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}\n`
    );
    await sleep(WAIT_MINUTES * 60 * 1000);
  } else {
    console.log('\n⏩ WAIT_MINUTES=0 — skipping wait, syncing immediately\n');
  }

  // Step 3: sync scraped data into Supabase
  runScript('sync-all-apify-brands.js');

  console.log('\n' + '='.repeat(60));
  console.log(`✅ DAILY APIFY SYNC — finished ${stamp()}`);
  console.log('='.repeat(60) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n❌ [${stamp()}] Daily sync failed:`, err.message);
    process.exit(1);
  });
