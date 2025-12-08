# Quick Guide: Add Product with Real Image

## Step 1: Download Product Image

1. Go to the product page: https://www.freepeople.com/shop/we-the-free-nikita-romper/
2. Right-click on the main product image
3. Select "Save Image As..."
4. Save it as `nikita-romper.jpg` to your Downloads folder

## Step 2: Upload to Supabase Storage

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click **Storage** in the left sidebar
4. Click on the **product-images** bucket
5. Click **Upload** button
6. Create a folder called `products` (if it doesn't exist)
7. Click into the `products` folder
8. Upload `nikita-romper.jpg`
9. Once uploaded, click on the file
10. Copy the **Public URL** (should look like: `https://oeztavlkbkxhcpjkdxry.supabase.co/storage/v1/object/public/product-images/products/nikita-romper.jpg`)

## Step 3: Add Product to Database

Run this command with your copied URL:

```bash
node scripts/add-product-simple.js
```

Then when prompted, paste the public URL from Supabase.

---

## Even Faster: Use Imgur or Direct URLs

For testing, you can also use:
- Upload to Imgur.com (free, no account needed)
- Use any publicly accessible image URL
- The script will accept any HTTPS URL

---

## Alternative: I'll Create Test Images

Want me to create a script that uses placeholder images that look real? They'll be:
- Proper aspect ratio (3:4 for fashion)
- Nice colors
- Product names overlaid
- Actually load in the app ✅

Let me know!
