#!/usr/bin/env node
/**
 * Run Apify Task and Import Results
 * 
 * Triggers an Apify task, waits for completion, and automatically
 * imports the results into the database.
 * 
 * Usage:
 *   node scripts/apify-tasks/run-task.js <task-name-or-id>
 *   node scripts/apify-tasks/run-task.js free-people-weekly-scrape
 *   node scripts/apify-tasks/run-task.js aritzia-weekly-scrape
 */

require('dotenv').config();
const { execSync } = require('child_process');

const taskNameOrId = process.argv[2];

if (!taskNameOrId) {
  console.error('❌ Error: Please provide a task name or ID');
  console.log('\nUsage:');
  console.log('  node scripts/apify-tasks/run-task.js <task-name-or-id>\n');
  console.log('Examples:');
  console.log('  node scripts/apify-tasks/run-task.js free-people-weekly-scrape');
  console.log('  node scripts/apify-tasks/run-task.js aritzia-weekly-scrape');
  process.exit(1);
}

// Map task names to import scripts
const IMPORT_SCRIPTS = {
  'free-people-weekly-scrape': 'scripts/import-free-people-dataset.js',
  'aritzia-weekly-scrape': 'scripts/import-aritzia-dataset.js'
};

async function runTask() {
  console.log(`🚀 Running Apify Task: ${taskNameOrId}\n`);

  try {
    // Trigger the task
    const response = await fetch(`https://api.apify.com/v2/actor-tasks/${taskNameOrId}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    const run = result.data;

    console.log(`✅ Task started: ${run.id}`);
    console.log(`📊 Status: ${run.status}`);
    console.log(`🔗 Monitor: https://console.apify.com/actors/runs/${run.id}\n`);

    // Wait for completion
    console.log('⏳ Waiting for task to complete...');
    const finalRun = await waitForCompletion(run.id);

    console.log(`\n✅ Task completed: ${finalRun.status}`);
    console.log(`⏱️  Duration: ${Math.round(finalRun.stats.runTimeSecs)}s`);
    console.log(`💰 Cost: $${finalRun.usageTotalUsd?.toFixed(4) || '0.00'}\n`);

    // Get dataset ID
    const datasetId = finalRun.defaultDatasetId;
    console.log(`📦 Dataset ID: ${datasetId}`);

    // Check item count
    const datasetInfo = await getDatasetInfo(datasetId);
    console.log(`📊 Products scraped: ${datasetInfo.itemCount}\n`);

    if (datasetInfo.itemCount === 0) {
      console.log('⚠️  No products found. The scrape may have failed.');
      console.log('   Check the run logs in Apify Console for details.');
      return;
    }

    // Auto-import if we have an import script for this task
    const importScript = IMPORT_SCRIPTS[taskNameOrId];
    if (importScript) {
      console.log('🔄 Auto-importing results...\n');
      try {
        execSync(`node ${importScript} ${datasetId}`, { stdio: 'inherit' });
      } catch (error) {
        console.error('❌ Import failed. You can manually import with:');
        console.log(`   node ${importScript} ${datasetId}`);
      }
    } else {
      console.log('💡 To import the results, run:');
      console.log(`   node scripts/import-<brand>-dataset.js ${datasetId}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function waitForCompletion(runId, maxWaitTime = 3600000) {
  const startTime = Date.now();
  const pollInterval = 10000; // Check every 10 seconds

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`
      }
    });

    const result = await response.json();
    const run = result.data;

    if (run.status === 'SUCCEEDED') {
      return run;
    } else if (run.status === 'FAILED' || run.status === 'ABORTED' || run.status === 'TIMED-OUT') {
      throw new Error(`Task ${run.status.toLowerCase()}`);
    }

    // Still running, wait and check again
    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timeout - exceeded maximum wait time');
}

async function getDatasetInfo(datasetId) {
  const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`
    }
  });

  const result = await response.json();
  return result.data;
}

runTask();
