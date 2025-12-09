#!/usr/bin/env node
/**
 * Create Apify Task for Free People
 * 
 * Creates a scheduled task that will automatically scrape Free People
 * products on a regular basis.
 */

require('dotenv').config();

const TASK_CONFIG = {
  actId: 'apify/e-commerce-scraping-tool',
  name: 'free-people-weekly-scrape',
  title: 'Free People - Weekly Product Scrape',
  description: 'Scrapes new arrivals and popular categories from Free People',
  input: {
    listingUrls: [
      { url: 'https://www.freepeople.com/new-clothes/' },
      { url: 'https://www.freepeople.com/womens-clothes/' },
      { url: 'https://www.freepeople.com/dresses/' },
      { url: 'https://www.freepeople.com/tops/' },
      { url: 'https://www.freepeople.com/bottoms/' }
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
  console.log('🚀 Creating Free People Apify Task...\n');

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
    console.log('   1. Set up schedule in Apify Console (e.g., weekly on Sundays)');
    console.log('   2. Or run manually: node scripts/apify-tasks/run-task.js free-people-weekly-scrape');
    console.log('   3. Import results: node scripts/import-free-people-dataset.js <dataset_id>\n');

    console.log('⏰ Recommended Schedule:');
    console.log('   Cron: "0 2 * * 0" (Every Sunday at 2 AM UTC)');
    console.log('   Cost: ~$0.68 per run = ~$2.72/month\n');

    return task;
  } catch (error) {
    console.error('❌ Error creating task:', error.message);
    process.exit(1);
  }
}

createTask();
