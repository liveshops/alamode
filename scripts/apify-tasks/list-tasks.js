#!/usr/bin/env node
/**
 * List all Apify Tasks
 * 
 * Shows all configured tasks with their schedules and last run info
 */

require('dotenv').config();

async function listTasks() {
  console.log('📋 Listing Apify Tasks...\n');

  try {
    const response = await fetch(`https://api.apify.com/v2/actor-tasks?token=${process.env.APIFY_API_TOKEN}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    const tasks = result.data.items;

    if (tasks.length === 0) {
      console.log('No tasks found. Create one with:');
      console.log('  node scripts/apify-tasks/create-free-people-task.js');
      console.log('  node scripts/apify-tasks/create-aritzia-task.js');
      return;
    }

    console.log(`Found ${tasks.length} task(s):\n`);

    for (const task of tasks) {
      console.log(`📦 ${task.title || task.name}`);
      console.log(`   ID: ${task.id}`);
      console.log(`   Name: ${task.name}`);
      console.log(`   Actor: ${task.actId}`);
      
      if (task.stats) {
        const lastRun = task.stats.lastRunAt ? new Date(task.stats.lastRunAt).toLocaleString() : 'Never';
        console.log(`   Last Run: ${lastRun}`);
        console.log(`   Total Runs: ${task.stats.totalRuns || 0}`);
      }
      
      console.log(`   View: https://console.apify.com/tasks/${task.id}`);
      console.log('');
    }

    console.log('💡 To run a task:');
    console.log('  node scripts/apify-tasks/run-task.js <task-name>');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listTasks();
