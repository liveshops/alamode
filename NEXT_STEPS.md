# Next Steps: Adding Test Data

Great work! Your Supabase backend is almost ready. Here's what to do next:

## Step 1: Get Your Service Role Key

The test data scripts need admin access to insert products.

1. **Go to** Supabase Dashboard → Settings → API
2. **Find** the "service_role" key (NOT the anon key - it's further down the page)
3. **Copy it** and add to your `.env` file:
   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cC...
   ```

⚠️ **WARNING**: This key has admin access. Keep it secret!

## Step 2: Add Test Products

```bash
node scripts/add-test-products-admin.js
```

This creates 6 products with placeholder images (one from each brand).

## Step 3: Set Up Test User

```bash
node scripts/setup-test-user.js
```

This makes `klshumway` follow Free People, REVOLVE, and Motel Rocks so they have products in their feed.

## Step 4: (Optional) Add Real Product Images

Want real product images instead of placeholders?

### Quick Method:
1. Find 6 product images from brand websites
2. Save them to `product-images/` folder with these names:
   - `fp-001.jpg` (Free People)
   - `rev-001.jpg` (REVOLVE)  
   - `motel-001.jpg` (Motel Rocks)
   - `zara-001.jpg` (ZARA)
   - `uo-001.jpg` (Urban Outfitters)
   - `anthro-001.jpg` (Anthropologie)

3. Run:
   ```bash
   node scripts/upload-product-images.js
   ```

### Need Help Finding Images?
Send me product URLs or screenshots and I can:
- Extract product details
- Update the product data
- Help you organize the images

## Step 5: Verify Everything

```bash
npm run test-supabase
```

Should show:
- ✅ 8 brands
- ✅ 6 products  
- ✅ Test user has 3 brand follows
- ✅ All tables accessible

## All Set? Time to Build! 🚀

Once your test data is ready, we can start building:
1. **Authentication screens** (login/signup)
2. **Home feed** showing products
3. **Product details** page
4. **Search & discovery**
5. **User profiles**

Let me know when you're ready or if you need help with the test data!
