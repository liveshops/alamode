-- Setup Automated Brand Syncing with pg_cron
-- This sets up scheduled jobs to automatically sync products from brands

-- Enable pg_cron extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant permissions to run cron jobs
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a function to trigger product sync via webhook/edge function
-- This assumes you have a Supabase Edge Function or webhook endpoint set up

-- Schedule: Sync all brands daily at 2 AM UTC
SELECT cron.schedule(
  'sync-all-brands-daily',
  '0 2 * * *', -- Every day at 2 AM UTC
  $$
  SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/sync-brands',
    headers:='{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body:='{"mode": "all"}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule: Sync high-priority brands every 6 hours
SELECT cron.schedule(
  'sync-priority-brands',
  '0 */6 * * *', -- Every 6 hours
  $$
  SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/sync-brands',
    headers:='{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body:='{"mode": "priority", "brands": ["zara", "hm", "aritzia", "free-people"]}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule: New arrivals check every 2 hours for popular brands
SELECT cron.schedule(
  'sync-new-arrivals',
  '0 */2 * * *', -- Every 2 hours
  $$
  SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/sync-brands',
    headers:='{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body:='{"mode": "new-only", "brands": ["zara", "hm", "urban-outfitters", "free-people"]}'::jsonb
  ) AS request_id;
  $$
);

-- View all scheduled jobs
SELECT * FROM cron.job;

-- View job run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Unschedule a job (if needed)
-- SELECT cron.unschedule('sync-all-brands-daily');

-- Alternative: If not using Supabase Edge Functions, you can use GitHub Actions
-- or a simple cron job on your server to run: node scripts/sync-all-brands.js

/*
GITHUB ACTIONS ALTERNATIVE:
Create .github/workflows/sync-brands.yml:

name: Sync Brand Products
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:      # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: node scripts/sync-all-brands.js
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
*/

-- Monitor sync performance
CREATE OR REPLACE VIEW brand_sync_stats AS
SELECT 
  b.name,
  b.slug,
  b.last_synced_at,
  COUNT(DISTINCT p.id) as total_products,
  COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN p.id END) as products_last_7_days,
  COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '1 day' THEN p.id END) as products_last_24h,
  (SELECT COUNT(*) FROM product_scrape_logs WHERE brand_id = b.id AND status = 'success') as successful_syncs,
  (SELECT COUNT(*) FROM product_scrape_logs WHERE brand_id = b.id AND status = 'failed') as failed_syncs,
  (SELECT MAX(completed_at) FROM product_scrape_logs WHERE brand_id = b.id) as last_sync_completed
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
WHERE b.is_active = true
GROUP BY b.id, b.name, b.slug, b.last_synced_at
ORDER BY b.name;

-- View sync stats
SELECT * FROM brand_sync_stats;
