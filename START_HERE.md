# 🚀 Start Here - Brand Scraping Setup

## Quick Setup (3 Steps)

### Step 1: Run Database Setup (1 minute)

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy and paste **ALL** of this file: `scripts/COMPLETE_SETUP.sql`
3. Click **Run**

✅ This adds all 22 fashion brands to your database

### Step 2: Install Dependencies (30 seconds)

```bash
npm install
```

### Step 3: Test It Works (30 seconds)

```bash
npm run test-scraper edikted
```

**Expected output:**
```
✅ Found brand: Edikted
✅ Fetched 2500 products in 22s
✅ Valid products: 2500 (100.0%)
🎉 Scraper is working great!
```

---

## Now Start Syncing!

### Sync Your First Brand
```bash
npm run sync-brands edikted
```

**This will:**
- Fetch all Edikted products (2,500+)
- Save them to your database
- Take ~30-60 seconds

### Sync All Brands
```bash
npm run sync-brands
```

**This will:**
- Sync all 22 brands
- Take ~10 minutes
- Add thousands of products

### Sync Only New Arrivals (Recommended)
```bash
npm run sync-brands -- --new-only
```

**This will:**
- Only fetch products from last 30 days
- Much faster (2-3 minutes)
- Better for daily updates

---

## See Products in Your App

### Follow Brands (Run in Supabase SQL Editor)

```sql
-- Get your user ID first
SELECT id, username FROM profiles WHERE email = 'your-email@example.com';

-- Follow all brands (replace <your-user-id> with actual ID)
INSERT INTO user_follows_brands (user_id, brand_id)
SELECT '<your-user-id>'::uuid, id FROM brands
ON CONFLICT DO NOTHING;
```

Now products will appear in your app's home feed! 🎉

---

## Useful Commands

```bash
# Test scraper (no database changes)
npm run test-scraper <brand-slug>

# Sync specific brand
npm run sync-brands <brand-slug>

# Sync all brands
npm run sync-brands

# Sync only new arrivals
npm run sync-brands -- --new-only
```

## Check Results

```sql
-- See how many products per brand
SELECT 
  b.name,
  COUNT(p.id) as products
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
GROUP BY b.name
ORDER BY products DESC;

-- See brand sync stats
SELECT * FROM brand_sync_stats;

-- See recent products
SELECT 
  b.name,
  p.name,
  p.price,
  p.created_at
FROM products p
JOIN brands b ON b.id = p.brand_id
ORDER BY p.created_at DESC
LIMIT 20;
```

---

## Brand List

### ✅ Confirmed Working (9 brands)
Start with these - they work perfectly:
- **Edikted** ⭐ (2,500+ products - BEST FOR TESTING)
- Damson Madder 394
- Miaou 375
- Doen 714
- Design By Si - brand not found
- Steele - didn't work
- DISSH 1690
- Rumored - didn't work
- With Jean - 387
- Rad Swim 225

### 🟡 Needs Testing (2 brands)
Should work but not verified:
- Sisters & Seekers - didn't work
- Handover - didn't work

### 🔴 Requires Apify/Custom (11 brands)
Don't work with basic scraper:
- Free People (blocks scraping)
- Urban Outfitters (blocks scraping)
- Anthropologie (blocks scraping)
- H&M (custom platform)
- Zara (custom platform)
- Aritzia (custom platform)
- Stradivarius (custom platform)
- Altar'd State
- Guizio
- Cult Mia
- Sndys

**See `WORKING_BRANDS.md` for detailed status and solutions**

---

## Troubleshooting

### "Brand not found" error
→ Run `scripts/COMPLETE_SETUP.sql` in Supabase

### "jsdom not found" error
→ Run `npm install`

### No products showing in app
→ Make sure you're following brands (see "Follow Brands" section above)

### Scraper test fails with 404/403 errors
→ Use **Edikted** instead - it's the most reliable
→ Some brands block scraping (Free People, Urban Outfitters, etc.)
→ See `WORKING_BRANDS.md` for confirmed working brands

---

## Next Steps

1. ✅ Set up automation (optional) - see `scripts/setup-brand-sync-cron.sql`
2. ✅ Read full guide - see `BRAND_SCRAPING_GUIDE.md`
3. ✅ Add more brands - see `BRAND_SCRAPING_GUIDE.md` → "Adding New Brands"

---

## Need Help?

- **Full documentation**: `BRAND_SCRAPING_GUIDE.md`
- **Quick reference**: `SCRAPING_QUICK_START.md`
- **Setup guide**: `scripts/SETUP_SCRAPING_SYSTEM.md`

Happy scraping! 🛍️✨
