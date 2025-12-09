# Apify Tasks Workflow

Automated scheduled scraping for premium brands using Apify Tasks.

## 🎯 What are Apify Tasks?

Tasks are pre-configured actor runs that can be:
- ⏰ **Scheduled** to run automatically (e.g., weekly)
- 🔄 **Triggered** via API or manually
- 💾 **Saved** with all input configuration
- 📊 **Monitored** with run history and stats

## 🚀 Quick Start

### 1. Create Tasks

Create a task for each brand you want to scrape:

```bash
# Create Free People task
node scripts/apify-tasks/create-free-people-task.js

# Create Aritzia task
node scripts/apify-tasks/create-aritzia-task.js
```

### 2. Set Up Schedules

After creating tasks, set up schedules in the [Apify Console](https://console.apify.com/tasks):

**Recommended Schedules:**
- **Free People**: Every Sunday at 2 AM UTC
  - Cron: `0 2 * * 0`
  - Cost: ~$0.68/run = ~$2.72/month

- **Aritzia**: Every Monday at 2 AM UTC
  - Cron: `0 2 * * 1`
  - Cost: ~$1.00/run = ~$4.00/month

### 3. Run Tasks Manually

Trigger a task run and auto-import results:

```bash
# Run Free People task
node scripts/apify-tasks/run-task.js free-people-weekly-scrape

# Run Aritzia task
node scripts/apify-tasks/run-task.js aritzia-weekly-scrape
```

The script will:
1. ✅ Trigger the task
2. ⏳ Wait for completion
3. 📊 Show stats (products scraped, cost, duration)
4. 🔄 Auto-import results into database

### 4. View All Tasks

```bash
node scripts/apify-tasks/list-tasks.js
```

## 📁 File Structure

```
scripts/apify-tasks/
├── README.md                      # This file
├── create-free-people-task.js     # Create Free People task
├── create-aritzia-task.js         # Create Aritzia task
├── list-tasks.js                  # List all tasks
└── run-task.js                    # Run task + auto-import
```

## 🔄 Complete Workflow

### Option A: Fully Automated (Recommended)

1. Create tasks (one-time setup)
2. Set schedules in Apify Console
3. Tasks run automatically every week
4. Check Apify Console for results
5. Import manually when ready:
   ```bash
   node scripts/import-free-people-dataset.js <dataset_id>
   ```

### Option B: Manual Trigger with Auto-Import

```bash
# Single command: scrape + import
node scripts/apify-tasks/run-task.js free-people-weekly-scrape
```

### Option C: Separate Scrape & Import

```bash
# 1. Trigger scrape via API
curl -X POST "https://api.apify.com/v2/actor-tasks/free-people-weekly-scrape/runs" \
  -H "Authorization: Bearer $APIFY_API_TOKEN"

# 2. Get dataset ID from Apify Console or API response

# 3. Import results
node scripts/import-free-people-dataset.js <dataset_id>
```

## 💰 Cost Breakdown

| Brand | Products | Cost/Run | Weekly | Monthly |
|-------|----------|----------|--------|---------|
| Free People | ~500 | $0.68 | $0.68 | $2.72 |
| Aritzia | ~300 | $1.00 | $1.00 | $4.00 |
| **Total** | **~800** | **$1.68** | **$1.68** | **$6.72** |

**Annual Cost: ~$80** for premium brand coverage

## 🛠️ Task Configuration

Each task is configured with:

```javascript
{
  actId: 'apify/e-commerce-scraping-tool',
  name: 'brand-weekly-scrape',
  input: {
    listingUrls: [
      { url: 'https://brand.com/new-arrivals' },
      { url: 'https://brand.com/category' }
    ],
    scrapeMode: 'AUTO',
    additionalProperties: true,
    proxyConfiguration: {
      useApifyProxy: true
    }
  },
  options: {
    memoryMbytes: 2048,
    timeoutSecs: 3600  // 1 hour max
  }
}
```

## 🔔 Monitoring

### View Task Status
```bash
node scripts/apify-tasks/list-tasks.js
```

### View in Apify Console
- Tasks: https://console.apify.com/tasks
- Runs: https://console.apify.com/actors/runs
- Datasets: https://console.apify.com/storage/datasets

### Check Last Run
```bash
curl "https://api.apify.com/v2/actor-tasks/free-people-weekly-scrape" \
  -H "Authorization: Bearer $APIFY_API_TOKEN" | jq '.data.stats'
```

## 📊 Adding New Brands

To add a new Apify-scraped brand:

1. **Create task creation script:**
   ```bash
   cp scripts/apify-tasks/create-free-people-task.js \
      scripts/apify-tasks/create-[brand]-task.js
   ```

2. **Update configuration:**
   - Task name: `brand-weekly-scrape`
   - URLs: Update `listingUrls` for the brand
   - Schedule: Choose a different day

3. **Create import script:**
   ```bash
   cp scripts/import-free-people-dataset.js \
      scripts/import-[brand]-dataset.js
   ```

4. **Update brand in database:**
   - Add brand with `platform: 'custom'`
   - Set `scraper_config.type: 'apify-ecommerce'`

5. **Create task and schedule:**
   ```bash
   node scripts/apify-tasks/create-[brand]-task.js
   ```

## 🚨 Troubleshooting

### Task Fails
- Check Apify Console logs
- Verify URLs are accessible
- Check if site structure changed
- Increase timeout if needed

### No Products Scraped
- Site may have changed structure
- Try different URLs
- Check Cloudflare protection level
- Review actor logs in Console

### Import Fails
- Verify dataset ID is correct
- Check brand exists in database
- Review product validation errors
- Check Supabase connection

## 💡 Best Practices

1. **Stagger schedules** - Don't run all tasks at same time
2. **Monitor costs** - Check Apify usage dashboard
3. **Test first** - Run manually before scheduling
4. **Keep URLs updated** - Sites change their structure
5. **Review logs** - Check for errors regularly

## 🔗 Useful Links

- [Apify Tasks API](https://docs.apify.com/api/v2#/reference/actor-tasks)
- [E-commerce Scraper](https://apify.com/apify/e-commerce-scraping-tool)
- [Apify Console](https://console.apify.com)
- [Cron Schedule Helper](https://crontab.guru/)
