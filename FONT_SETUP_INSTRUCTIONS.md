# Font Setup - Albra Display Light

## ✅ What I Just Did

1. **Removed 50 product limit** - Your home feed now loads ALL products with endless scroll
2. **Set up custom font infrastructure** - App is configured to use Albra Display Light
3. **Updated logo styling** - "a la Mode" logo will use the custom font once you add the file

## 🎨 To Complete Font Setup

### Step 1: Get the Albra Display Light Font File

**Option A: Download from Fontshare (Recommended)**
1. Go to: https://www.fontshare.com/fonts/albra
2. Click "Download family" 
3. Extract the ZIP file
4. Find: `AlbraDisplay-Light.ttf` (or the light weight variant)

**Option B: If You Already Have It**
- Locate your `AlbraDisplay-Light.ttf` or `.otf` file

### Step 2: Add Font to Your Project

1. **Copy the font file** to: 
   ```
   /Users/imacpro/new1/assets/fonts/AlbraDisplay-Light.ttf
   ```

2. **Make sure the filename is exactly:** `AlbraDisplay-Light.ttf`
   - Case sensitive!
   - Must match what's in the code

### Step 3: Uncomment Font Loading Code

**In `/app/_layout.tsx`:**
1. Uncomment lines 4-6 (imports)
2. Uncomment line 9 (SplashScreen)
3. Uncomment lines 13-27 (font loading code)

**In `/app/(tabs)/index.tsx`:**
1. Line 106: Change `fontFamily: 'System'` to `fontFamily: 'AlbraDisplay-Light'`
2. Remove line 108: `fontWeight: '200'` (not needed with custom font)

### Step 4: Restart Expo

```bash
# Stop your Expo dev server (press Ctrl+C in terminal)
# Clear cache and restart:
npm start --clear
```

### Step 5: Test in App

- Open your app
- You should see "a la Mode" in the Albra Display Light font
- If you see an error, the font file might not be in the right location

---

## 🔍 Troubleshooting

### Error: "fontFamily 'AlbraDisplay-Light' is not a system font"

**Solution:** Font file is missing or misnamed
1. Check file exists at: `assets/fonts/AlbraDisplay-Light.ttf`
2. Verify exact spelling and case
3. Make sure it's a `.ttf` or `.otf` file (not `.woff` or other web formats)
4. Restart Expo with `npm start --clear`

### Font Looks Different Than Expected

**Check these:**
- Make sure you're using the **Light** weight variant (not Regular, Bold, etc.)
- Albra Display has multiple weights - you want the lightest one
- File should be named `AlbraDisplay-Light.ttf`

### Can't Find/Download the Font

**Use a free alternative:**
1. Download **Outfit Light** from Google Fonts
2. Rename to: `AlbraDisplay-Light.ttf` 
3. Place in `assets/fonts/`
4. Very similar aesthetic!

---

## 📝 Notes

- The font is currently only used for the "a la Mode" logo
- You can use it elsewhere by setting `fontFamily: 'AlbraDisplay-Light'` in any style
- Light weight gives that elegant, minimalist fashion brand aesthetic

---

## ✅ Changes Made to Code

1. **`/hooks/useProducts.ts`** - Removed `.limit(50)` on line 74
2. **`/app/_layout.tsx`** - Added font loading with `useFonts()` hook
3. **`/app/(tabs)/index.tsx`** - Updated logo to use `fontFamily: 'AlbraDisplay-Light'`
4. **`/assets/fonts/`** - Created fonts directory

Once you add the font file, everything will work automatically! 🎨
