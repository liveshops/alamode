#!/usr/bin/env node
/**
 * Create Apify Task for Aritzia
 * 
 * Creates a scheduled task that will automatically scrape Aritzia
 * products on a regular basis.
 */

require('dotenv').config();

const TASK_CONFIG = {
  actId: 'apify/e-commerce-scraping-tool',
  name: 'aritzia-weekly-scrape',
  title: 'Aritzia - Weekly Product Scrape',
  description: 'Scrapes new arrivals and popular categories from Aritzia',
  input: {
    listingUrls: [
      { url: 'https://www.aritzia.com/us/en/clothing/new-arrivals' },
      { url: 'https://www.aritzia.com/us/en/clothing/dresses' },
      { url: 'https://www.aritzia.com/us/en/clothing/tops' },
      { url: 'https://www.aritzia.com/us/en/clothing/sweaters' },
      { url: 'https://www.aritzia.com/us/en/clothing/pants' }
    ],
    scrapeMode: 'AUTO',
    additionalProperties: true,
    additionalReviewProperties: false,
    scrapeInfluencerProducts: false,
    proxyConfiguration: {
      useApifyProxy: true
    }
  },
  options: {
    build: 'latest',
    memoryMbytes: 2048,
    timeoutSecs: 3600
  }
};

async function createTask() {
  console.log('🚀 Creating Aritzia Apify Task...\n');

  try {
    const response = await fetch('https://api.apify.com/v2/actor-tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`
      },
      body: JSON.stringify(TASK_CONFIG)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    const task = result.data;

    console.log('✅ Task created successfully!\n');
    console.log('📋 Task Details:');
    console.log(`   Task ID: ${task.id}`);
    console.log(`   Name: ${task.name}`);
    console.log(`   Title: ${task.title}`);
    console.log(`   View: https://console.apify.com/tasks/${task.id}\n`);

    console.log('💡 Next Steps:');
    console.log('   1. Set up schedule in Apify Console (e.g., weekly on Mondays)');
    console.log('   2. Or run manually: node scripts/apify-tasks/run-task.js aritzia-weekly-scrape');
    console.log('   3. Import results: node scripts/import-aritzia-dataset.js <dataset_id>\n');

    console.log('⏰ Recommended Schedule:');
    console.log('   Cron: "0 2 * * 1" (Every Monday at 2 AM UTC)');
    console.log('   Cost: ~$1.00 per run = ~$4.00/month\n');

    return task;
  } catch (error) {
    console.error('❌ Error creating task:', error.message);
    process.exit(1);
  }
}

createTask();
