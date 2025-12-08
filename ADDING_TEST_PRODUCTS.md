# Adding Real Test Products

Follow these steps to populate your database with real product images and data.

## Option 1: Quick Start with Placeholder Images (Done!)

Run this to add products with placeholder images:
```bash
node scripts/add-test-products.js
```

This creates 6 products across different brands with placeholder images.

## Option 2: Add Real Product Images

### Step 1: Download Product Images

1. Visit brand websites and find product images
2. Right-click and save images (or screenshot)
3. **Recommended brands for testing:**
   - Free People: https://www.freepeople.com/whats-new
   - REVOLVE: https://www.revolve.com/new-arrivals
   - Motel Rocks: https://us.motelrocks.com/collections/new-in
   - ZARA: https://www.zara.com/us/en/woman-new-in-l1180.html
   - Urban Outfitters: https://www.urbanoutfitters.com/womens-new-arrivals
   - Anthropologie: https://www.anthropologie.com/new-arrivals

### Step 2: Prepare Images

1. **Create folder**: `product-images/` in your project root
2. **Name images** to match external IDs:
   - `fp-001.jpg` (Free People)
   - `rev-001.jpg` (REVOLVE)
   - `motel-001.jpg` (Motel Rocks)
   - `zara-001.jpg` (ZARA)
   - `uo-001.jpg` (Urban Outfitters)
   - `anthro-001.jpg` (Anthropologie)

3. **Image specs** (recommended):
   - Format: JPG, PNG, or WebP
   - Min size: 600x800px
   - Max file size: 5MB
   - Aspect ratio: 3:4 (portrait)

### Step 3: Upload to Supabase Storage

```bash
node scripts/upload-product-images.js
```

This will:
- Upload all images from `product-images/` folder
- Store them in the `product-images` bucket
- Automatically update database with new URLs

### Step 4: Verify

```bash
npm run test-supabase
```

Should show 6 products with real image URLs!

## Option 3: Manual Entry via Supabase Dashboard

1. Go to Supabase Dashboard → Table Editor → products
2. Click on a product row to edit
3. Update these fields:
   - `name`: Real product name
   - `description`: Product description
   - `price`: Actual price
   - `image_url`: Full URL to product image
   - `product_url`: Link to product on brand website

## Tips for Finding Product Data

### Free People
- URL: `https://www.freepeople.com/shop/[product-name]`
- Images: Right-click main image → "Copy image address"
- Price: Usually $50-$200

### REVOLVE  
- URL: `https://www.revolve.com/[brand]-[product-name]`
- Images: High quality, click to zoom then save
- Price: Usually $80-$300

### Motel Rocks
- URL: `https://us.motelrocks.com/products/[product-name]`
- Images: Clean white background
- Price: Usually $40-$100

### ZARA
- URL: `https://www.zara.com/us/en/[product-name]`
- Images: Editorial style
- Price: Usually $30-$100

### Urban Outfitters
- URL: `https://www.urbanoutfitters.com/shop/[product-name]`
- Images: Lifestyle shots
- Price: Usually $40-$150

### Anthropologie
- URL: `https://www.anthropologie.com/shop/[product-name]`
- Images: Artistic, detailed
- Price: Usually $80-$200

## Example: Adding a Real Product

Let's say you want to add this Free People dress:
- **Product**: "Adella Maxi Dress"
- **URL**: https://www.freepeople.com/shop/adella-maxi-dress
- **Price**: $128
- **Image**: (right-click and save as `fp-001.jpg`)

1. Save image to `product-images/fp-001.jpg`
2. Run: `node scripts/upload-product-images.js`
3. Edit `scripts/add-test-products.js` to update the product details
4. Run: `node scripts/add-test-products.js`

Done! ✅

## Storage Bucket URLs

Your product images will be accessible at:
```
https://oeztavlkbkxhcpjkdxry.supabase.co/storage/v1/object/public/product-images/[filename]
```

Example:
```
https://oeztavlkbkxhcpjkdxry.supabase.co/storage/v1/object/public/product-images/fp-001.jpg
```

## Need Help?

If you send me product URLs or images, I can help you:
1. Extract product details
2. Format the data correctly
3. Generate the insert scripts
